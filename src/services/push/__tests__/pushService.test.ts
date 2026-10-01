import AsyncStorage from '@react-native-async-storage/async-storage';

import { env } from '../../../config/env';
import { deviceTokenApi } from '../../../features/notifications/api';
import { useSessionStore } from '../../../features/auth/store/sessionStore';
import { usePreferencesStore } from '../../../features/settings/store/preferencesStore';
import { useOutboxStore } from '../../outbox/outboxStore';
import { registerDevice, unregisterDevice } from '../pushService';
import { usePushStatusStore } from '../pushStatusStore';

/**
 * Push registration/unregistration policy.
 *
 * The service never blocks the app, but it must stay **honest**: a failed registration
 * is surfaced, an invalid token is discarded (not retried forever), and an unregister
 * that could not reach the server is queued — while the local FCM token is still
 * deleted, which is the part that protects a shared device.
 */

jest.mock('../../../features/notifications/api', () => ({
    deviceTokenApi: { register: jest.fn(), unregister: jest.fn() },
}));

jest.mock('@react-native-firebase/messaging', () => {
    const subscribe = () => jest.fn(() => jest.fn());

    return {
        __esModule: true,
        default: { app: {} },
        getMessaging: jest.fn(() => ({ app: { name: '[DEFAULT]' } })),
        getToken: jest.fn(() => Promise.resolve('raw-token')),
        deleteToken: jest.fn(() => Promise.resolve(true)),
        requestPermission: jest.fn(() => Promise.resolve(1)),
        hasPermission: jest.fn(() => Promise.resolve(1)),
        isDeviceRegisteredForRemoteMessages: jest.fn(() => Promise.resolve(true)),
        registerDeviceForRemoteMessages: jest.fn(() => Promise.resolve()),
        getInitialNotification: jest.fn(() => Promise.resolve(null)),
        setBackgroundMessageHandler: jest.fn(),
        onMessage: subscribe,
        onNotificationOpenedApp: subscribe,
        onTokenRefresh: subscribe,
    };
});

const messaging = jest.requireMock('@react-native-firebase/messaging') as {
    getToken: jest.Mock;
    deleteToken: jest.Mock;
};

const mockedRegister = deviceTokenApi.register as jest.MockedFunction<typeof deviceTokenApi.register>;
const mockedUnregister = deviceTokenApi.unregister as jest.MockedFunction<typeof deviceTokenApi.unregister>;

const originalFcm = env.fcm;

beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    useOutboxStore.setState({ entries: [], hydrated: false, isFlushing: false });
    usePushStatusStore.getState().reset();

    (env as { fcm: unknown }).fcm = { enabled: true, androidChannelId: 'staffsaas_default' };

    useSessionStore.setState({ status: 'authenticated-online', user: { id: 7 } as never });
    usePreferencesStore.setState({ pushEnabled: true, isHydrated: true });
    messaging.getToken.mockResolvedValue('raw-token');
});

afterEach(() => {
    (env as { fcm: unknown }).fcm = originalFcm;
});

describe('registerDevice', () => {
    it('marks the device registered on success', async () => {
        mockedRegister.mockResolvedValueOnce(undefined);

        await registerDevice();

        expect(usePushStatusStore.getState().registration).toBe('registered');
    });

    it('queues a retryable failure and reports it as pending', async () => {
        mockedRegister.mockRejectedValueOnce({ kind: 'network', message: 'offline' });

        await registerDevice();

        expect(useOutboxStore.getState().entries.some(e => e.kind === 'push.register')).toBe(true);
        expect(usePushStatusStore.getState().registration).toBe('pending');
    });

    it('discards an invalid token and reports failure rather than looping', async () => {
        mockedRegister.mockRejectedValueOnce({ kind: 'not_found', status: 404, message: 'gone' });

        await registerDevice();

        expect(messaging.deleteToken).toHaveBeenCalled();
        expect(useOutboxStore.getState().entries.some(e => e.kind === 'push.register')).toBe(false);
        expect(usePushStatusStore.getState().registration).toBe('failed');
    });
});

describe('unregisterDevice', () => {
    it('clears the stored token and deletes the local FCM token on success', async () => {
        await AsyncStorage.setItem('@staffsaas/fcm.token.v1', 'fcm:device-token');
        mockedUnregister.mockResolvedValueOnce(undefined);

        await unregisterDevice();

        expect(mockedUnregister).toHaveBeenCalledWith('fcm:device-token');
        expect(messaging.deleteToken).toHaveBeenCalled();
    });

    it('queues the unregister when the server is unreachable, but still deletes the local token', async () => {
        await AsyncStorage.setItem('@staffsaas/fcm.token.v1', 'fcm:device-token');
        mockedUnregister.mockRejectedValueOnce({ kind: 'network', message: 'offline' });

        await unregisterDevice();

        // Queued so the server cleanup completes later...
        expect(useOutboxStore.getState().entries.some(e => e.kind === 'push.unregister')).toBe(true);
        // ...and the local token is gone regardless, so a shared device stops receiving.
        expect(messaging.deleteToken).toHaveBeenCalled();
    });

    it('treats an already-removed token as complete, not a failure', async () => {
        await AsyncStorage.setItem('@staffsaas/fcm.token.v1', 'fcm:device-token');
        mockedUnregister.mockRejectedValueOnce({ kind: 'not_found', status: 404, message: 'gone' });

        await unregisterDevice();

        expect(useOutboxStore.getState().entries.some(e => e.kind === 'push.unregister')).toBe(false);
    });
});

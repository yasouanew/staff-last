import notifee, { EventType } from '@notifee/react-native';

import { env } from '../../../config/env';
import { useSessionStore } from '../../../features/auth/store/sessionStore';
import { usePreferencesStore } from '../../../features/settings/store/preferencesStore';
import { initializePushService } from '../pushService';

/**
 * Foreground delivery.
 *
 * FCM never shows a message while the app is foregrounded, so the service must
 * re-post it through Notifee (a visible heads-up banner) and route a tap on that
 * banner back to the caller. These tests pin both halves of that contract.
 */

type MessageHandler = (message: unknown) => void;
type ForegroundEventHandler = (event: { type: number }) => void;

let onMessageHandler: MessageHandler | undefined;
let onForegroundEventHandler: ForegroundEventHandler | undefined;

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
        onMessage: jest.fn((_messaging: unknown, handler: MessageHandler) => {
            onMessageHandler = handler;

            return jest.fn();
        }),
        onNotificationOpenedApp: subscribe,
        onTokenRefresh: subscribe,
    };
});

const originalFcm = env.fcm;

let cleanup: (() => void) | undefined;

beforeEach(async () => {
    jest.clearAllMocks();
    onMessageHandler = undefined;
    onForegroundEventHandler = undefined;

    (env as { fcm: unknown }).fcm = { enabled: true, androidChannelId: 'staffsaas_default' };

    useSessionStore.setState({ status: 'authenticated-online', user: { id: 7 } as never });
    usePreferencesStore.setState({ pushEnabled: true, isHydrated: true });

    // Capture the Notifee foreground-event handler the service registers.
    (notifee.onForegroundEvent as jest.Mock).mockImplementation((handler: ForegroundEventHandler) => {
        onForegroundEventHandler = handler;

        return jest.fn();
    });

    cleanup = await initializePushService({ onNotificationOpened: jest.fn() });
});

afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    (env as { fcm: unknown }).fcm = originalFcm;
});

describe('foreground messages', () => {
    it('re-posts the message as a visible notification on the configured channel', async () => {
        onMessageHandler?.({
            messageId: 'm1',
            data: { type: 'roster.published', title: 'Roster published', body: 'Your roster is ready.' },
            notification: { title: 'Roster published', body: 'Your roster is ready.' },
        });

        // The display call is fire-and-forget; let the microtask queue drain.
        await Promise.resolve();

        expect(notifee.displayNotification).toHaveBeenCalledTimes(1);

        const arg = (notifee.displayNotification as jest.Mock).mock.calls[0][0];

        expect(arg.title).toBe('Roster published');
        expect(arg.body).toBe('Your roster is ready.');
        expect(arg.android.channelId).toBe('staffsaas_default');
        expect(arg.android.pressAction).toEqual({ id: 'default' });
        // The tap handler needs the same stable id the inbox row uses.
        expect(typeof arg.data.localId).toBe('string');
    });
});

describe('foreground notification taps', () => {
    it('routes a PRESS event to the onNotificationOpened handler', () => {
        const onNotificationOpened = jest.fn();

        // Re-initialise with a spy so we can observe the tap routing.
        cleanup?.();
        cleanup = undefined;

        return initializePushService({ onNotificationOpened }).then(() => {
            onForegroundEventHandler?.({ type: EventType.PRESS });

            expect(onNotificationOpened).toHaveBeenCalledTimes(1);
        });
    });

    it('ignores non-press events', () => {
        const onNotificationOpened = jest.fn();

        cleanup?.();
        cleanup = undefined;

        return initializePushService({ onNotificationOpened }).then(() => {
            onForegroundEventHandler?.({ type: EventType.DISMISSED });

            expect(onNotificationOpened).not.toHaveBeenCalled();
        });
    });
});

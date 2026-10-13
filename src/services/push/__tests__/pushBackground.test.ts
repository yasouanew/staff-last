import notifee from '@notifee/react-native';

import { env } from '../../../config/env';
import { useNotificationInboxStore } from '../../../features/notifications/store';
import { registerBackgroundMessageHandler } from '../pushService';

/**
 * Background delivery.
 *
 * The backend sends a **visible** FCM notification for background/terminated delivery,
 * which the OS renders itself. The handler must therefore persist the content but must
 * **not** re-post it through Notifee — doing so shows the user two notifications for one
 * event. A **data-only** message is not rendered by the OS, so the handler posts it.
 */

type BackgroundHandler = (message: unknown) => Promise<void>;

let backgroundHandler: BackgroundHandler | undefined;

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
        setBackgroundMessageHandler: jest.fn((_messaging: unknown, handler: BackgroundHandler) => {
            backgroundHandler = handler;
        }),
        onMessage: subscribe,
        onNotificationOpenedApp: subscribe,
        onTokenRefresh: subscribe,
    };
});

const originalFcm = env.fcm;

describe('registerBackgroundMessageHandler', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        backgroundHandler = undefined;

        (env as { fcm: unknown }).fcm = { enabled: true, androidChannelId: 'staffsaas_default' };

        useNotificationInboxStore.setState({
            items: [],
            hydrated: false,
            // Mark the inbox loaded so `receivePush` does not hydrate from AsyncStorage
            // and leak state between tests; the headless-hydration path has its own test
            // in the store suite.
            loaded: true,
            userId: null,
            synced: false,
            watermark: null,
        });

        registerBackgroundMessageHandler();
    });

    afterEach(() => {
        (env as { fcm: unknown }).fcm = originalFcm;
    });

    it('persists a visible message but does not re-display it (the OS already did)', async () => {
        await backgroundHandler?.({
            messageId: 'm1',
            data: { type: 'roster.published', roster_id: 9 },
            notification: { title: 'Roster published', body: 'Your roster is ready.' },
        });

        expect(useNotificationInboxStore.getState().items).toHaveLength(1);
        expect(notifee.displayNotification).not.toHaveBeenCalled();
    });

    it('persists and displays a data-only message (the OS renders nothing)', async () => {
        await backgroundHandler?.({
            messageId: 'm2',
            data: { type: 'roster.published', roster_id: 9, title: 'Roster published', body: 'Ready.' },
        });

        expect(useNotificationInboxStore.getState().items).toHaveLength(1);
        expect(notifee.displayNotification).toHaveBeenCalledTimes(1);

        const arg = (notifee.displayNotification as jest.Mock).mock.calls[0][0];

        expect(arg.title).toBe('Roster published');
        expect(arg.android.channelId).toBe('staffsaas_default');
    });

    it('is idempotent for repeated delivery of the same notification_id', async () => {
        const message = {
            data: {
                type: 'roster.published',
                roster_id: 9,
                notification_id: 'ntf-9',
                title: 'Roster published',
                body: 'Ready.',
            },
            notification: { title: 'Roster published', body: 'Ready.' },
        };

        // Two deliveries, each with a different FCM messageId (as FCM assigns a fresh
        // one per delivery) but the same canonical backend id.
        await backgroundHandler?.({ ...message, messageId: 'delivery-1' });
        await backgroundHandler?.({ ...message, messageId: 'delivery-2' });

        expect(useNotificationInboxStore.getState().items).toHaveLength(1);
        expect(useNotificationInboxStore.getState().items[0]?.id).toBe('ntf-9');
    });
});

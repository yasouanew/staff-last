/**
 * Jest mock for `@notifee/react-native`.
 *
 * The package resolves to a TurboModule that only exists inside a real native build,
 * so importing it under Jest throws. `pushService` imports it lazily (only on Android,
 * only once push is configured), but a test that exercises `initializePushService` with
 * `FCM_ENABLED` mocked to `true` would still reach it — hence this stub.
 *
 * `createChannel` is the only API this app calls.
 */
const notifee = {
    createChannel: jest.fn(async () => 'staffsaas_default'),
    createChannels: jest.fn(async () => undefined),
    getChannels: jest.fn(async () => []),
    deleteChannel: jest.fn(async () => undefined),
    displayNotification: jest.fn(async () => 'notification-id'),
    cancelAllNotifications: jest.fn(async () => undefined),
    requestPermission: jest.fn(async () => ({ authorizationStatus: 1 })),
    getInitialNotification: jest.fn(async () => null),
    onForegroundEvent: jest.fn(() => () => undefined),
    onBackgroundEvent: jest.fn(),
    AndroidImportance: {
        MIN: 1,
        LOW: 2,
        DEFAULT: 3,
        HIGH: 4,
    },
    EventType: {
        DISMISSED: 0,
        PRESS: 1,
        ACTION_PRESS: 2,
        DELIVERED: 3,
    },
};

module.exports = notifee;
module.exports.default = notifee;
// Named exports mirror the real package, which exposes `EventType` (and friends) as
// named exports rather than statics on the default export.
module.exports.EventType = notifee.EventType;
module.exports.AndroidImportance = notifee.AndroidImportance;

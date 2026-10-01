/**
 * Jest stand-in for `@react-native-firebase/messaging`.
 *
 * Mirrors the shape of the real modular API (`getMessaging`, `getToken`,
 * `onMessage`, ...) from `@react-native-firebase/messaging` v26 so that
 * `src/services/push/pushService.ts` and `usePushNotifications.ts` can be imported
 * under Jest without a native build.
 *
 * Every subscription-style API returns a jest.fn() that yields an unsubscribe function,
 * which is what `usePushNotifications` stores in its cleanup ref.
 */
const noop = jest.fn();

function subscribe() {
    return jest.fn(() => jest.fn());
}

function getMessaging() {
    return { app: { name: '[DEFAULT]' } };
}

function getToken() {
    return Promise.resolve('jest-fcm-token');
}

function deleteToken() {
    return Promise.resolve(true);
}

function getInitialNotification() {
    return Promise.resolve(null);
}

function requestPermission() {
    return Promise.resolve(1);
}

function hasPermission() {
    return Promise.resolve(1);
}

function setBackgroundMessageHandler() {
    // No-op: there is no native background executor under Jest.
}

const messaging = {
    getMessaging,
    getToken,
    deleteToken,
    getInitialNotification,
    requestPermission,
    hasPermission,
    setBackgroundMessageHandler,
    onMessage: subscribe,
    onNotificationOpenedApp: subscribe,
    onTokenRefresh: subscribe,
    AuthorizationStatus: {
        NOT_DETERMINED: -1,
        DENIED: 0,
        AUTHORIZED: 1,
        PROVISIONAL: 2,
    },
};

module.exports = {
    __esModule: true,
    default: messaging,
    messaging,
    getMessaging,
    getToken,
    deleteToken,
    getInitialNotification,
    requestPermission,
    hasPermission,
    setBackgroundMessageHandler,
    onMessage: subscribe,
    onNotificationOpenedApp: subscribe,
    onTokenRefresh: subscribe,
    AuthorizationStatus: messaging.AuthorizationStatus,
    // Referenced by the service layer for typing/guards only.
    isRemoteMessage: noop,
};

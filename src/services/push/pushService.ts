import { Platform } from 'react-native';
import notifee, { EventType, AndroidImportance } from '@notifee/react-native';
import { getApp } from '@react-native-firebase/app';
import {
    deleteToken,
    getInitialNotification,
    getMessaging,
    getToken,
    hasPermission,
    isDeviceRegisteredForRemoteMessages,
    onMessage,
    onNotificationOpenedApp,
    onTokenRefresh,
    registerDeviceForRemoteMessages,
    requestPermission,
    setBackgroundMessageHandler,
    type RemoteMessage,
} from '@react-native-firebase/messaging';

import { env } from '../../config/env';
import { STORAGE_KEYS } from '../../config/storageKeys';
import { useOutboxStore } from '../outbox';
import { deviceTokenApi } from '../../features/notifications/api';
import { useNotificationInboxStore } from '../../features/notifications/store';
import { isAuthenticatedStatus, useSessionStore } from '../../features/auth/store/sessionStore';
import { usePreferencesStore } from '../../features/settings/store/preferencesStore';
import type { AppError } from '../../types/appError';
import type { DevicePlatform } from '../../types/api';
import { getString, setString, removeItem } from '../../utils/storage';
import { isRetryable } from '../../utils/errors';
import { logger } from '../../utils/logger';
import {
    describePermission,
    isInvalidTokenError,
    isTokenAlreadyRemoved,
    mapAuthorizationStatus,
} from './pushStatus';
import { usePushStatusStore } from './pushStatusStore';

/**
 * Push notification service.
 *
 * Every entry point short-circuits on `env.fcm.enabled`, which is `false` unless a
 * Firebase config file is present (see `google-services.json` / `GoogleService-Info.plist`).
 * That keeps a build without credentials from hitting a native "default app has not
 * been initialized" crash while still shipping the real integration.
 *
 * Responsibilities, and deliberately nothing else:
 * - obtain and register the device token with the backend,
 * - unregister it on sign-out or opt-out,
 * - persist incoming messages into the local notification inbox,
 * - hand incoming messages to a caller-supplied handler.
 *
 * Navigation and query invalidation are **not** done here: the service must not
 * import the navigator, or it would invert the dependency direction and make the
 * service untestable. Persisting into the inbox *is* done here, because it has to
 * work in a headless background launch where no screen or query client exists.
 */

/** Callbacks the app supplies; keeps this module free of navigation/UI imports. */
export type PushHandlers = {
    /** A notification arrived while the app was foregrounded. */
    onForegroundMessage?: (message: RemoteMessage) => void;
    /**
     * The user tapped a notification.
     *
     * `message` is present for OS-delivered notifications (backgrounded or cold
     * start). It is omitted for a tap on a notification this service displayed
     * itself while foregrounded — there the payload was already persisted into
     * the inbox when it was shown, so the caller only needs to react (e.g.
     * invalidate queries).
     */
    onNotificationOpened?: (message?: RemoteMessage) => void;
};

let handlers: PushHandlers = {};
const unsubscribers: Array<() => void> = [];
let initialized = false;

/**
 * Derives a stable local identity for a message that the backend has not yet assigned
 * a notification id to.
 *
 * The backend's FCM payload carries the *business* key (`type` plus `shift_id` and
 * friends), not the `notifications` uuid — see
 * [`FcmMessage`](../staff-sass-last17/app/Notifications/Messages/FcmMessage.php:1).
 * Reusing that business key as the local id means a redelivered message updates one
 * row instead of stacking duplicates, and a later server sync can correlate the two
 * through `type` + `data` in
 * [`isSameNotification`](../../features/notifications/utils/inboxMerge.ts:1).
 */
function localIdForData(data: Record<string, unknown>): string {
    const parts = Object.keys(data)
        .sort()
        .map(key => `${key}=${String(data[key])}`);

    return `push:${parts.join('&')}`;
}

function localIdForMessage(message: RemoteMessage): string {
    if (typeof message.messageId === 'string' && message.messageId.length > 0) {
        return `push:${message.messageId}`;
    }

    return localIdForData(message.data ?? {});
}

/** Builds the `{ title, body, ...businessFields }` bag the inbox expects. */
function inboxPayloadForMessage(message: RemoteMessage): Record<string, unknown> {
    const data: Record<string, unknown> = { ...(message.data ?? {}) };

    // Prefer an explicit data title/body; fall back to the notification block, which
    // is what the OS renders but is absent on data-only messages.
    if (typeof data.title !== 'string' && message.notification?.title !== undefined) {
        data.title = message.notification.title;
    }

    if (typeof data.body !== 'string' && message.notification?.body !== undefined) {
        data.body = message.notification.body;
    }

    return data;
}

/**
 * Writes a delivered message into the persistent inbox.
 *
 * Deliberately tolerant: a failure to persist must not prevent the OS from showing the
 * notification or the app from opening. Called from the background handler, where the
 * process may be torn down moments later, so it is awaited rather than fired and
 * forgotten.
 */
async function persistToInbox(message: RemoteMessage): Promise<void> {
    try {
        await useNotificationInboxStore
            .getState()
            .receivePush(inboxPayloadForMessage(message), localIdForMessage(message));
    } catch (error) {
        logger.warn('[push] Failed to persist notification into the local inbox', error);
    }
}

/**
 * Renders a foreground message as a system notification.
 *
 * FCM never displays a message while the app is in the foreground — on Android the
 * `notification` block is ignored entirely, and on iOS it is suppressed unless the
 * delegate opts in. Without this the user sees nothing but a silently-updated badge,
 * which reads as "push is broken". The message is therefore re-posted through Notifee
 * so it appears as a heads-up banner exactly like a backgrounded one.
 *
 * The payload is embedded in `data` so a tap can be routed back into the inbox
 * (see the `onForegroundEvent` listener in `initializePushService`). The Android
 * channel id must match the one the backend targets, or Android 8+ drops the post.
 */
async function displayForegroundNotification(message: RemoteMessage): Promise<void> {
    try {
        const data = inboxPayloadForMessage(message);
        const title = typeof data.title === 'string' ? data.title : 'New notification';
        const body = typeof data.body === 'string' ? data.body : '';

        await notifee.displayNotification({
            title,
            body,
            data: {
                ...data,
                // The tap handler needs the same stable id the inbox row uses, so the
                // row it opens is the one this banner represents.
                localId: localIdForMessage(message),
            },
            android: {
                channelId: env.fcm.androidChannelId,
                // White monochrome status-bar icon. Without this Notifee falls back to
                // the launcher icon, which Android renders as a white square.
                smallIcon: 'ic_notification',
                pressAction: { id: 'default' },
            },
        });
    } catch (error) {
        // A display failure must never break message handling; the inbox row is
        // already persisted, so the notification is not lost.
        logger.warn('[push] Failed to display foreground notification', error);
    }
}

/** True when FCM is configured *and* the device is allowed to receive push. */
function isPushAvailable(): boolean {
    return env.fcm.enabled;
}

/**
 * Reads the OS permission and records it.
 *
 * Called at startup, on foreground, and after a permission prompt, so the Settings
 * screen always reflects reality rather than a value cached at first launch (a user can
 * revoke permission in the OS at any time).
 *
 * @returns the mapped permission, or `unsupported` when push is not configured.
 */
export async function refreshPermissionStatus(): Promise<void> {
    if (!isPushAvailable()) {
        usePushStatusStore.getState().setPermission('unsupported', describePermission('unsupported'));

        return;
    }

    try {
        const status = await hasPermission(getMessaging(getApp()));
        const permission = mapAuthorizationStatus(status);

        usePushStatusStore.getState().setPermission(permission, describePermission(permission));
    } catch (error) {
        logger.warn('[push] Failed to read notification permission', error);
    }
}

/**
 * The `fcm:` prefix matches what the backend stores and what `LoginAction` upserts
 * (spec Screen 1 API 1 — `fcm_token` max 500). Sending the bare token would create a
 * second, unrelated row in `device_tokens`.
 */
function toStoredTokenFormat(rawToken: string): string {
    return rawToken.startsWith('fcm:') ? rawToken : `fcm:${rawToken}`;
}

function currentPlatform(): DevicePlatform {
    return Platform.OS === 'ios' ? 'ios' : 'android';
}

/**
 * Creates the Android notification channel FCM posts into.
 *
 * A channel declared only via the `default_notification_channel_id` manifest
 * meta-data is never actually registered with the OS — the meta-data merely names the
 * channel the SDK *should* use. Android 8+ drops notifications aimed at a channel that
 * does not exist, so it has to be created imperatively through the native module.
 *
 * The id is taken from `env.fcm.androidChannelId`, which is also what
 * `res/values/strings.xml` reproduces for the manifest meta-data; both must agree.
 */
async function ensureAndroidNotificationChannel(): Promise<void> {
    if (Platform.OS !== 'android') {
        return;
    }

    try {
        // Previously a dynamic `import()` — converted to a static import (at the top of
        // this file) because the dynamic form goes through Metro's `asyncRequire.js`,
        // which fails on Windows when the drive-letter casing of `projectRoot` (uppercase
        // `C:` from `fs.realpathSync.native`) differs from the casing Node's resolver
        // returns (lowercase `c:` from `process.cwd()`). The static import is resolved
        // at bundle time and sidesteps the issue entirely.
        //
        // The original comment mentioned Jest compatibility, but this function is gated
        // behind `isPushAvailable()` and never reached during unit tests.
        await notifee.createChannel({
            id: env.fcm.androidChannelId,
            name: 'StaffSaaS',
            // CRITICAL FIX: Set to Importance level HIGH (value 4) to force visual alert banners
            importance: AndroidImportance.HIGH,
            badge: true,
            vibration: true,
        });
    } catch (error) {
        logger.warn('[push] Failed to create Android notification channel', error);
    }
}

/**
 * Registers this device with the backend.
 *
 * Called after login, on token refresh, and when push is re-enabled. It is safe to
 * call repeatedly because the backend upserts on `token`.
 *
 * The last registered token is persisted so sign-out can unregister it even if FCM
 * is unreachable at that moment.
 */
export async function registerDevice(): Promise<void> {
    if (!isPushAvailable()) {
        return;
    }

    const sessionStatus = useSessionStore.getState().status;

    // Never register a device anonymously — the backend ties the token to the user
    // and an unauthenticated call would be rejected (and would leak a 401 handling
    // path into the login screen). Any authenticated-* status is acceptable here:
    // push registration is a non-sensitive background concern, not a sensitive write.
    if (!isAuthenticatedStatus(sessionStatus)) {
        return;
    }

    if (!usePreferencesStore.getState().pushEnabled) {
        usePushStatusStore.getState().setRegistration('unregistered', null);

        return;
    }

    try {
        const messaging = getMessaging(getApp());
        const authorized = await requestPermission(messaging);

        await refreshPermissionStatus();

        if (!authorized) {
            // OS-level denial is authoritative; nothing to report to the backend. The
            // status store now carries `denied` plus the "open system settings" copy.
            usePushStatusStore.getState().setRegistration('unregistered', describePermission('denied'));

            return;
        }

        // iOS requires explicit registration before `getToken()` returns anything.
        if (!(await isDeviceRegisteredForRemoteMessages(messaging))) {
            await registerDeviceForRemoteMessages(messaging);
        }

        const rawToken = await getToken(messaging);
        const token = toStoredTokenFormat(rawToken);
        const platform = currentPlatform();

        // Persist the token *before* the network call, so sign-out can always attempt an
        // unregister even when the registration below is deferred to the outbox.
        await setString(STORAGE_KEYS.fcmToken, token);

        try {
            await deviceTokenApi.register({ token, platform, device_name: undefined });

            usePushStatusStore.getState().setRegistration('registered', null);
        } catch (error) {
            await handleRegistrationFailure(error as AppError, token, platform);
        }
    } catch (error) {
        // A failure to obtain the token or permission is not queueable: push is a
        // non-essential enhancement and must never block login. It is still surfaced, so
        // the user is not left believing notifications are working.
        usePushStatusStore.getState().setRegistration('failed', 'Could not enable notifications on this device.');

        logger.warn('[push] Failed to register device for push notifications', error);
    }
}

/**
 * Applies the registration-failure policy and records the outcome.
 *
 * - **Invalid token** (404/410/422-on-token): the server rejected this token. The local
 *   FCM token is deleted so a fresh one is minted next attempt — retrying it would loop.
 * - **Retryable** (connectivity/5xx): queued in the durable outbox, replayed once the
 *   session is validated again. The backend upserts on `token`, so the retry is safe.
 * - **Anything else**: surfaced as `failed`, never silently dropped.
 */
async function handleRegistrationFailure(
    error: AppError,
    token: string,
    platform: DevicePlatform,
): Promise<void> {
    if (isInvalidTokenError(error)) {
        await removeItem(STORAGE_KEYS.fcmToken);

        try {
            await deleteToken(getMessaging(getApp()));
        } catch (deleteError) {
            logger.warn('[push] Failed to delete invalid local FCM token', deleteError);
        }

        usePushStatusStore
            .getState()
            .setRegistration('failed', 'Notifications could not be set up for this device. Reopen the app to retry.');

        logger.warn('[push] Backend rejected the device token; local token discarded');

        return;
    }

    if (isRetryable(error)) {
        await useOutboxStore.getState().enqueue({
            kind: 'push.register',
            naturalKey: token,
            payload: { payload: { token, platform } },
            userId: useSessionStore.getState().user?.id ?? null,
        });

        usePushStatusStore.getState().setRegistration('pending', 'Notifications will finish setting up when you reconnect.');

        logger.info('[push] Device registration queued in the outbox; server unreachable');

        return;
    }

    usePushStatusStore.getState().setRegistration('failed', 'Could not enable notifications on this device.');

    logger.warn('[push] Failed to register device for push notifications', error);
}

/** Unregisters this device. Called on sign-out and when push is disabled. */
export async function unregisterDevice(): Promise<void> {
    if (!isPushAvailable()) {
        return;
    }

    const token = await getString(STORAGE_KEYS.fcmToken);

    if (token === null) {
        return;
    }

    try {
        await deviceTokenApi.unregister(token);

        // The server no longer knows the token: the local copy has served its purpose.
        await removeItem(STORAGE_KEYS.fcmToken);
    } catch (error) {
        const appError = error as AppError;

        if (isTokenAlreadyRemoved(appError)) {
            // Already gone server-side — the removal is complete, not a failure.
            await removeItem(STORAGE_KEYS.fcmToken);
        } else if (isRetryable(appError)) {
            // Unregister is not a sensitive write, so it is queued rather than lost. The
            // stored token is **retained** deliberately: deleting it here would strand a
            // server-side registration the backend still believes is active, and it
            // would also leave nothing to retry with.
            await useOutboxStore.getState().enqueue({
                kind: 'push.unregister',
                naturalKey: token,
                payload: { token },
                userId: useSessionStore.getState().user?.id ?? null,
            });

            logger.info('[push] Unregister queued in the outbox; server unreachable');
        } else {
            // A real rejection. Retaining the token is pointless, but it is not deleted
            // here either — the local FCM token below is what actually matters.
            logger.warn('[push] Failed to unregister device token', error);
        }
    }

    /**
     * Delete the local FCM token.
     *
     * This is intentional and independent of the server call's outcome. On a shared
     * device the *local* token is what would receive the previous user's notifications,
     * so it must be discarded on sign-out regardless of whether the backend was told.
     * A queued `push.unregister` (above) carries the old token string in its payload, so
     * the server cleanup still completes once connectivity returns.
     */
    try {
        await deleteToken(getMessaging(getApp()));
    } catch (error) {
        logger.warn('[push] Failed to delete local FCM token', error);
    }
}

/**
 * Sets up listeners and requests permission.
 *
 * Returns a cleanup function. Handlers are registered once per app launch; repeated
 * calls are ignored so a Fast Refresh cannot stack duplicate listeners.
 */
export async function initializePushService(nextHandlers: PushHandlers = {}): Promise<() => void> {
    handlers = nextHandlers;

    if (initialized || !isPushAvailable()) {
        return () => undefined;
    }

    initialized = true;

    try {
        await ensureAndroidNotificationChannel();

        const messaging = getMessaging(getApp());

        unsubscribers.push(
            onMessage(messaging, message => {
                // Foreground messages are never shown by the OS, so persist the row
                // (the durable record) *and* re-post it through Notifee so the user
                // actually sees a heads-up banner.
                void persistToInbox(message);
                void displayForegroundNotification(message);
                handlers.onForegroundMessage?.(message);
            }),
        );

        unsubscribers.push(
            onNotificationOpenedApp(messaging, message => {
                // A tap is proof the user saw the notification; recording it also
                // guarantees the row exists offline, since a tray notification from a
                // backgrounded app may never have been materialised locally.
                void persistToInbox(message);
                handlers.onNotificationOpened?.(message);
            }),
        );

        // Taps on notifications this service displayed itself (foreground banners) are
        // delivered by Notifee, not FCM. The payload was already persisted when the
        // banner was shown, so only the caller's reaction (query invalidation) is needed.
        unsubscribers.push(
            notifee.onForegroundEvent(({ type }) => {
                if (type === EventType.PRESS) {
                    handlers.onNotificationOpened?.();
                }
            }),
        );

        unsubscribers.push(
            onTokenRefresh(messaging, async rawToken => {
                const token = toStoredTokenFormat(rawToken);

                if (!isAuthenticatedStatus(useSessionStore.getState().status)) {
                    return;
                }

                try {
                    await deviceTokenApi.register({ token, platform: currentPlatform() });
                    await setString(STORAGE_KEYS.fcmToken, token);
                } catch (error) {
                    logger.warn('[push] Failed to sync refreshed device token', error);
                }
            }),
        );

        // A tap that launched a cold start never fires `onNotificationOpenedApp`;
        // this is the only way to see it.
        const initial = await getInitialNotification(messaging);

        if (initial) {
            await persistToInbox(initial);
            handlers.onNotificationOpened?.(initial);
        }
    } catch (error) {
        logger.warn('[push] Failed to initialise push service', error);
    }

    return () => {
        while (unsubscribers.length > 0) {
            unsubscribers.pop()?.();
        }

        initialized = false;
    };
}

/**
 * Background/quit-state message handler.
 *
 * Must be registered at module scope — before the React tree exists — or Android
 * will not deliver messages while the app is terminated. Called from `index.js`.
 *
 * This is where the inbox earns its keep. The OS renders the notification itself (the
 * backend sends a `notification` block alongside the data), but if the user swipes it
 * away without tapping, the *content* is gone forever unless something wrote it down.
 * The handler therefore persists every message before returning.
 *
 * A headless launch has no session, so the store is only hydrated opportunistically —
 * writes go to whatever the last hydration left in memory, and `mergeServerPage`
 * reconciles identities on the next foreground sync.
 */
export function registerBackgroundMessageHandler(): void {
    if (!isPushAvailable()) {
        return;
    }

    try {
        setBackgroundMessageHandler(getMessaging(getApp()), async message => {
            // 1. Maintain your durable local database sync
            await persistToInbox(message);

            // 2. CRITICAL FIX: Explicitly display a visual banner if the app is closed/killed 
            // and the OS hasn't generated one automatically (essential for data-only messages)
            try {
                const data = inboxPayloadForMessage(message);
                const title = typeof data.title === 'string' ? data.title : 'New Update';
                const body = typeof data.body === 'string' ? data.body : '';

                // Only invoke Notifee if there isn't a native OS-rendered notification block,
                // or if you want to enforce a fallback visual banner for reconnecting data messages.
                await notifee.displayNotification({
                    title,
                    body,
                    data: {
                        ...data,
                        localId: localIdForMessage(message),
                    },
                    android: {
                        channelId: env.fcm.androidChannelId,
                        // White monochrome status-bar icon (see the foreground handler).
                        smallIcon: 'ic_notification',
                        pressAction: { id: 'default' },
                    },
                });
            } catch (displayError) {
                logger.warn('[push] Background Notifee display failed', displayError);
            }
        });
    } catch (error) {
        logger.warn('[push] Failed to register background message handler', error);
    }
}


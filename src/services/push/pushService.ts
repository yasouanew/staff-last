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
import { notificationIdFromData } from '../../features/notifications/utils/inboxMerge';
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
 * A notification tap that arrived before the session was hydrated.
 *
 * A cold start launched by a notification tap runs `getInitialNotification` while the
 * session is still `booting` — the navigator has not mounted and the user is not yet
 * authenticated, so routing immediately would either be dropped or land on the Auth
 * stack. The tap is therefore held here and released by
 * [`flushPendingNotificationOpen`](src/services/push/pushService.ts:1) once the session
 * is authenticated. The row itself is persisted immediately, so nothing is lost if the
 * app is killed before the flush.
 */
let pendingNotificationOpen: RemoteMessage | undefined;

/**
 * Routes a notification tap, deferring it until the session is hydrated.
 *
 * Foreground taps (the app is running and authenticated) route immediately. A cold-start
 * tap is deferred, because the session store is still `booting` at that point.
 */
function routeNotificationOpen(message?: RemoteMessage): void {
    if (isAuthenticatedStatus(useSessionStore.getState().status)) {
        handlers.onNotificationOpened?.(message);

        return;
    }

    pendingNotificationOpen = message;
}

/**
 * Releases a deferred cold-start tap once the session is authenticated.
 *
 * Called by [`usePushNotifications`](src/services/push/usePushNotifications.ts:1) when
 * the session becomes authenticated. A no-op when there is nothing pending or the
 * session is still not ready.
 */
export function flushPendingNotificationOpen(): void {
    if (pendingNotificationOpen === undefined) {
        return;
    }

    if (!isAuthenticatedStatus(useSessionStore.getState().status)) {
        return;
    }

    const message = pendingNotificationOpen;

    pendingNotificationOpen = undefined;
    handlers.onNotificationOpened?.(message);
}

/**
 * Derives a stable local identity for a message that the backend has not yet assigned
 * a notification id to.
 *
 * The backend's FCM payload carries the *business* key (`type` plus `shift_id` and
 * friends) — see
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

/**
 * The canonical local identity for a delivered message.
 *
 * **`notification_id` first.** The backend puts the `notifications` uuid in the FCM data
 * bag, and the same value is the server row's `id`. Keying on it is what makes the same
 * event idempotent across every delivery path — a redelivered message, a tap, and a
 * later `GET /notifications` all resolve to one row.
 *
 * The FCM `messageId` is deliberately **not** used: it is assigned per delivery, so the
 * background copy and the tap copy of one event carry different values and would
 * materialise two rows. The business-key hash is the fallback for a legacy payload
 * without `notification_id`; the FCM `messageId` is a last resort only for a payload
 * that carries no business keys at all.
 */
function localIdForMessage(message: RemoteMessage): string {
    const data = message.data ?? {};
    const notificationId = notificationIdFromData(data);

    if (notificationId !== null) {
        return notificationId;
    }

    const businessId = localIdForData(data);

    if (businessId !== 'push:') {
        return businessId;
    }

    if (typeof message.messageId === 'string' && message.messageId.length > 0) {
        return `push:${message.messageId}`;
    }

    return businessId;
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
 * Renders a message as a system notification through Notifee.
 *
 * Used on two paths, for two different reasons:
 *
 * - **Foreground** — FCM never displays a message while the app is foregrounded (on
 *   Android the `notification` block is ignored entirely; on iOS it is suppressed
 *   unless the delegate opts in). Without this the user sees nothing but a silently
 *   updated badge, which reads as "push is broken".
 * - **Background, data-only** — a message with no `notification` block is not rendered
 *   by the OS at all, so the app must post it itself. A message that *does* carry a
 *   `notification` block is rendered by the OS, and re-posting it here would produce a
 *   duplicate — which is why the background handler only calls this for data-only
 *   messages.
 *
 * The payload is embedded in `data` so a tap can be routed back into the inbox
 * (see the `onForegroundEvent` listener in `initializePushService`). The Android
 * channel id must match the one the backend targets, or Android 8+ drops the post.
 */
async function displayNotification(message: RemoteMessage): Promise<void> {
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
        logger.warn('[push] Failed to display notification', error);
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
            name: 'Rosta',
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
 * Emits a one-shot diagnostic snapshot of the push pipeline.
 *
 * Push failures are silent by nature — a message that never arrives produces no
 * error anywhere. This logs the four facts that together explain almost every
 * "push does not work" report, so a single `adb logcat` capture is enough to
 * localise the failure to one of: FCM never reached the device, Android did not
 * render, the app/channel is blocked, or the tap did not route.
 *
 * The token is masked: it is a credential that authorises sending to this device,
 * and a full logcat dump is routinely pasted into issue trackers.
 */
async function logPushDiagnostics(): Promise<void> {
    if (!isPushAvailable()) {
        logger.info('[push][diag] push disabled (env.fcm.enabled=false)');

        return;
    }

    try {
        const rawToken = await getToken(getMessaging(getApp()));
        const masked = rawToken.length > 12 ? `${rawToken.slice(0, 6)}…${rawToken.slice(-4)}` : '***';

        logger.info('[push][diag] FCM token', masked);
    } catch (error) {
        logger.warn('[push][diag] could not read FCM token', error);
    }

    try {
        const status = await hasPermission(getMessaging(getApp()));

        logger.info('[push][diag] permission', mapAuthorizationStatus(status), `(raw=${status})`);
    } catch (error) {
        logger.warn('[push][diag] could not read permission', error);
    }

    if (Platform.OS !== 'android') {
        return;
    }

    try {
        const channels = await notifee.getChannels();
        const channel = channels.find(candidate => candidate.id === env.fcm.androidChannelId);

        logger.info(
            '[push][diag] channel',
            env.fcm.androidChannelId,
            channel ? `importance=${channel.importance} blocked=${String(channel.blocked)}` : 'MISSING',
        );
    } catch (error) {
        logger.warn('[push][diag] could not read channels', error);
    }

    try {
        const settings = await notifee.getNotificationSettings();

        logger.info('[push][diag] app notification authorization', settings.authorizationStatus);
    } catch (error) {
        logger.warn('[push][diag] could not read notification settings', error);
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

        logger.info(
            '[push] Device token obtained',
            rawToken.length > 12 ? `${rawToken.slice(0, 6)}…${rawToken.slice(-4)}` : '***',
        );

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
        await logPushDiagnostics();

        const messaging = getMessaging(getApp());

        unsubscribers.push(
            onMessage(messaging, message => {
                logger.info('[push] Foreground message received', message.messageId ?? '(no id)');

                // Persist the durable row first, unconditionally.
                void persistToInbox(message);

                /*
                 * Re-post through Notifee **only for a data-only message**.
                 *
                 * This mirrors the guard in the background handler
                 * (see `registerBackgroundMessageHandler`) and is what prevents the
                 * duplicate banner. A message that carries a `notification` block is
                 * rendered by the OS itself — on Android the SDK posts it to the tray
                 * even while the app is foregrounded, and on iOS APNs presents it via
                 * the `aps.alert`. Calling `displayNotification` for such a message
                 * therefore shows the user the *same* event twice, which is the exact
                 * bug this guard fixes.
                 *
                 * A data-only message (no `notification` block) is rendered by nobody,
                 * so the app must post it itself — the one case where a foreground
                 * banner has to come from Notifee.
                 */
                if (message.notification === undefined) {
                    void displayNotification(message);
                }

                handlers.onForegroundMessage?.(message);
            }),
        );

        unsubscribers.push(
            onNotificationOpenedApp(messaging, message => {
                // A tap must **not** create a row. The backend record is the source of
                // truth, and the row for this event either already exists (the background
                // handler persisted it) or will arrive from the server sync the caller
                // triggers on open. Persisting here is what produced a second row for one
                // event, because the tap payload's identity differs from the delivery
                // payload's.
                routeNotificationOpen(message);
            }),
        );

        // Taps on notifications this service displayed itself (foreground banners) are
        // delivered by Notifee, not FCM. The payload was already persisted when the
        // banner was shown, so only the caller's reaction (query invalidation) is needed.
        unsubscribers.push(
            notifee.onForegroundEvent(({ type }) => {
                if (type === EventType.PRESS) {
                    routeNotificationOpen();
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
        // this is the only way to see it. The *route* is deferred until the session is
        // hydrated — at this point the store is still `booting`, so navigating now would
        // land on the Auth stack. No row is written here: the caller syncs the server
        // after opening, which is the single source of the row.
        const initial = await getInitialNotification(messaging);

        if (initial) {
            routeNotificationOpen(initial);
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
 * ## Delivery model
 *
 * The backend sends a **visible** FCM notification payload (a `notification` block plus
 * data) for background/terminated delivery. In that case the OS renders the tray entry
 * itself, and this handler's only job is to persist the content — re-posting it through
 * Notifee would produce a duplicate.
 *
 * A **data-only** message (no `notification` block) is not rendered by the OS at all,
 * so the handler posts it through Notifee itself. That is the one case where the app
 * must display a banner from the background.
 *
 * ## What this handler must not assume
 *
 * JavaScript is not guaranteed to run when the app is force-stopped: Android and iOS
 * may deliver a visible notification without ever invoking this handler. The durable
 * record is therefore the server's notification table, and the reconnect sync
 * ([`syncNotifications`](../../features/notifications/sync/syncNotifications.ts:1)) is
 * the fallback that recovers anything this handler never saw. This handler is an
 * optimisation, not the source of truth.
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
            logger.info('[push] Background message received', message.messageId ?? '(no id)');

            // Persist first: the durable local record must exist even if the display
            // below fails or the process is torn down moments later.
            await persistToInbox(message);

            // The OS renders a message that carries a `notification` block. Only a
            // data-only message needs the app to post its own banner — doing it for a
            // visible message would show the user two notifications for one event.
            if (message.notification !== undefined) {
                return;
            }

            await displayNotification(message);
        });
    } catch (error) {
        logger.warn('[push] Failed to register background message handler', error);
    }
}


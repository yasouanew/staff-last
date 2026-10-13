import { isAuthenticatedStatus, useSessionStore } from '../../auth/store/sessionStore';
import { logger } from '../../../utils/logger';
import { notificationsApi } from '../api';
import { useNotificationInboxStore } from '../store';

/**
 * Server reconciliation for the local notification inbox.
 *
 * ## Why this exists
 *
 * Push is transport, not durable state. A device that was offline (or force-stopped)
 * while the backend emitted an event never received the FCM message, so the only way
 * the inbox can become correct again is to ask the server what it missed. This module
 * is that ask.
 *
 * ## Cursor, not a full re-download
 *
 * The inbox store keeps a `watermark` — the newest server `created_at` it has seen.
 * The sync requests `since=<watermark>`, so a device that was offline for a week
 * fetches only the gap. On a first-ever sync the watermark is `null` and the request
 * omits the cursor, which the backend treats as "from the beginning".
 *
 * ## Deduplication
 *
 * Rows that arrived by push while the app was running were materialised locally with a
 * `push:` id and `pending: true`. [`mergeServerPage`](../utils/inboxMerge.ts:1) matches
 * them to their server twin on `type` + `data` (or a known `server_id`) and adopts the
 * server row, so a notification that was both pushed and later fetched does not appear
 * twice.
 *
 * ## Failure handling
 *
 * A failure is logged and swallowed. The caller (the connectivity coordinator) treats
 * the sync as best-effort: the local inbox is already rendered, and a failed
 * reconciliation must not abort the rest of the recovery pipeline.
 *
 * @returns the number of server rows merged, so the caller can decide whether a cache
 *   invalidation is warranted.
 */
export async function syncNotifications(): Promise<number> {
    const session = useSessionStore.getState();

    // Notifications are user-scoped server-side, so there is nothing to reconcile
    // without a session. Any authenticated status is acceptable: this is a read.
    if (!isAuthenticatedStatus(session.status) || session.user === null) {
        return 0;
    }

    const inbox = useNotificationInboxStore.getState();
    const watermark = inbox.watermark;

    try {
        const response = await notificationsApi.list({
            per_page: 50,
            // Omit the key entirely when there is no cursor, so the request is a plain
            // first-page fetch rather than `?since=undefined`.
            ...(watermark !== null ? { since: watermark } : {}),
        });

        const rows = response.notifications;

        if (rows.length === 0) {
            return 0;
        }

        await useNotificationInboxStore.getState().mergeFromServer(session.user.id, rows);

        logger.info(`[inbox] Reconciled ${rows.length} notification(s) from the server`);

        return rows.length;
    } catch (error) {
        logger.warn('[inbox] Failed to reconcile notifications from the server', error);

        return 0;
    }
}

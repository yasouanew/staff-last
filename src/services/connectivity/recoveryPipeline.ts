import { authApi } from '../../features/auth/api';
import { isAuthenticatedStatus, useSessionStore } from '../../features/auth/store/sessionStore';
import { syncNotifications } from '../../features/notifications/sync';
import type { AppError } from '../../types/appError';
import { logger } from '../../utils/logger';
import { syncOutbox } from '../outbox/syncOutbox';
import { registerDevice } from '../push/pushService';

/**
 * Ordered recovery pipeline for an offline → online transition.
 *
 * ## Why an ordered pipeline rather than independent listeners
 *
 * Each step depends on the one before it:
 *
 * 1. **Refresh the session** — a reconnect is the moment a stale cached user can be
 *    revalidated. Until `/auth/me` succeeds the session is `authenticated-offline`, and
 *    the outbox flush (a write) refuses to run against an unvalidated session.
 * 2. **Flush the durable outbox** — queued writes (mark-read, availability, deferred
 *    push registration) are replayed now that a validated connection exists.
 * 3. **Register/refresh the FCM token** — a token that failed to register while offline
 *    is retried; the backend upserts, so this is idempotent.
 * 4. **Reconcile the notification inbox** — fetch the server rows created while the
 *    device was offline, using the inbox watermark as a cursor, and merge them into the
 *    local inbox (deduplicating against push-created rows).
 *
 * Cache invalidation is the caller's job (step 5), because it needs the React Query
 * client, which this module deliberately does not import.
 *
 * ## Failure isolation
 *
 * Every step is individually guarded. A failure in one step is logged and the pipeline
 * continues: a failed session refresh must not prevent the inbox from reconciling, and
 * a failed inbox sync must not leave the outbox unflushed. The pipeline never throws.
 */

export type RecoveryResult = {
    /** True when `/auth/me` succeeded and the session was promoted to online. */
    sessionRefreshed: boolean;
    /** Number of outbox entries successfully replayed. */
    outboxFlushed: number;
    /** Number of server notification rows merged into the local inbox. */
    notificationsMerged: number;
};

/**
 * Injectable steps, so the pipeline can be unit-tested without the network or the
 * native push module. Production uses [`defaultRecoveryDeps`](src/services/connectivity/recoveryPipeline.ts:1).
 */
export type RecoveryDeps = {
    refreshSession: () => Promise<boolean>;
    flushOutbox: () => Promise<number>;
    registerDevice: () => Promise<void>;
    syncNotifications: () => Promise<number>;
};

/**
 * Revalidates the session against `GET /auth/me`.
 *
 * A 401 is left to the axios interceptor (which clears the session); any other failure
 * downgrades an online session to `authenticated-offline` so the UI is honest about the
 * connection having dropped again.
 *
 * @returns true when the session is server-confirmed after the call.
 */
async function refreshSession(): Promise<boolean> {
    const session = useSessionStore.getState();

    if (!isAuthenticatedStatus(session.status)) {
        return false;
    }

    try {
        const user = await authApi.me();

        await useSessionStore.getState().setUser(user);

        return true;
    } catch (error) {
        const appError = error as AppError;

        if (appError?.kind !== 'unauthorized') {
            useSessionStore.getState().markOffline(appError);
        }

        logger.warn('[connectivity] Session refresh failed during recovery', appError?.kind ?? 'unknown');

        return false;
    }
}

export const defaultRecoveryDeps: RecoveryDeps = {
    refreshSession,
    flushOutbox: syncOutbox,
    registerDevice,
    syncNotifications,
};

export async function runRecoveryPipeline(deps: RecoveryDeps = defaultRecoveryDeps): Promise<RecoveryResult> {
    const result: RecoveryResult = {
        sessionRefreshed: false,
        outboxFlushed: 0,
        notificationsMerged: 0,
    };

    // 1. Session — must precede the outbox flush, which requires a validated session.
    try {
        result.sessionRefreshed = await deps.refreshSession();
    } catch (error) {
        logger.warn('[connectivity] Recovery step 1 (session) threw', error);
    }

    // 2. Durable outbox — replay queued writes.
    try {
        result.outboxFlushed = await deps.flushOutbox();
    } catch (error) {
        logger.warn('[connectivity] Recovery step 2 (outbox) threw', error);
    }

    // 3. Push token — retry a registration that failed while offline.
    try {
        await deps.registerDevice();
    } catch (error) {
        logger.warn('[connectivity] Recovery step 3 (push registration) threw', error);
    }

    // 4. Notification inbox — fetch the gap the device missed.
    try {
        result.notificationsMerged = await deps.syncNotifications();
    } catch (error) {
        logger.warn('[connectivity] Recovery step 4 (notification sync) threw', error);
    }

    return result;
}

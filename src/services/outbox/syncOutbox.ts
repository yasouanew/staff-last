import { isSessionValidated, useSessionStore } from '../../features/auth/store/sessionStore';
import { isTokenAlreadyRemoved } from '../push/pushStatus';
import type { AppError } from '../../types/appError';
import { isRetryable } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { outboxHandlers } from './outboxHandlers';
import { selectReadyEntries, useOutboxStore } from './outboxStore';

/**
 * Replays the durable outbox.
 *
 * ## Single-flight
 *
 * Only one flush runs at a time. Concurrent triggers — the app regaining a validated
 * session, a screen mounting, a manual retry — all share the same in-flight promise
 * rather than racing, which is what prevents the same entry being sent twice.
 *
 * ## Preconditions
 *
 * A flush is a **write**, so it requires a server-validated session
 * ([`isSessionValidated`](src/features/auth/store/sessionStore.ts:1)). While offline or
 * unvalidated it returns immediately and the queue is left intact; the next transition
 * to `authenticated-online` re-triggers it. This is the same trust boundary that gates
 * the interactive mutations, applied to the deferred ones.
 *
 * ## Failure handling
 *
 * - **401** — the session is dead; the flush stops. The axios interceptor has already
 *   cleared the session, so continuing would only produce more 401s.
 * - **Retryable** (network/timeout/5xx/throttled) — the entry is backed off and retried
 *   later.
 * - **Non-retryable** (4xx that a retry cannot fix) — the entry is dead-lettered and
 *   surfaced to the user as failed, never silently dropped.
 */

let inFlight: Promise<number> | null = null;

/** True while a flush is running. */
export function isOutboxSyncing(): boolean {
    return inFlight !== null;
}

/**
 * Flushes due entries.
 *
 * @returns the number of entries successfully replayed, so callers can decide whether
 *   a cache invalidation is warranted (flushing nothing should not trigger refetches).
 */
export async function syncOutbox(): Promise<number> {
    if (inFlight !== null) {
        return inFlight;
    }

    inFlight = runFlush().finally(() => {
        inFlight = null;
    });

    return inFlight;
}

async function runFlush(): Promise<number> {
    const store = useOutboxStore.getState();

    if (store.entries.length === 0) {
        return 0;
    }

    if (!isSessionValidated(useSessionStore.getState().status)) {
        // Not validated: leave the queue untouched. A later validation re-triggers.
        return 0;
    }

    const ready = selectReadyEntries(store.entries);

    if (ready.length === 0) {
        // Everything is within its backoff window.
        return 0;
    }

    store.setFlushing(true);

    let flushed = 0;

    try {
        for (const entry of ready) {
            try {
                await outboxHandlers[entry.kind](entry.payload);
                await useOutboxStore.getState().remove(entry.id);
                flushed += 1;
            } catch (error) {
                const appError = error as AppError;

                if (appError?.kind === 'unauthorized') {
                    // Session ended mid-flush; stop rather than hammer the API.
                    logger.info('[outbox] Flush halted: session is no longer authorized');

                    return flushed;
                }

                // A deferred unregister whose token the server no longer knows is a
                // completed removal, not a failure — drop it rather than dead-letter it.
                if (entry.kind === 'push.unregister' && isTokenAlreadyRemoved(appError)) {
                    await useOutboxStore.getState().remove(entry.id);
                    flushed += 1;

                    continue;
                }

                await useOutboxStore
                    .getState()
                    .markFailed(entry.id, appError?.message ?? 'Unknown error', isRetryable(appError));

                logger.warn(`[outbox] Replay failed for ${entry.id}`, appError?.kind ?? 'unknown');
            }
        }
    } finally {
        useOutboxStore.getState().setFlushing(false);
    }

    return flushed;
}

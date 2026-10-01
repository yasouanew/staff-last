import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import type { AppError } from '../../../types/appError';
import { useSessionStore } from '../../auth/store/sessionStore';
import { queryKeys } from '../../../utils/queryKeys';
import { logger } from '../../../utils/logger';
import { useOutboxStore } from '../../../services/outbox';
import { notificationsApi } from '../api';
import { useNotificationInboxStore } from '../store';

/**
 * Mark-as-read actions.
 *
 * ## Local first, server second, outbox last
 *
 * The local inbox is written **before** the request is awaited. Two reasons:
 *
 * 1. Offline, the tap must still work. A worker who reads a shift change in a dead
 *    spot cannot be blocked; the row is read immediately.
 * 2. Tapping a notification you are looking at and having it stay bold because a
 *    request is slow is the single most common complaint about notification lists.
 *
 * The server write is then attempted, and — when it fails for a **connectivity**
 * reason — the operation is placed in the durable
 * [`outbox`](../../../services/outbox/outboxStore.ts:1) rather than being silently
 * dropped. This is the "durable outbox" policy for mark-read: the read is never lost,
 * and it is retried until the server accepts it (see
 * [`docs/mutation-policy.md`](docs/mutation-policy.md:1)).
 *
 * A **non-connectivity** failure (403/404) is *not* queued — it is a real answer from
 * the server, so the local read state is wrong and must be re-synced rather than
 * trusted.
 *
 * The server remains authoritative in the other direction — see
 * [`mergeServerPage`](../../notifications/utils/inboxMerge.ts:1), which refuses to
 * revert a local read back to unread.
 */

/** True when the failure is a connectivity problem rather than a rejected write. */
function isConnectivityError(error: unknown): boolean {
    const status = (error as { status?: number } | null)?.status;

    // No status at all means the request never got a response: offline, DNS, timeout.
    return status === undefined || status === 0 || status === 408 || status >= 500;
}

export function useMarkNotificationRead(): UseMutationResult<void, AppError, string> {
    const queryClient = useQueryClient();
    const markRead = useNotificationInboxStore(state => state.markRead);
    const userId = useSessionStore(state => state.user?.id ?? null);

    return useMutation<void, AppError, string>({
        mutationFn: async id => {
            await markRead(id);

            try {
                await notificationsApi.markAsRead(id);
            } catch (error) {
                if (!isConnectivityError(error)) {
                    // A 403/404 is a real answer from the server: the local read state
                    // is wrong and must be re-synced rather than trusted.
                    throw error;
                }

                // Durable: survives a process death and is retried on reconnect.
                await useOutboxStore.getState().enqueue({
                    kind: 'notification.read',
                    naturalKey: id,
                    payload: { id },
                    userId,
                });

                logger.info('[inbox] Mark-read queued in the outbox; server unreachable');
            }
        },
        onSettled: async () => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
        },
    });
}

export function useMarkAllNotificationsRead(): UseMutationResult<void, AppError, void> {
    const queryClient = useQueryClient();
    const markAllRead = useNotificationInboxStore(state => state.markAllRead);
    const userId = useSessionStore(state => state.user?.id ?? null);

    return useMutation<void, AppError, void>({
        mutationFn: async () => {
            await markAllRead();

            try {
                await notificationsApi.markAllAsRead();
            } catch (error) {
                if (!isConnectivityError(error)) {
                    throw error;
                }

                await useOutboxStore.getState().enqueue({
                    kind: 'notification.read-all',
                    payload: {},
                    userId,
                });

                logger.info('[inbox] Mark-all-read queued in the outbox; server unreachable');
            }
        },
        onSettled: async () => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
        },
    });
}

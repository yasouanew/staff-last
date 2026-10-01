import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import type { AppError } from '../../../types/appError';
import { useOutboxStore } from '../../../services/outbox';
import { isSessionValidated, useSessionStore } from '../../auth/store/sessionStore';
import { queryKeys } from '../../../utils/queryKeys';
import { availabilityApi } from '../api';
import type { Availability, SyncWeeklyAvailabilityPayload } from '../types';

type SyncArgs = { employeeId: number; payload: SyncWeeklyAvailabilityPayload };

/**
 * Result of a save attempt.
 *
 * `queued` is the explicit "pending" signal the UI must surface: the save was accepted
 * locally and placed in the durable outbox, but the server has **not** received it yet.
 * Reporting a plain success here would be exactly the "silently imply a write
 * succeeded" failure the mutation policy forbids.
 */
export type SyncAvailabilityResult = {
    /** True when the save was deferred to the outbox rather than sent. */
    queued: boolean;
    /** The server's collection when the write went through; `null` when queued. */
    availability: Availability[] | null;
};

/**
 * `PUT /employees/{employee}/availabilities/sync` — RECOMMENDED mobile save.
 * Replaces the whole week transactionally; returns the full week collection.
 *
 * ## Offline policy — queue with timestamp
 *
 * An availability week is a whole-value replacement, so queueing it is safe: the
 * queued payload supersedes anything earlier, and a later save simply replaces the
 * pending entry (dedupe by `employeeId`). The payload carries a `clientUpdatedAt`
 * timestamp so the server — or a future conflict resolver — can order competing writes.
 * See [`docs/mutation-policy.md`](docs/mutation-policy.md:1).
 *
 * When the session is validated the write is sent immediately. When it is not
 * (offline/validating) the write is enqueued and the caller is told via `queued: true`.
 */
export function useSyncWeeklyAvailability(): UseMutationResult<
    SyncAvailabilityResult,
    AppError,
    SyncArgs
> {
    const queryClient = useQueryClient();
    const userId = useSessionStore(state => state.user?.id ?? null);

    return useMutation<SyncAvailabilityResult, AppError, SyncArgs>({
        mutationFn: async ({ employeeId, payload }) => {
            if (!isSessionValidated(useSessionStore.getState().status)) {
                // Offline: queue the whole-week replacement with a timestamp and let the
                // outbox replay it on reconnect. Dedupe on the employee id means only
                // the most recent pending week survives.
                await useOutboxStore.getState().enqueue({
                    kind: 'availability.sync',
                    naturalKey: String(employeeId),
                    payload: {
                        employeeId,
                        payload,
                        clientUpdatedAt: new Date().toISOString(),
                    },
                    userId,
                });

                return { queued: true, availability: null };
            }

            const availability = await availabilityApi.sync(employeeId, payload);

            return { queued: false, availability };
        },
        onSuccess: async result => {
            // Only refetch when the server actually has the new week.
            if (!result.queued) {
                await queryClient.invalidateQueries({ queryKey: queryKeys.availability.all });
            }
        },
    });
}

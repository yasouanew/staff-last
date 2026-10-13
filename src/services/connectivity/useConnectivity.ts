import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { queryKeys } from '../../utils/queryKeys';
import { startConnectivityCoordinator } from './connectivityCoordinator';
import { useConnectivityStore } from './connectivityStore';

/**
 * Binds the connectivity coordinator to the app lifecycle. Mounted once, at the root.
 *
 * The coordinator itself is framework-free; this hook supplies the one piece of app
 * knowledge it must not hold — the React Query client — so that a completed recovery
 * invalidates the reads a replayed write or a merged notification could have changed.
 *
 * Invalidation is unconditional on a completed run rather than gated on a non-zero
 * count: a reconnect is exactly the moment a stale cache is most likely to be wrong,
 * and the queries are cheap. The outbox hook still gates its own invalidation on a
 * non-empty flush, so the two do not double up in the common case.
 */
export function useConnectivity(): void {
    const queryClient = useQueryClient();

    useEffect(() => {
        const stop = startConnectivityCoordinator({
            onRecovered: () => {
                // The session is deliberately *not* invalidated here: the pipeline's
                // first step already revalidated it via `GET /auth/me` and wrote the
                // result into the store, so invalidating `session.me` would fire a
                // second, redundant request.
                void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
                void queryClient.invalidateQueries({ queryKey: queryKeys.availability.all });
                void queryClient.invalidateQueries({ queryKey: queryKeys.shifts.all });
                void queryClient.invalidateQueries({ queryKey: queryKeys.rosters.all });
                void queryClient.invalidateQueries({ queryKey: queryKeys.leave.all });
            },
        });

        return stop;
    }, [queryClient]);
}

/** Reactive connectivity flags for UI (a banner, a settings row). */
export function useConnectivityStatus(): { isOnline: boolean; isRecovering: boolean } {
    const isOnline = useConnectivityStore(state => state.isOnline);
    const isRecovering = useConnectivityStore(state => state.isRecovering);

    return { isOnline, isRecovering };
}

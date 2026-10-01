import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { isAuthenticatedStatus, useSessionStore } from '../../features/auth/store/sessionStore';
import { queryKeys } from '../../utils/queryKeys';
import { useOutboxStore } from './outboxStore';
import { syncOutbox } from './syncOutbox';

/**
 * Binds the durable outbox to the app lifecycle. Mounted once, at the root.
 *
 * Two jobs:
 *
 * 1. **Hydrate** the persisted queue as soon as a session exists, so queued writes from
 *    a previous launch are known before the user interacts.
 * 2. **Flush** whenever the session becomes `authenticated-online` — i.e. the moment a
 *    server-validated connection is available. This is what makes "queued while
 *    offline" turn into "sent" without the user doing anything.
 *
 * After a non-empty flush it invalidates the reads that a replayed write could have
 * changed (availability, notifications). Invalidation is skipped when nothing was
 * flushed, so simply coming online does not cause a refetch storm.
 */
export function useOutboxSync(): void {
    const queryClient = useQueryClient();
    const status = useSessionStore(state => state.status);
    const userId = useSessionStore(state => state.user?.id ?? null);
    const hydrate = useOutboxStore(state => state.hydrate);

    const authenticated = isAuthenticatedStatus(status);

    useEffect(() => {
        if (!authenticated) {
            return;
        }

        void hydrate(userId);
    }, [authenticated, hydrate, userId]);

    useEffect(() => {
        if (status !== 'authenticated-online') {
            return;
        }

        let cancelled = false;

        void syncOutbox().then(flushed => {
            if (cancelled || flushed === 0) {
                return;
            }

            void queryClient.invalidateQueries({ queryKey: queryKeys.availability.all });
            void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
        });

        return () => {
            cancelled = true;
        };
    }, [status, queryClient]);
}

import { useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';

import { isAuthenticatedStatus, useSessionStore } from '../../auth/store/sessionStore';
import { queryKeys } from '../../../utils/queryKeys';
import { logger } from '../../../utils/logger';
import { notificationsApi } from '../api';
import { useNotificationInboxStore } from '../store';
import type { InboxItem } from '../utils/inboxMerge';

export type InboxResult = {
    /** Rows to render: the local inbox merged with the latest server page. */
    items: InboxItem[];
    /** True only on a genuinely cold first load with nothing on disk. */
    isInitialLoading: boolean;
    /** True when the last sync failed — the list below is still usable. */
    isStale: boolean;
    /** True when the inbox has content that has never been confirmed by the server. */
    isOfflineOnly: boolean;
    isRefetching: boolean;
    retry: () => void;
};

/**
 * Local-first notification inbox.
 *
 * The screen renders from AsyncStorage, not from the network. That ordering is the
 * whole point: a worker who opens the app in a lift sees their notifications, and one
 * who taps a tray notification on a plane still sees the exact row they tapped.
 *
 * The network is a *reconciler* here. When `GET /notifications` succeeds, its page is
 * merged into the local inbox (server wins, except for a read the server has not seen
 * yet). When it fails, the failure is recorded as `isStale` and nothing is thrown
 * away — a stale notification list is far more useful than an error screen.
 *
 * Pagination is intentionally not implemented over the local store: the store is
 * capped at [`INBOX_MAX_ITEMS`](src/features/notifications/utils/inboxMerge.ts:17) and
 * the screen requests the same 30-row first page it always did.
 */
export function useInbox(perPage = 30): InboxResult {
    const status = useSessionStore(state => state.status);
    const userId = useSessionStore(state => state.user?.id ?? null);

    const items = useNotificationInboxStore(state => state.items);
    const hydrated = useNotificationInboxStore(state => state.hydrated);
    const synced = useNotificationInboxStore(state => state.synced);
    const hydrate = useNotificationInboxStore(state => state.hydrate);
    const mergeFromServer = useNotificationInboxStore(state => state.mergeFromServer);

    const authenticate = isAuthenticatedStatus(status) && userId !== null;

    // Hydrate before the first fetch so the merge has something to merge into and the
    // screen does not flash an empty state over rows that are already on disk.
    const hydrationStarted = useRef(false);

    useEffect(() => {
        if (!authenticate || hydrationStarted.current) {
            return;
        }

        hydrationStarted.current = true;

        void hydrate(userId).catch(error => {
            logger.warn('[inbox] Failed to hydrate local notifications', error);
        });
    }, [authenticate, hydrate, userId]);

    const query = useQuery({
        queryKey: queryKeys.notifications.list({ per_page: perPage }),
        queryFn: () => notificationsApi.list({ per_page: perPage }),
        enabled: authenticate,
        staleTime: 15 * 1000,
    });

    // The endpoint returns a custom wrapper (`data.notifications`), not a Laravel
    // paginator, so the rows are under `notifications` — reading `data` here would
    // silently yield `undefined` and leave the inbox empty.
    const serverItems = query.data?.notifications;

    useEffect(() => {
        if (userId === null || serverItems === undefined) {
            return;
        }

        void mergeFromServer(userId, serverItems).catch(error => {
            logger.warn('[inbox] Failed to persist merged notifications', error);
        });
    }, [mergeFromServer, serverItems, userId]);

    const isOfflineOnly = useMemo(() => items.length > 0 && !synced, [items.length, synced]);

    return {
        items,
        isInitialLoading: !hydrated && query.isPending,
        /*
         * "The last sync failed", full stop — deliberately **not** additionally gated on
         * `items.length > 0`.
         *
         * The screen renders two different things off this flag and needs both to be
         * reachable: a quiet `SyncNotice` banner when rows are already on screen (a stale
         * list is still useful, so the rows are kept), and the full `ErrorView` with a
         * retry when there is nothing to show. Gating the flag on `items.length > 0` made
         * the second case *unreachable* — an empty inbox plus a failed request fell
         * through to the "Nothing yet" empty state, telling the user they have no
         * notifications when in fact the app had never managed to ask. The
         * `notifications.length === 0` test in the screen is what separates the two
         * presentations.
         */
        isStale: query.isError,
        isOfflineOnly,
        isRefetching: query.isRefetching,
        retry: () => void query.refetch(),
    };
}

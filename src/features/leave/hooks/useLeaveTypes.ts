import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import type { PaginatedData } from '../../../types/api';
import type { AppError } from '../../../types/appError';
import { queryKeys } from '../../../utils/queryKeys';
import { leaveApi } from '../api';
import type { LeaveType } from '../types';

export type UseLeaveTypesResult = {
    leaveTypes: LeaveType[];
    /** First load, with no usable data yet. */
    isLoading: boolean;
    /** True when the backend gap blocks the picker (403/401) — show fallback, not error. */
    isUnsupported: boolean;
    /** A genuine failure worth showing and retrying. */
    isError: boolean;
    error: AppError | null;
    retry: () => void;
    /**
     * Whether a fetch is in flight right now, including a repeat fetch over
     * already-cached types. Distinct from `isLoading`, which is only true when
     * there is nothing usable to show yet — this is what drives a pull-to-refresh
     * spinner, which must appear over content that is already on screen.
     */
    isRefreshing: boolean;
};

function unwrapTypes(payload: PaginatedData<LeaveType> | LeaveType[]): LeaveType[] {
    if (Array.isArray(payload)) {
        return payload;
    }

    return payload.data ?? [];
}

/**
 * `GET /leave-types`.
 *
 * **Backend gap G2:** the employee role lacks the permission this endpoint requires,
 * so it currently returns 403. Rather than surfacing an error screen for something
 * the user cannot fix, a 403/401 is reported via `isUnsupported` and the create
 * form shows the "types unavailable — contact admin" fallback with retry.
 *
 * ## Fresh types on every visit
 *
 * The picker must reflect the current catalogue each time the user opens Request
 * Leave: an admin can add, rename, deactivate or change `allow_half_day` /
 * `requires_approval` on a type at any moment, and a request made against a stale
 * list can be rejected or silently misconfigured (e.g. a half-day offered for a type
 * that no longer allows it).
 *
 * Two settings deliver that without regressing the loading experience:
 *
 * - `staleTime: 0` — a cached list is only a *placeholder*. The next observer mount
 *   is immediately considered stale, so `useQuery` refetches on screen entry instead
 *   of serving a list cached up to 30 minutes ago.
 * - `refetchOnMount: 'always'` — belt and braces for the same intent. Pairing both
 *   means a refetch happens on every mount even if a global QueryClient default
 *   later sets a non-zero `staleTime`, so the guarantee cannot be lost by a config
 *   change elsewhere.
 *
 * Cached rows stay on screen while the refetch runs, so the user does not see the
 * "Loading leave types…" placeholder on a return visit: `isLoading` (from
 * `isPending`) is only true when there is no usable data yet. `isRefreshing`
 * (`isFetching`) still reports the in-flight request for a pull-to-refresh spinner.
 *
 * The refetch is deliberately **not** awaited by the screen, so a slow types
 * response never delays the form's first paint.
 */
export function useLeaveTypes(): UseLeaveTypesResult {
    const query = useQuery<PaginatedData<LeaveType> | LeaveType[], AppError>({
        queryKey: queryKeys.leave.types(),
        queryFn: () => leaveApi.types({ status: 'active', per_page: 100 }),
        // A cached list is a placeholder, never authoritative — see the docblock.
        staleTime: 0,
        refetchOnMount: 'always',
        retry: (failureCount, error) => {
            // A 403 is deterministic — retrying only wastes the user's time and the
            // request budget, so stop immediately on any authorization failure.
            if (error.kind === 'forbidden' || error.kind === 'unauthorized') {
                return false;
            }

            return failureCount < 2;
        },
    });

    const isUnsupported =
        query.error?.kind === 'forbidden' || query.error?.kind === 'unauthorized';

    /*
     * `refetch` from TanStack Query has a stable identity for the life of the query
     * observer, so this callback is stable too. That matters to callers that place it
     * in a dependency list — notably the Request Leave screen's `useFocusEffect`,
     * where an unstable `retry` would re-create the focus callback on every fetch and
     * turn "refresh on entry" into "refresh on every query state change".
     *
     * It is defined with `useCallback` rather than inline in the `useMemo` below
     * because the memo is keyed on the whole `query` object, which changes on every
     * fetch; a callback allocated there would be new each time.
     */
    const { refetch } = query;

    const retry = useCallback(() => {
        void refetch();
    }, [refetch]);

    return useMemo(
        () => ({
            leaveTypes: query.data ? unwrapTypes(query.data) : [],
            isLoading: query.isPending,
            isUnsupported: isUnsupported === true,
            isError: query.isError && !isUnsupported,
            error: query.isError && !isUnsupported ? query.error : null,
            retry,
            // `isFetching` rather than `isRefetching`: the first load is also an
            // in-flight fetch, and a pull during the cold window should keep the
            // control engaged for the whole request instead of releasing it the
            // moment `isRefetching` fails to become true.
            isRefreshing: query.isFetching,
        }),
        [query, isUnsupported, retry],
    );
}

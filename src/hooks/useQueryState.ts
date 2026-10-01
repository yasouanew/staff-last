import type { UseQueryResult } from '@tanstack/react-query';

import type { AppError } from '../types/appError';
import { isAppError } from '../types/appError';

/**
 * The single source of truth for rendering loading / error / empty / content.
 *
 * Every screen with a query consumes this instead of branching on `isLoading`
 * directly. That is what guarantees the application-wide rules from the spec:
 *
 * - an empty state is **never** shown while data is still loading (`isEmpty` is
 *   false during the first fetch and during error states)
 * - a refresh does not blank out existing content (`isLoading` is only true on the
 *   very first fetch; `isRefreshing` covers pull-to-refresh)
 * - errors always carry an `AppError`, never an `unknown`
 *
 * `isEmpty` is opt-in via `isEmptyCheck` because only the caller knows what "no
 * data" means for its payload (an empty array, a null object, a zero count).
 */
export type QueryState<TData> = {
    data: TData | undefined;
    /** First load with no cached data — safe to render a full-screen spinner. */
    isLoading: boolean;
    /** A background refetch is in flight and stale data is on screen. */
    isRefreshing: boolean;
    /** The request failed. Always an `AppError`. */
    isError: boolean;
    error: AppError | null;
    /** Request succeeded and the payload is empty. Never true while loading. */
    isEmpty: boolean;
    /** True when there is usable content to render. */
    hasData: boolean;
    refetch: () => void;
};

export function useQueryState<TData>(
    query: UseQueryResult<TData, unknown>,
    isEmptyCheck?: (data: TData) => boolean,
): QueryState<TData> {
    const { data, isPending, isFetching, isError, error, refetch } = query;

    const appError = isError && isAppError(error) ? error : null;

    const isEmpty =
        !isPending && !isError && data !== undefined && isEmptyCheck !== undefined ? isEmptyCheck(data) : false;

    return {
        data,
        // `isPending` (no data yet) rather than `isLoading` (pending && fetching) so a
        // paused/offline query still shows a spinner instead of an empty screen.
        isLoading: isPending,
        isRefreshing: isFetching && !isPending,
        isError,
        error: appError,
        isEmpty,
        hasData: data !== undefined && !isEmpty,
        refetch: () => {
            void refetch();
        },
    };
}

/** Convenience check for list endpoints that return a plain array. */
export function isEmptyArray<TItem>(data: TItem[]): boolean {
    return data.length === 0;
}

/**
 * Convenience check for paginated endpoints (`data.data` inside the envelope).
 * Checks the first page only — a user scrolled to page 3 with no rows on screen is
 * not an "empty" state.
 */
export function isEmptyPage<TItem>(data: { data: TItem[] }): boolean {
    return data.data.length === 0;
}

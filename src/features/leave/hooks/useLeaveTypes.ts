import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

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
 */
export function useLeaveTypes(): UseLeaveTypesResult {
    const query = useQuery<PaginatedData<LeaveType> | LeaveType[], AppError>({
        queryKey: queryKeys.leave.types(),
        queryFn: () => leaveApi.types({ status: 'active', per_page: 100 }),
        // Company leave types change rarely and the list is tiny.
        staleTime: 30 * 60 * 1000,
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

    return useMemo(
        () => ({
            leaveTypes: query.data ? unwrapTypes(query.data) : [],
            isLoading: query.isPending,
            isUnsupported: isUnsupported === true,
            isError: query.isError && !isUnsupported,
            error: query.isError && !isUnsupported ? query.error : null,
            retry: () => {
                void query.refetch();
            },
            // `isFetching` rather than `isRefetching`: the first load is also an
            // in-flight fetch, and a pull during the cold window should keep the
            // control engaged for the whole request instead of releasing it the
            // moment `isRefetching` fails to become true.
            isRefreshing: query.isFetching,
        }),
        [query, isUnsupported],
    );
}

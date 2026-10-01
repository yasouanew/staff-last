import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useSessionStore } from '../../auth/store/sessionStore';
import type { AppError } from '../../../types/appError';
import { queryKeys } from '../../../utils/queryKeys';
import { availabilityApi } from '../api';
import type { Availability } from '../types';
import { orderAvailability } from '../utils';

export type UseAvailabilityResult = {
    availability: Availability[];
    employeeId: number | null;
    isLoading: boolean;
    /** A real failure worth showing. Always false for the known 403 gap. */
    isError: boolean;
    error: AppError | null;
    /**
     * True when the backend refuses the request for authorization reasons — the
     * documented Screen 7 GAP. Screens should render an explanatory state with
     * the "ask admin" copy, not a retry button.
     */
    isUnsupported: boolean;
    isRefreshing: boolean;
    retry: () => void;
    refresh: () => void;
};

/**
 * `GET /employees/{employee}/availabilities`.
 *
 * `employee` is `employees.id` from `me.employee_id` (NOT `users.id`).
 * List is NOT paginated — plain collection ordered `day_of_week,start_time`.
 *
 * **Backend gap (BLOCKING):** the employee role lacks `employee.view`, so this
 * returns 403 today. That outcome is normalised into `isUnsupported` so the
 * screen can explain the limitation instead of showing an error the user has
 * no way to resolve. Any other failure is a genuine error.
 */
export function useAvailability(): UseAvailabilityResult {
    const employeeId = useSessionStore(state => state.user?.employee_id ?? null);

    const query = useQuery<Availability[], AppError>({
        queryKey: queryKeys.availability.list(employeeId ?? 0),
        queryFn: () => availabilityApi.list(employeeId as number),
        enabled: employeeId !== null,
        retry: (failureCount, error) => {
            if (error.kind === 'forbidden' || error.kind === 'unauthorized') {
                return false;
            }

            return failureCount < 2;
        },
    });

    const isUnsupported = Boolean(
        query.error?.kind === 'forbidden' || query.error?.kind === 'unauthorized',
    );
    const failed = query.isError === true;

    const availability = useMemo(() => orderAvailability(query.data ?? []), [query.data]);

    return useMemo(
        () => ({
            availability,
            employeeId,
            isLoading: employeeId !== null && query.isPending,
            isError: failed && !isUnsupported,
            error: failed && !isUnsupported ? query.error : null,
            isUnsupported,
            isRefreshing: query.isFetching === true && query.isPending !== true,
            retry: () => {
                void query.refetch();
            },
            refresh: () => {
                void query.refetch();
            },
        }),
        [query, availability, isUnsupported, failed, employeeId],
    );
}

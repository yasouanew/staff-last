import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { useSessionStore } from '../../auth/store/sessionStore';
import type { PaginatedData } from '../../../types/api';
import type { AppError } from '../../../types/appError';
import { queryKeys } from '../../../utils/queryKeys';
import { shiftsApi } from '../api';
import type { Shift, ShiftListParams } from '../types';

/**
 * `GET /shifts` scoped to the signed-in employee.
 *
 * `employee_id` is read from the session rather than passed in by the screen: it is
 * a property of who is signed in, not of the UI, and deriving it in one place
 * prevents a screen from accidentally querying someone else's shifts.
 *
 * The query is disabled until `employee_id` exists. A user with no linked employee
 * record cannot have shifts, and firing the request anyway would return the whole
 * company's data (no server-side scoping).
 */
export function useShifts(
    params: Omit<ShiftListParams, 'employee_id'> = {},
): UseQueryResult<PaginatedData<Shift>, AppError> & { employeeId: number | null } {
    const employeeId = useSessionStore(state => state.user?.employee_id ?? null);

    const query = useQuery<PaginatedData<Shift>, AppError>({
        queryKey: queryKeys.shifts.list({ ...params, employee_id: employeeId ?? undefined }),
        queryFn: () => {
            if (employeeId === null) {
                // Unreachable while `enabled` is false, but keeps the queryFn total.
                throw new Error('Cannot load shifts without a linked employee record.');
            }

            return shiftsApi.list({ ...params, employee_id: employeeId });
        },
        enabled: employeeId !== null,
    });

    return { ...query, employeeId };
}

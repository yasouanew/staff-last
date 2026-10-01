import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { useSessionStore } from '../../auth/store/sessionStore';
import type { PaginatedData } from '../../../types/api';
import type { AppError } from '../../../types/appError';
import { queryKeys } from '../../../utils/queryKeys';
import { rosterApi } from '../api';
import type { Roster, RosterListParams } from '../types';

/**
 * "My Roster" — `GET /rosters` scoped to the signed-in employee.
 *
 * Disabled until the session exposes an `employee_id`; without it the backend
 * would return company-wide rosters instead of this employee's (spec §0.5).
 */
export function useMyRoster(
    params: Omit<RosterListParams, 'employee_id'> = {},
): UseQueryResult<PaginatedData<Roster>, AppError> & { employeeId: number | null } {
    const employeeId = useSessionStore(state => state.user?.employee_id ?? null);

    const query = useQuery<PaginatedData<Roster>, AppError>({
        queryKey: queryKeys.rosters.list({ ...params, employee_id: employeeId ?? undefined }),
        queryFn: () => {
            if (employeeId === null) {
                throw new Error('Cannot load rosters without a linked employee record.');
            }

            return rosterApi.list({ ...params, employee_id: employeeId });
        },
        enabled: employeeId !== null,
    });

    return { ...query, employeeId };
}

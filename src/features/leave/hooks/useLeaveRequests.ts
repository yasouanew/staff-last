import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { PaginatedData } from '../../../types/api';
import type { AppError } from '../../../types/appError';
import { queryKeys } from '../../../utils/queryKeys';
import { leaveApi } from '../api';
import type { LeaveRequest, LeaveRequestListParams } from '../types';

/**
 * `GET /leave-requests`.
 *
 * No `employee_id` parameter — the backend scopes this endpoint to the token. This
 * asymmetry with shifts/rosters is deliberate and documented in the spec (§0.5).
 */
export function useLeaveRequests(
    params: LeaveRequestListParams = {},
): UseQueryResult<PaginatedData<LeaveRequest>, AppError> {
    return useQuery<PaginatedData<LeaveRequest>, AppError>({
        queryKey: queryKeys.leave.list(params),
        queryFn: () => leaveApi.list(params),
    });
}

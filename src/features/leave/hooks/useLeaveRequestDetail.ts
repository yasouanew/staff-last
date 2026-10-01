import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { AppError } from '../../../types/appError';
import { queryKeys } from '../../../utils/queryKeys';
import { leaveApi } from '../api';
import type { LeaveRequest } from '../types';

/** `GET /leave-requests/{id}` — ownership is enforced server-side. */
export function useLeaveRequestDetail(id: number | null): UseQueryResult<LeaveRequest, AppError> {
    return useQuery<LeaveRequest, AppError>({
        queryKey: queryKeys.leave.detail(id ?? 0),
        queryFn: () => leaveApi.detail(id as number),
        enabled: id !== null && Number.isFinite(id),
    });
}

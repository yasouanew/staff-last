import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { AppError } from '../../../types/appError';
import { queryKeys } from '../../../utils/queryKeys';
import { shiftsApi } from '../api';
import type { Shift } from '../types';

/**
 * `GET /shifts/{id}`.
 *
 * Detail screens receive only the id via navigation params; the record itself is
 * refetched so a deeply-linked or restored screen always renders current data
 * rather than a stale navigation payload.
 */
export function useShiftDetail(id: number | null): UseQueryResult<Shift, AppError> {
    return useQuery<Shift, AppError>({
        queryKey: queryKeys.shifts.detail(id ?? 0),
        queryFn: () => shiftsApi.detail(id as number),
        enabled: id !== null && Number.isFinite(id),
    });
}

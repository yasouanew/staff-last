import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { AppError } from '../../../types/appError';
import { queryKeys } from '../../../utils/queryKeys';
import { rosterApi } from '../api';
import type { Roster } from '../types';

/**
 * `GET /rosters/{id}` — includes the roster's shifts.
 *
 * Disabled for a null id so a screen can be mounted before its id is known (e.g. a
 * deep link still resolving) without firing a request for roster 0.
 */
export function useRosterDetail(id: number | null): UseQueryResult<Roster, AppError> {
    return useQuery<Roster, AppError>({
        queryKey: queryKeys.rosters.detail(id ?? 0),
        queryFn: () => rosterApi.detail(id as number),
        enabled: id !== null && Number.isFinite(id),
    });
}

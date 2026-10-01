import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { AppError } from '../../../types/appError';
import { queryKeys } from '../../../utils/queryKeys';
import { notificationsApi } from '../api';
import type { NotificationListParams, NotificationListResponse } from '../types';

/** `GET /notifications`. */
export function useNotifications(
    params: NotificationListParams = {},
): UseQueryResult<NotificationListResponse, AppError> {
    return useQuery<NotificationListResponse, AppError>({
        queryKey: queryKeys.notifications.list(params),
        queryFn: () => notificationsApi.list(params),
        // Notifications go stale quickly; the badge and list should agree.
        staleTime: 15 * 1000,
    });
}

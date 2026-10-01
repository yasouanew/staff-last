import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { isAuthenticatedStatus, useSessionStore } from '../../auth/store/sessionStore';
import type { AppError } from '../../../types/appError';
import { queryKeys } from '../../../utils/queryKeys';
import { notificationsApi } from '../api';
import type { UnreadCountResponse } from '../types';

/**
 * `GET /notifications/unread-count` — the tab badge.
 *
 * Disabled while signed out so a background badge poll cannot fire during the
 * auth flow, and cached briefly because it is read on every tab render.
 */
export function useUnreadCount(): UseQueryResult<UnreadCountResponse, AppError> {
    const status = useSessionStore(state => state.status);

    return useQuery<UnreadCountResponse, AppError>({
        queryKey: queryKeys.notifications.unreadCount(),
        queryFn: () => notificationsApi.unreadCount(),
        enabled: isAuthenticatedStatus(status),
        staleTime: 30 * 1000,
        // A badge is cosmetic: never interrupt the user with a failed poll.
        retry: false,
    });
}

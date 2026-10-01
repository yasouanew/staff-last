import { api } from '../../../api/client';
import { parseApiResponse } from '../../../api/schemas';
import type {
    NotificationListParams,
    NotificationListResponse,
    UnreadCountResponse,
} from '../types';
import { notificationListResponseSchema, unreadCountResponseSchema } from '../validation/apiSchemas';

/**
 * Notification API service.
 *
 * Notifications are always scoped to the authenticated user server-side, so no
 * `employee_id` is involved here.
 *
 * Both read endpoints are validated at the boundary. `GET /notifications` in
 * particular does **not** return a standard paginator, so validating it is what catches
 * a backend that switches to one and would otherwise render an empty screen.
 */
export const notificationsApi = {
    /**
     * `GET /notifications?filter=unread`.
     *
     * The controller returns a custom wrapper (`data.notifications` + `data.unread_count`
     * + `data.meta`) rather than a Laravel paginator, so the rows are read from the
     * `notifications` key. See spec §6 API 1.
     */
    async list(params: NotificationListParams = {}): Promise<NotificationListResponse> {
        const data = await api.get<unknown>('/notifications', { params });

        return parseApiResponse(notificationListResponseSchema, data, 'GET /notifications');
    },

    /** `GET /notifications/unread-count` — drives the tab badge. */
    async unreadCount(): Promise<UnreadCountResponse> {
        const data = await api.get<unknown>('/notifications/unread-count');

        return parseApiResponse(unreadCountResponseSchema, data, 'GET /notifications/unread-count');
    },

    /** `POST /notifications/{id}/read` — idempotent. */
    async markAsRead(id: string): Promise<void> {
        await api.post<void>(`/notifications/${id}/read`);
    },

    /** `POST /notifications/read-all`. */
    async markAllAsRead(): Promise<void> {
        await api.post<void>('/notifications/read-all');
    },
};

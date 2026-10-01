import type { NotificationFilter, PaginationMeta } from '../../../types/api';

/**
 * Notification types.
 *
 * Transcribed from `NotificationResource` (spec §0.3 / Screens 10–11).
 *
 * `data` is the raw Laravel notification payload. It is typed as an opaque record
 * on purpose: its keys differ per notification class, so narrowing it here would be
 * guesswork. Screens read known keys defensively.
 */
export type AppNotification = {
    id: string;
    type: string;
    /** Human-readable title supplied by the backend. */
    title: string;
    body: string;
    data: Record<string, unknown>;
    read_at: string | null;
    created_at: string;
};

export type NotificationListParams = {
    filter?: NotificationFilter;
    page?: number;
    per_page?: number;
};

/**
 * `GET /notifications` payload.
 *
 * This endpoint does **not** return a standard Laravel paginator: the controller
 * wraps the collection itself, so the rows live under `data.notifications` rather
 * than `data.data`, and the unread count travels alongside them. Reading the wrong
 * key silently yields `undefined` and an empty screen, so this type is the single
 * place that shape is declared.
 */
export type NotificationListResponse = {
    notifications: AppNotification[];
    unread_count: number;
    meta: PaginationMeta;
};

export type UnreadCountResponse = {
    count: number;
};

import { z } from 'zod';

import { paginationMetaSchema } from '../../../api/schemas';

/**
 * Runtime schemas for the notification endpoints (spec Screens 10–11).
 *
 * `GET /notifications` does **not** return a Laravel paginator — the controller wraps
 * the collection, so rows live under `data.notifications` (not `data.data`). Validating
 * this shape at the boundary is what catches a backend that "helpfully" switches to the
 * standard paginator, which would otherwise render an empty screen.
 */

export const appNotificationSchema = z.object({
    id: z.string(),
    type: z.string(),
    title: z.string(),
    body: z.string(),
    /** Raw Laravel payload; keys differ per notification class, so it stays opaque. */
    data: z.record(z.unknown()),
    read_at: z.string().nullable(),
    created_at: z.string(),
});

export const notificationListResponseSchema = z.object({
    notifications: z.array(appNotificationSchema),
    unread_count: z.number(),
    meta: paginationMetaSchema,
});

export const unreadCountResponseSchema = z.object({
    count: z.number(),
});

/** `POST /device-tokens` response (`DeviceTokenResource`). */
export const deviceTokenResourceSchema = z.object({
    id: z.number(),
    device_name: z.string().nullable(),
    platform: z.string(),
    is_active: z.boolean(),
    last_used_at: z.string().nullable(),
});

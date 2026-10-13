import { z } from 'zod';

import { employeeSummarySchema } from '../../../api/schemas';

/**
 * Runtime schemas for the leave endpoints (spec Screens 8–10).
 *
 * `total_days` and the allowance fields are `decimal:2` **strings** on the wire, not
 * numbers — the backend serialises decimals as strings, so validating them as numbers
 * would reject every real response.
 */

export const leaveTypeSummarySchema = z.object({
    id: z.number(),
    name: z.string(),
    code: z.string().nullable(),
    is_paid: z.boolean(),
});

/**
 * A numeric field that the backend may serialise as either a JSON number or a
 * decimal string, normalised to a string.
 *
 * `max_days_per_request` is an **integer** column, so it comes back as a bare
 * number (`1`, `3`) — unlike the `decimal:2` allowance fields, which Laravel casts
 * to strings. Requiring a string here rejected every real response and surfaced as
 * "The app received an unexpected response from the server." Accepting both and
 * normalising keeps one representation for the rest of the app.
 */
const numericStringSchema = z
    .union([z.string(), z.number()])
    .nullable()
    .transform(value => (value === null ? null : String(value)));

export const leaveTypeSchema = z.object({
    id: z.number(),
    name: z.string(),
    code: z.string().nullable(),
    description: z.string().nullable(),
    allowance_days: z.string().nullable(),
    is_paid: z.boolean(),
    allows_rollover: z.boolean(),
    max_rollover_days: z.string().nullable(),
    requires_approval: z.boolean(),
    allow_half_day: z.boolean(),
    max_days_per_request: numericStringSchema,
    color: z.string().nullable(),
    status: z.string(),
});

/** Minimal user embedded as `approver`/`rejecter`. */
export const leaveDecisionUserSchema = z.object({
    id: z.number(),
    name: z.string(),
    email: z.string().nullish(),
});

export const leaveRequestStatusSchema = z.enum(['pending', 'approved', 'rejected']);
export const leaveSessionSchema = z.enum(['full_day', 'first_half', 'second_half']);

export const leaveRequestSchema = z.object({
    id: z.number(),
    company_id: z.number(),
    employee_id: z.number(),
    leave_type_id: z.number(),
    leave_type: leaveTypeSummarySchema.nullable(),
    employee: employeeSummarySchema.pick({ id: true, full_name: true }).nullable(),
    start_date: z.string(),
    end_date: z.string(),
    start_session: leaveSessionSchema.nullable(),
    end_session: leaveSessionSchema.nullable(),
    total_days: z.string().nullable(),
    reason: z.string().nullable(),
    attachment: z.string().nullable(),
    attachments: z.array(z.string()),
    status: leaveRequestStatusSchema,
    approved_by: z.number().nullable(),
    approved_at: z.string().nullable(),
    rejected_by: z.number().nullable(),
    rejected_at: z.string().nullable(),
    rejection_reason: z.string().nullable(),
    admin_notes: z.string().nullable(),
    approver: leaveDecisionUserSchema.nullable(),
    rejecter: leaveDecisionUserSchema.nullable(),
    created_at: z.string(),
    updated_at: z.string(),
});

/**
 * The `POST /leave-requests` **201** body.
 *
 * The create response is a **partial** `LeaveRequestResource`, not the full resource
 * the list/detail endpoints return. The spec's example (Screen 9 API 2) carries only
 * `id, company_id, employee_id, leave_type_id, start_date, end_date, status,
 * total_days, employee, leave_type` — and even the embedded `leave_type` is trimmed
 * to `{ id, name }`, which fails [`leaveTypeSummarySchema`](src/features/leave/validation/apiSchemas.ts:13)
 * (it requires `code` and `is_paid`).
 *
 * Validating this against the full [`leaveRequestSchema`](src/features/leave/validation/apiSchemas.ts:61)
 * therefore rejected every real submission with "The app received an unexpected
 * response from the server." — the mutation threw, the screen stayed put, and the
 * user was never returned to the leave list. The unit tests missed it because they
 * mock the POST with a *full* fixture.
 *
 * Only `id` is required — enough to confirm a resource was created — and every other
 * field is passed through untouched. The client never renders this object: the list
 * refetches on focus, so the created row comes from `GET /leave-requests`.
 */
export const createdLeaveRequestSchema = z.object({ id: z.number() }).passthrough();

/** The partial resource returned by `POST /leave-requests`. */
export type CreatedLeaveRequest = z.infer<typeof createdLeaveRequestSchema>;

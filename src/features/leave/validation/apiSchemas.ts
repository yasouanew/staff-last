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
    max_days_per_request: z.string().nullable(),
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

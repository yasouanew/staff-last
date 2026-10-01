import { z } from 'zod';

import type { LeaveSession } from '../../../types/api';

/**
 * Leave request validation (spec Screen 9 / `StoreLeaveRequestRequest`).
 *
 * Rule of engagement for every schema in this app: it may be **looser** than the
 * backend, never stricter. Laravel remains the authority; anything enforced here is
 * purely to save the user a round-trip. Where the backend rule is unknown, no rule
 * is added — a rejected request is recoverable, a blocked valid request is not.
 *
 * Specifically NOT enforced client-side, because the backend owns it:
 * - leave balance / sufficient-days check,
 * - public holidays and working-day calculation (`total_days` is recalculated by
 *   `LeaveRequestService` and is only a hint to the client),
 * - whether the chosen leave type requires approval or allows half days,
 * - `max_days_per_request` and overlapping-request detection.
 */

const apiDate = z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the YYYY-MM-DD format.');

/**
 * The server's enum. Sessions describe which part of a day is taken, at each end of
 * the range — there is no clock-time input anywhere in this contract.
 */
export const leaveSessions = ['full_day', 'first_half', 'second_half'] as const;

/** Type-narrowing assertion that the local enum still matches the API union. */
const _sessionMatchesApi: LeaveSession = 'full_day' as (typeof leaveSessions)[number];
void _sessionMatchesApi;

/** Spec Screen 9 §6: `attachments.*` file `pdf,jpg,jpeg,png,doc,docx` max 5120KB. */
export const LEAVE_ATTACHMENT_MAX_COUNT = 5;
export const LEAVE_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const LEAVE_ATTACHMENT_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'] as const;

export const createLeaveRequestSchema = z
    .object({
        leave_type_id: z
            .number({ invalid_type_error: 'Choose a leave type.' })
            .int()
            .positive('Choose a leave type.'),
        start_date: apiDate,
        end_date: apiDate,
        start_session: z.enum(leaveSessions).nullish(),
        end_session: z.enum(leaveSessions).nullish(),
        // Spec: `total_days` nullable numeric min 0.5 — a hint, server recalculates.
        total_days: z.number().min(0.5, 'Total days must be at least 0.5.').nullish(),
        reason: z.string().trim().max(1000, 'Keep the reason under 1000 characters.').nullish(),
    })
    .superRefine((value, ctx) => {
        // Mirror of the server's `end_date >= start_date` rule. Lexicographic
        // comparison is valid for `Y-m-d`.
        if (value.end_date < value.start_date) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['end_date'],
                message: 'The end date must be on or after the start date.',
            });
            return;
        }

        // A single-day request cannot end before it starts. On a multi-day range any
        // combination is valid (e.g. first half of Monday to second half of Friday),
        // so this is only checked when both dates are the same.
        const order: Record<LeaveSession, number> = {
            first_half: 0,
            full_day: 1,
            second_half: 2,
        };
        const start = value.start_session ?? 'full_day';
        const end = value.end_session ?? 'full_day';

        if (value.start_date === value.end_date && order[end] < order[start]) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['end_session'],
                message: 'On a single day, the end session cannot be before the start session.',
            });
        }
    });

export type CreateLeaveRequestFormValues = z.infer<typeof createLeaveRequestSchema>;

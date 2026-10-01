import { z } from 'zod';

import {
    branchSummarySchema,
    companySummarySchema,
    employeeSummarySchema,
    relationSummarySchema,
    rosterSummarySchema,
} from '../../../api/schemas';

/**
 * Runtime schema for `ShiftResource` (spec Screen 4).
 *
 * `date` is `Y-m-d` and `start_time`/`end_time` are `H:i` — validated as plain strings
 * because that is how the app holds them; parsing them into `Date`s here would
 * reintroduce the timezone bugs the string form exists to avoid.
 */
export const shiftStatusSchema = z.enum(['scheduled', 'completed', 'cancelled', 'swap_requested']);

export const shiftSchema = z.object({
    id: z.number(),
    company_id: z.number(),
    company: companySummarySchema.nullish(),
    branch_id: z.number().nullable(),
    branch: branchSummarySchema.nullable(),
    roster_id: z.number().nullable(),
    roster: rosterSummarySchema.nullish(),
    employee_id: z.number().nullable(),
    employee: employeeSummarySchema.nullable(),
    position_id: z.number().nullable(),
    position: relationSummarySchema.nullish(),
    department_id: z.number().nullable(),
    department: relationSummarySchema.nullish(),
    date: z.string(),
    start_time: z.string(),
    end_time: z.string(),
    break_minutes: z.number().nullable(),
    paid_break: z.boolean().nullable(),
    required_staff: z.number().nullish(),
    status: shiftStatusSchema,
    notes: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
});

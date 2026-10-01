import { z } from 'zod';

import { employeeSummarySchema, rosterStatusSchema } from '../../../api/schemas';
import { shiftSchema } from '../../shifts/validation/apiSchemas';

/**
 * Runtime schema for `RosterResource` (spec Screens 5–6).
 *
 * `shifts` is optional because it is only embedded on the detail endpoint, and
 * `shifts_count`/`version` are optional annotations the list may omit.
 */
export const rosterSchema = z.object({
    id: z.number(),
    company_id: z.number(),
    branch_id: z.number().nullable(),
    employee_id: z.number().nullable(),
    employee: employeeSummarySchema.nullable(),
    week_start: z.string(),
    week_end: z.string(),
    status: rosterStatusSchema,
    notes: z.string().nullable(),
    published_at: z.string().nullable(),
    shifts: z.array(shiftSchema).optional(),
    shifts_count: z.number().nullish(),
    version: z.number().nullish(),
    published_by: z.number().nullish(),
    created_at: z.string(),
    updated_at: z.string(),
});

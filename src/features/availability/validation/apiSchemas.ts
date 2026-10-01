import { z } from 'zod';

/**
 * Runtime schema for `Availability` (spec Screen 7).
 *
 * `GET …/availabilities` is a **plain collection**, not a paginator, so the array is
 * validated directly. `day_of_week` is a literal union of 0–6 rather than a bounded
 * number, so it both rejects an out-of-range value *and* narrows to the app's
 * [`DayOfWeek`](src/utils/date.ts:73) type at the boundary.
 */
export const dayOfWeekSchema = z.union([
    z.literal(0),
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
]);

export const availabilitySchema = z.object({
    id: z.number(),
    employee_id: z.number(),
    day_of_week: dayOfWeekSchema,
    day_name: z.string(),
    is_available: z.boolean(),
    start_time: z.string().nullable(),
    end_time: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
});

/**
 * The schema output is a subset of the app's `DayOfWeek` (`0 | 1 | … | 6`), which is
 * what lets `parseApiResponse` return a value assignable to `Availability`.
 */

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

/**
 * The backend emits `H:i:s` for availability times (`04:00:00`), not the `H:i`
 * the spec documents, and it is not consistent about the trailing seconds.
 *
 * ## Why this is normalised here, at the boundary
 *
 * The rest of the feature — the reducer, `validateSlotTime`, `TIME_OPTIONS`, the
 * sync payload — is written against `HH:MM`, because that is the interchange
 * format and the only shape the 30-minute select can produce. Feeding `04:00:00`
 * straight into the draft produced three separate visible failures at once:
 *
 *  - `validateSlotTime` rejected it ("Use HH:MM 24-hour format."), so a day that
 *    the server reports as available displayed a permanent red error;
 *  - the day could never validate, so `isValid` was false and the Save button
 *    stayed disabled no matter what the user did — the reported "save not
 *    interactive" symptom;
 *  - `TIME_OPTIONS.includes('04:00:00')` was false, so the picker showed no
 *    selected entry.
 *
 * Normalising on parse means every consumer downstream sees `HH:MM` and the
 * seconds never escape the API layer. Seconds are dropped rather than rounded:
 * availability boundaries are 30-minute granularity by design, so `04:00:00` and
 * `04:00:29` are the same choice, and rounding could push a value onto the next
 * option and silently change the user's week.
 */
function toHourMinute(value: string): string {
    const match = /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(value.trim());

    if (!match) {
        // Not a time this layer understands — hand it through untouched so the
        // editor's validation surfaces it rather than the parser inventing a
        // value. Better a visible error than a silently rewritten week.
        return value;
    }

    const [, rawHours, rawMinutes] = match;
    const hours = (rawHours ?? '00').padStart(2, '0');

    return `${hours}:${rawMinutes ?? '00'}`;
}

const availabilityTime = z
    .string()
    .nullable()
    .transform(value => (value === null ? null : toHourMinute(value)));

export const availabilitySchema = z.object({
    id: z.number(),
    employee_id: z.number(),
    day_of_week: dayOfWeekSchema,
    day_name: z.string(),
    is_available: z.boolean(),
    start_time: availabilityTime,
    end_time: availabilityTime,
    created_at: z.string(),
    updated_at: z.string(),
});

/**
 * The schema output is a subset of the app's `DayOfWeek` (`0 | 1 | … | 6`), which is
 * what lets `parseApiResponse` return a value assignable to `Availability`.
 */

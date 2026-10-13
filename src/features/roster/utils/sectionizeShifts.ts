import type { Shift } from '../../shifts/types';

/**
 * One day's worth of shifts, keyed by the shift's own ISO date.
 *
 * `date` is the API's `Y-m-d` string and doubles as the section key — the same
 * value the backend emits on `shifts.date`, so no parsing or timezone
 * conversion happens here (see the note on `Y-m-d` handling in
 * [`date.ts`](src/utils/date.ts:1)).
 */
export type ShiftDaySection = {
    /** `Y-m-d` — the calendar day this section groups. */
    date: string;
    /** The day's shifts, sorted by start time. */
    shifts: Shift[];
};

/**
 * Groups a flat shift list into day sections, keyed by ISO date.
 *
 * ## Why this is a free function and not inline in the hook
 *
 * The roster feed, and any future screen that renders shifts by day, must group
 * them *identically* — same ordering, same key, same empty-day behaviour. A
 * second copy of this loop is a second place the ordering rule can drift, and
 * the ordering is load-bearing: the day headers and the `getItemLayout` prefix
 * sums both assume "date ascending, then start time ascending".
 *
 * ## Ordering
 *
 * Shifts are sorted by `date` then `start_time` before grouping, so a day's
 * cards read chronologically. The sort is on the raw `H:i` strings, which is
 * correct because the API always zero-pads them (`"09:00"`, not `"9:00"`) — a
 * lexicographic compare on a fixed-width clock string is a chronological one.
 *
 * ## Empty days are omitted
 *
 * A day with no shifts produces no section. The screen renders its own empty
 * state for a week with nothing scheduled, and a section with an empty `data`
 * array would render a day header over nothing.
 *
 * The input array is never mutated: the sort runs on a copy, so a caller that
 * still holds the query's `data` is unaffected.
 */
export function sectionizeShifts(shifts: Shift[]): ShiftDaySection[] {
    const sorted = [...shifts].sort((a, b) => {
        const byDate = a.date.localeCompare(b.date);

        return byDate !== 0 ? byDate : a.start_time.localeCompare(b.start_time);
    });

    const byDate = new Map<string, Shift[]>();

    sorted.forEach(shift => {
        const list = byDate.get(shift.date) ?? [];

        list.push(shift);
        byDate.set(shift.date, list);
    });

    return [...byDate.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, dayShifts]) => ({ date, shifts: dayShifts }));
}

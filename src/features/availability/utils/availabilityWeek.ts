import type { DayOfWeek } from '../../../utils/date';
import type { Availability, AvailabilitySlotInput } from '../types';

export type WeekDayDraft = {
    day_of_week: DayOfWeek;
    is_available: boolean;
    start_time: string | null;
    end_time: string | null;
};

export const WEEK_DAYS: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];

/**
 * The selectable clock times, in 30-minute steps from `00:00` to `23:30`.
 *
 * The option *values* are the API's interchange format (`HH:MM`, 24-hour), so a
 * selection can be handed straight to the reducer, the validator and the sync
 * payload with no parsing at the seam. 30 minutes is the granularity the roster
 * uses for shift boundaries, so every valid start/end is representable without
 * the user typing — which is the whole point of replacing the free-text field.
 */
export const TIME_OPTIONS: string[] = Array.from({ length: 48 }, (_, index) => {
    const hours = Math.floor(index / 2);
    const minutes = index % 2 === 0 ? '00' : '30';
    return `${String(hours).padStart(2, '0')}:${minutes}`;
});

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Coerce a server time to the `HH:MM` the editor works in.
 *
 * The backend serves `H:i:s` (`04:00:00`), and the normalisation for that lives
 * in [`availabilitySchema`](src/features/availability/validation/apiSchemas.ts:1).
 * This is the second line of defence: `toWeekDrafts` is also reachable from
 * `result.availability` after a save and from any future caller that builds the
 * array itself, so the guarantee that a draft only ever holds a 30-minute
 * `HH:MM` value is enforced where the drafts are actually constructed.
 *
 * Without it, a seconds-bearing value makes `TIME_OPTIONS.includes()` false and
 * `validateSlotTime` report a format error, which pins `isValid` to false and
 * leaves the Save button permanently disabled — a state the user cannot clear
 * by any edit on the screen.
 */
function canonicalTime(value: string | null): string | null {
    if (value === null) {
        return null;
    }

    const match = /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(value.trim());
    if (!match) {
        return value;
    }

    return `${(match[1] ?? '00').padStart(2, '0')}:${match[2] ?? '00'}`;
}

function toMinutes(value: string): number {
    const [h, m] = value.split(':').map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
}

export function validateSlotTime(start: string | null, end: string | null, isAvailable: boolean): string | null {
    if (!isAvailable) return null;
    // Both blank is the deliberate "available all day" state, not an error.
    if (start == null && end == null) return null;
    // A half-filled range is incomplete: the user has started defining hours but
    // not finished, so the day cannot be saved. Without this the week would be
    // considered valid with only a start time, and the save button would enable
    // on a range the backend rejects.
    if (start == null || end == null) return 'Set both start and end times.';
    if (!TIME_RE.test(start)) return 'Use HH:MM 24-hour format.';
    if (!TIME_RE.test(end)) return 'Use HH:MM 24-hour format.';
    if (toMinutes(end) <= toMinutes(start)) {
        return 'End time must be after start time.';
    }
    return null;
}

export function orderAvailability(items: Availability[]): Availability[] {
    return [...items].sort((a, b) => {
        if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week;
        if (a.start_time == null && b.start_time == null) return 0;
        if (a.start_time == null) return 1;
        if (b.start_time == null) return -1;
        return a.start_time.localeCompare(b.start_time);
    });
}

export function toWeekDrafts(items: Availability[]): WeekDayDraft[] {
    const byDay = new Map<DayOfWeek, Availability[]>();
    for (const item of items) {
        const list = byDay.get(item.day_of_week) ?? [];
        list.push(item);
        byDay.set(item.day_of_week, list);
    }
    return WEEK_DAYS.map(day => {
        const slots = (byDay.get(day) ?? []).sort((a, b) =>
            (a.start_time ?? '').localeCompare(b.start_time ?? ''),
        );
        const first = slots[0];
        if (!first) {
            return { day_of_week: day, is_available: false, start_time: null, end_time: null };
        }
        return {
            day_of_week: day,
            is_available: first.is_available,
            start_time: canonicalTime(first.start_time),
            end_time: canonicalTime(first.end_time),
        };
    });
}

export function buildSyncPayload(drafts: WeekDayDraft[]): AvailabilitySlotInput[] {
    return drafts.map(d => {
        if (!d.is_available) {
            return { day_of_week: d.day_of_week, is_available: false };
        }
        if (d.start_time == null && d.end_time == null) {
            return { day_of_week: d.day_of_week, is_available: true };
        }
        return {
            day_of_week: d.day_of_week,
            is_available: true,
            start_time: d.start_time,
            end_time: d.end_time,
        };
    });
}

export function isWeekDirty(
    original: WeekDayDraft[],
    current: WeekDayDraft[],
): boolean {
    if (original.length !== current.length) {
        return true;
    }

    const normalizeTime = (value: string | null | undefined): string | null => {
        if (value === undefined || value === '') {
            return null;
        }

        return value;
    };

    return original.some((originalDay, index) => {
        const currentDay = current[index];

        if (!currentDay) {
            return true;
        }

        return (
            originalDay.day_of_week !== currentDay.day_of_week ||
            originalDay.is_available !== currentDay.is_available ||
            normalizeTime(originalDay.start_time) !==
            normalizeTime(currentDay.start_time) ||
            normalizeTime(originalDay.end_time) !==
            normalizeTime(currentDay.end_time)
        );
    });
}

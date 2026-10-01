import type { DayOfWeek } from '../../../utils/date';
import type { Availability, AvailabilitySlotInput } from '../types';

export type WeekDayDraft = {
    day_of_week: DayOfWeek;
    is_available: boolean;
    start_time: string | null;
    end_time: string | null;
};

export const WEEK_DAYS: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function toMinutes(value: string): number {
    const [h, m] = value.split(':').map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
}

export function validateSlotTime(start: string | null, end: string | null, isAvailable: boolean): string | null {
    if (!isAvailable) return null;
    if (start == null && end == null) return null;
    if (start != null && !TIME_RE.test(start)) return 'Use HH:MM 24-hour format.';
    if (end != null && !TIME_RE.test(end)) return 'Use HH:MM 24-hour format.';
    if (start != null && end != null && toMinutes(end) <= toMinutes(start)) {
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
            start_time: first.start_time,
            end_time: first.end_time,
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

export function isWeekDirty(original: WeekDayDraft[], current: WeekDayDraft[]): boolean {
    if (original.length !== current.length) return true;
    return original.some((o, i) => {
        const c = current[i];
        if (!c) return true;
        return (
            o.is_available !== c.is_available ||
            (o.start_time ?? null) !== (c.start_time ?? null) ||
            (o.end_time ?? null) !== (c.end_time ?? null)
        );
    });
}

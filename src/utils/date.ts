import {
    formatClockTime,
    formatDayMonthOf,
    formatRelativeTimestamp,
    formatYmd,
    monthLong,
    weekdayLong,
    weekdayShort,
} from '../i18n/format';
import { getLocale } from '../i18n/locale';

/**
 * Date/time helpers matching the backend contract in spec §0.4.
 *
 * The backend is the authority on time and always emits:
 * - calendar dates as `Y-m-d` (`shifts.date`, `rosters.week_start`, `leave.start_date`)
 * - clock times as `H:i` (`shifts.start_time` → `"09:00"`)
 * - timestamps as ISO-8601 with offset (`created_at`, `published_at`)
 *
 * There is no server-side "today" endpoint and no per-user timezone conversion
 * (company `timezone` is a display hint only), so date math lives here and is kept
 * free of any timezone library: everything is derived from the device clock and
 * formatted with zero-padding so the strings sent to the API are always `Y-m-d`.
 *
 * `Date`-based parsing of a `Y-m-d` string is avoided throughout — the platform
 * parses bare date strings as UTC midnight, which shifts the day for any user east
 * or west of UTC.
 *
 * ## Formatting is delegated
 *
 * The *display* functions here (`formatTime`, `formatDate`, `formatDayMonth`,
 * `getWeekdayShort`, `getDayName`, `formatRelative`) are thin adapters over
 * [`src/i18n/format.ts`](src/i18n/format.ts:1). That is where the weekday/month names
 * and the 12-hour vs 24-hour decision live, so the two can no longer disagree — which
 * they previously did, with `formatTime` always emitting `AM`/`PM` while the
 * Availability inputs asked for 24-hour `HH:MM`. Date *math* and API serialisation
 * stay here, because they are timezone-and-locale independent by contract.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function pad(value: number): string {
    return value < 10 ? `0${value}` : String(value);
}

/**
 * `employees.day_of_week` / `employee_availabilities.day_of_week` use `0 = Sunday`
 * through `6 = Saturday` (see `app/Models/EmployeeAvailability.php`), which matches
 * JavaScript's `Date.getDay()`. This is deliberately distinct from the roster week
 * index used for display, which starts on Monday (spec Screen 5 — employees cannot
 * read `company_settings.week_start_day`, so Monday is the default).
 */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Formats a `Date` as the backend's `Y-m-d` date format. */
export function toApiDate(date: Date): string {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Parses a `Y-m-d` string into a local-midnight `Date` (never UTC-shifted). */
export function parseApiDate(value: string): Date {
    const [year, month, day] = value.split('-').map(Number);

    if (year === undefined || month === undefined || day === undefined) {
        throw new Error(`Invalid API date: "${value}". Expected Y-m-d.`);
    }

    return new Date(year, month - 1, day);
}

/**
 * Tolerant counterpart to [`parseApiDate`](src/utils/date.ts:81) for UI seams that
 * legitimately receive an empty value — an unset date field, or a partially typed one.
 *
 * Returns `null` instead of throwing so a caller can branch on "not yet chosen"
 * without a try/catch, and so a native picker can be handed a sensible starting
 * point. Still local-midnight, never UTC: `new Date('2026-09-16')` would parse as
 * UTC midnight and render as the 15th for any user west of UTC.
 */
export function fromApiDate(value: string | null | undefined): Date | null {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return null;
    }

    return parseApiDate(value);
}

/** Today according to the device clock, formatted as `Y-m-d`. */
export function todayApiDate(): string {
    return toApiDate(new Date());
}

/** Normalises a clock time from the API (`"09:00"` or `"09:00:00"`) to `H:i`. */
export function toApiTime(value: string): string {
    const [hours, minutes] = value.split(':');

    if (hours === undefined || minutes === undefined) {
        throw new Error(`Invalid API time: "${value}". Expected H:i.`);
    }

    return `${pad(Number(hours))}:${pad(Number(minutes))}`;
}

/**
 * Formats `"09:00"` for display in the active locale's clock cycle.
 *
 * Returns `"—"` for a missing value. In a 12-hour locale this renders `"9:00 AM"`; in
 * a 24-hour locale (en-AU, en-GB, de-DE, …) it renders `"09:00"`. The decision is made
 * by the locale, not by this function, so a shift summary and the availability inputs
 * on the same screen can no longer use different conventions.
 */
export function formatTime(value?: string | null): string {
    if (!value) {
        return '—';
    }

    return formatClockTime(value);
}

/** Formats a `Y-m-d` value for display, in the active locale. Returns `"—"` when null. */
export function formatDate(value?: string | null, options?: { withWeekday?: boolean; long?: boolean }): string {
    if (!value) {
        return '—';
    }

    return formatYmd(parseApiDate(value), options);
}

/** Formats a `Y-m-d` value as e.g. `"15 Sep"` — used in compact week strips. */
export function formatDayMonth(value: string): string {
    return formatDayMonthOf(parseApiDate(value));
}

/** Short weekday name for a `Y-m-d` value, e.g. `"Mon"`. */
export function getWeekdayShort(value: string): string {
    return weekdayShort(parseApiDate(value));
}

/** Long weekday name for an employee week index (`0 = Sunday`). */
export function getDayName(dayOfWeek: DayOfWeek): string {
    // A fixed reference week whose Sunday is day 0, so the index maps directly onto a
    // real date the locale formatter can name — no hardcoded English array.
    const referenceSunday = new Date(2024, 0, 7);

    referenceSunday.setDate(referenceSunday.getDate() + dayOfWeek);

    return weekdayLong(referenceSunday);
}

/** Adds days to a `Y-m-d` value, returning `Y-m-d`. */
export function addDays(value: string, days: number): string {
    const date = parseApiDate(value);

    date.setDate(date.getDate() + days);

    return toApiDate(date);
}

/** Whole days between two `Y-m-d` values (inclusive of `end`). */
export function daysBetween(start: string, end: string): number {
    const startDate = parseApiDate(start).getTime();
    const endDate = parseApiDate(end).getTime();

    return Math.round((endDate - startDate) / MS_PER_DAY) + 1;
}

/** Day index of a `Y-m-d` value using the backend's `0 = Sunday` convention. */
export function getDayOfWeek(value: string): DayOfWeek {
    return parseApiDate(value).getDay() as DayOfWeek;
}

/**
 * Monday of the week containing `value`.
 *
 * The employee role cannot read `company_settings.week_start_day` (spec §0.4/Screen 5),
 * so the mobile roster uses Monday as a documented default.
 */
export function startOfWeek(value: string, weekStartsOn: DayOfWeek = 1): string {
    const current = getDayOfWeek(value);
    const offset = (current - weekStartsOn + 7) % 7;

    return addDays(value, -offset);
}

/** The seven `Y-m-d` values of the week containing `value`, in display order. */
export function weekDates(value: string, weekStartsOn: DayOfWeek = 1): string[] {
    const start = startOfWeek(value, weekStartsOn);

    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

/** `true` when the two `Y-m-d` values are the same calendar day. */
export function isSameApiDate(a: string, b: string): boolean {
    return a === b;
}

/**
 * Formats an ISO-8601 timestamp as a relative string, e.g. `"2h ago"`.
 *
 * The unit labels come from the i18n catalogue; beyond a week the value falls back to
 * an absolute date, which is also locale-formatted.
 */
export function formatRelative(isoTimestamp: string): string {
    const timestamp = new Date(isoTimestamp).getTime();

    if (!Number.isFinite(timestamp)) {
        return '';
    }

    return formatRelativeTimestamp(timestamp, () => formatDate(toApiDate(new Date(timestamp))));
}

/**
 * Duration of a shift in minutes: `end - start - break_minutes`.
 *
 * `break_minutes` is nullable and `paid_break` records whether the break is paid;
 * when the break is paid it does not reduce worked time, so it is only subtracted
 * for unpaid breaks (spec Screen 6).
 */
export function shiftDurationMinutes(
    startTime: string,
    endTime: string,
    breakMinutes?: number | null,
    paidBreak?: boolean | null,
): number {
    const [startHours, startMinutes] = startTime.split(':').map(Number);
    const [endHours, endMinutes] = endTime.split(':').map(Number);

    if (
        startHours === undefined ||
        startMinutes === undefined ||
        endHours === undefined ||
        endMinutes === undefined
    ) {
        return 0;
    }

    let minutes = endHours * 60 + endMinutes - (startHours * 60 + startMinutes);

    // Shifts crossing midnight (e.g. 22:00 → 06:00) are valid roster entries.
    if (minutes < 0) {
        minutes += 24 * 60;
    }

    if (!paidBreak && typeof breakMinutes === 'number' && breakMinutes > 0) {
        minutes -= breakMinutes;
    }

    return Math.max(minutes, 0);
}

/** Formats a minute count as `"8h 30m"`. */
export function formatDuration(minutes: number): string {
    if (minutes <= 0) {
        return '0h';
    }

    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;

    if (hours === 0) {
        return `${remainder}m`;
    }

    if (remainder === 0) {
        return `${hours}h`;
    }

    return `${hours}h ${remainder}m`;
}

export type DurationParts = {
    /** Whole hours. `0` for sub-hour totals — never negative. */
    hours: number;
    /** Leftover whole minutes, `0`–`59` — never negative. */
    minutes: number;
};

/**
 * Splits a minute count into its hour and minute components.
 *
 * Exists for the Home "worked today" hero, which typesets the hours at `display`
 * size and the remainder beside it at `subtitle` size. Doing that with
 * [`formatDuration`](src/utils/date.ts:282) would mean string-parsing `"8h 30m"`
 * back apart at the call site — which breaks the moment the format changes, and
 * cannot distinguish `"0h"` (nothing) from `"0h 45m"` (45 minutes).
 *
 * Negative input is clamped to zero rather than producing negative parts: a
 * negative worked total is a data fault, and rendering `"-1h 30m"` in a hero card
 * would present a bug as a fact.
 */
export function formatDurationParts(minutes: number): DurationParts {
    const safe = Number.isFinite(minutes) && minutes > 0 ? Math.floor(minutes) : 0;

    return {
        hours: Math.floor(safe / 60),
        minutes: safe % 60,
    };
}

/** Long month name for a `Y-m-d` value, for prose use such as a header subtitle. */
export function getMonthLong(value: string): string {
    return monthLong(parseApiDate(value));
}

/** The active locale tag, exposed so a caller can build its own formatter. */
export function activeLocale(): string {
    return getLocale();
}

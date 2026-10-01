import { getHourCycle, getLocale } from './locale';
import { relativeLabel, translate } from './strings';

/**
 * Locale-aware date, time and number formatting.
 *
 * ## What was wrong before
 *
 * [`date.ts`](src/utils/date.ts:1) held hardcoded `WEEKDAY_SHORT`, `WEEKDAY_LONG`,
 * `MONTH_SHORT` and `MONTH_LONG` arrays and a `formatTime` that always emitted
 * `9:00 AM`. That is correct for exactly one audience — `en`, 12-hour — and it
 * disagreed with the app's own inputs, which ask users to *type* 24-hour `HH:MM`.
 *
 * ## What this does instead
 *
 * Names come from `Intl`, so they follow the device language. The clock cycle comes
 * from the locale (see [`locale.ts`](src/i18n/locale.ts:1)), so a 24-hour locale is
 * shown 24-hour times and the display agrees with the input format.
 *
 * ## What it deliberately keeps
 *
 * The **order** of a composed date (`Tue 15 Sep 2026`) stays app-defined rather than
 * being handed to `Intl.DateTimeFormat` wholesale. Two reasons: the app's date strings
 * are also used as accessible labels and in narrow list rows that were laid out
 * against this shape, and a wholesale switch would change every one of those strings
 * at once. Swapping to full locale ordering later is a change to `formatYmd` only.
 */

/**
 * Formatters are cached by `(locale, options)` because constructing an
 * `Intl.DateTimeFormat` is measurably expensive and these run once per visible row.
 */
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
    const locale = getLocale();
    const key = `${locale}|${JSON.stringify(options)}`;
    const cached = formatterCache.get(key);

    if (cached !== undefined) {
        return cached;
    }

    const formatter = new Intl.DateTimeFormat(locale, options);
    formatterCache.set(key, formatter);

    return formatter;
}

/** Short weekday name in the active locale, e.g. `"Tue"`. */
export function weekdayShort(date: Date): string {
    return getFormatter({ weekday: 'short' }).format(date);
}

/** Long weekday name in the active locale, e.g. `"Tuesday"`. */
export function weekdayLong(date: Date): string {
    return getFormatter({ weekday: 'long' }).format(date);
}

/** Short month name in the active locale, e.g. `"Sep"`. */
export function monthShort(date: Date): string {
    return getFormatter({ month: 'short' }).format(date);
}

/** Long month name in the active locale, e.g. `"September"`. */
export function monthLong(date: Date): string {
    return getFormatter({ month: 'long' }).format(date);
}

/**
 * Formats a 24-hour `H:i` clock value for display in the locale's cycle.
 *
 * The input is the API's interchange format and is never reinterpreted as a timezone
 * — it is a wall-clock time for the shift, so it is formatted from the numbers alone.
 * In a 12-hour locale the day period is taken from the locale rather than hardcoded
 * to `AM`/`PM`, so a locale with different period markers renders correctly.
 */
export function formatClockTime(value: string): string {
    const [rawHours, rawMinutes] = value.split(':');
    const hours = Number(rawHours);
    const minutes = Number(rawMinutes);

    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
        return value;
    }

    if (getHourCycle() === 'h23') {
        const paddedHours = hours < 10 ? `0${hours}` : String(hours);
        const paddedMinutes = minutes < 10 ? `0${minutes}` : String(minutes);

        return `${paddedHours}:${paddedMinutes}`;
    }

    // `Date` is used purely as a carrier for the formatter; the y/m/d are irrelevant
    // because only the time parts are requested, and the local constructor avoids any
    // UTC shift.
    const carrier = new Date(2000, 0, 1, hours, minutes);

    return getFormatter({ hour: 'numeric', minute: '2-digit' }).format(carrier);
}

/** Composed date string, e.g. `"Tue 15 Sep 2026"` / `"Tue 15 September 2026"`. */
export function formatYmd(
    date: Date,
    options?: { withWeekday?: boolean; long?: boolean },
): string {
    const weekday = options?.withWeekday === false ? null : weekdayShort(date);
    const month = options?.long === true ? monthLong(date) : monthShort(date);

    return [weekday, String(date.getDate()), month, String(date.getFullYear())]
        .filter((part): part is string => Boolean(part))
        .join(' ');
}

/** Compact day + month, e.g. `"15 Sep"`. */
export function formatDayMonthOf(date: Date): string {
    return `${date.getDate()} ${monthShort(date)}`;
}

/** Relative timestamp label, e.g. `"2h ago"`, or an absolute date beyond a week. */
export function formatRelativeTimestamp(timestampMs: number, fallback: () => string): string {
    const diffSeconds = Math.round((Date.now() - timestampMs) / 1000);

    if (diffSeconds < 60) {
        return translate('relative.justNow');
    }

    const diffMinutes = Math.round(diffSeconds / 60);

    if (diffMinutes < 60) {
        return relativeLabel('minutes', diffMinutes);
    }

    const diffHours = Math.round(diffMinutes / 60);

    if (diffHours < 24) {
        return relativeLabel('hours', diffHours);
    }

    const diffDays = Math.round(diffHours / 24);

    if (diffDays < 7) {
        return relativeLabel('days', diffDays);
    }

    return fallback();
}

/**
 * The hint shown under an availability time input.
 *
 * Lives here rather than inline so the *input* format and the *display* format are
 * described by the same module — the defect this file fixes was two conventions for
 * one value.
 */
export function clockInputHint(): string {
    return getHourCycle() === 'h23'
        ? translate('availability.timeFormat24h')
        : translate('availability.timeFormat12h');
}

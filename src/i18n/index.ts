/**
 * Internationalization barrel.
 *
 * Three concerns, one entry point:
 *  - [`locale`](src/i18n/locale.ts:1) — which locale and clock cycle are active, and
 *    the override seam a future language setting will write to.
 *  - [`strings`](src/i18n/strings.ts:1) — the copy catalogue plus data-derived labels
 *    (status vocabulary, relative-time units).
 *  - [`format`](src/i18n/format.ts:1) — locale-aware date, time and composed-date
 *    formatting, consumed by [`utils/date`](src/utils/date.ts:1).
 */
export {
    DEFAULT_LOCALE,
    getDeviceLocale,
    getHourCycle,
    getLocale,
    resetLocaleOverrides,
    setHourCycleOverride,
    setLocaleOverride,
    uses24HourClock,
    type HourCycle,
} from './locale';

export {
    clockInputHint,
    formatClockTime,
    formatDayMonthOf,
    formatRelativeTimestamp,
    formatYmd,
    monthLong,
    monthShort,
    weekdayLong,
    weekdayShort,
} from './format';

export {
    en,
    relativeLabel,
    statusLabel,
    translate,
    type Catalogue,
    type StringKey,
} from './strings';

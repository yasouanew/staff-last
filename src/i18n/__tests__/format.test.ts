import {
    clockInputHint,
    formatClockTime,
    formatRelativeTimestamp,
    formatYmd,
    resetLocaleOverrides,
    setHourCycleOverride,
    setLocaleOverride,
    statusLabel,
    translate,
    uses24HourClock,
} from '../index';

/**
 * Locale-aware formatting.
 *
 * The hour cycle is pinned explicitly rather than left to the machine running the
 * suite: a test that passes on a 24-hour CI box and fails on a 12-hour laptop is not
 * a test. `resetLocaleOverrides()` in `afterEach` keeps the modules' module-scope
 * overrides from leaking into other suites.
 */
afterEach(() => {
    resetLocaleOverrides();
});

describe('formatClockTime', () => {
    it('renders a 24-hour clock in a 24-hour locale', () => {
        setHourCycleOverride('h23');

        expect(formatClockTime('09:00')).toBe('09:00');
        expect(formatClockTime('17:30')).toBe('17:30');
        expect(formatClockTime('00:05')).toBe('00:05');
    });

    it('renders a 12-hour clock with a day period in a 12-hour locale', () => {
        setHourCycleOverride('h12');

        expect(formatClockTime('09:00')).toMatch(/^9:00\s?AM$/);
        expect(formatClockTime('17:30')).toMatch(/^5:30\s?PM$/);
    });

    it('renders midnight as 12 AM rather than 0 or 24', () => {
        setHourCycleOverride('h12');

        expect(formatClockTime('00:00')).toMatch(/^12:00\s?AM$/);
    });

    it('passes a malformed value through rather than rendering NaN', () => {
        expect(formatClockTime('not-a-time')).toBe('not-a-time');
    });
});

describe('uses24HourClock / clockInputHint', () => {
    it('reports the pinned cycle and describes it in the input hint', () => {
        setHourCycleOverride('h23');
        expect(uses24HourClock()).toBe(true);
        expect(clockInputHint()).toContain('24-hour');

        setHourCycleOverride('h12');
        expect(uses24HourClock()).toBe(false);
        expect(clockInputHint()).not.toContain('24-hour');
    });

    it('agrees with the display format, which is the defect this closes', () => {
        setHourCycleOverride('h23');

        // In a 24-hour locale the input hint and the rendered value use one convention.
        expect(clockInputHint()).toContain('24-hour');
        expect(formatClockTime('14:00')).toBe('14:00');
    });
});

describe('formatYmd', () => {
    it('composes the app date shape in the active locale', () => {
        setLocaleOverride('en');

        const date = new Date(2026, 8, 15);

        expect(formatYmd(date)).toBe('Tue 15 Sep 2026');
        expect(formatYmd(date, { long: true })).toBe('Tue 15 September 2026');
        expect(formatYmd(date, { withWeekday: false })).toBe('15 Sep 2026');
    });
});

describe('formatRelativeTimestamp', () => {
    it('renders relative units through the catalogue', () => {
        const minutesAgo = Date.now() - 5 * 60 * 1000;

        expect(formatRelativeTimestamp(minutesAgo, () => 'fallback')).toBe('5m ago');
    });

    it('falls back to an absolute date beyond a week', () => {
        const longAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

        expect(formatRelativeTimestamp(longAgo, () => 'absolute')).toBe('absolute');
    });

    it('labels sub-minute timestamps as "Just now"', () => {
        expect(formatRelativeTimestamp(Date.now(), () => 'fallback')).toBe('Just now');
    });
});

describe('statusLabel', () => {
    it('maps known API enums to words, never snake_case', () => {
        expect(statusLabel('swap_requested')).toBe('Swap requested');
        expect(statusLabel('full_day')).toBe('Full day');
        expect(statusLabel('approved')).toBe('Approved');
    });

    it('degrades an unknown status to a readable word rather than an empty string', () => {
        expect(statusLabel('on_hold')).toBe('On hold');
    });
});

describe('translate', () => {
    it('substitutes placeholders', () => {
        expect(translate('relative.hours', { count: 3 })).toBe('3h ago');
    });

    it('leaves an unmatched placeholder in place rather than printing undefined', () => {
        expect(translate('relative.hours')).toContain('{count}');
    });
});

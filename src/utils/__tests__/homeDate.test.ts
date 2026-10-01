import {
    addDays,
    formatDate,
    formatDuration,
    shiftDurationMinutes,
    toApiDate,
    todayApiDate,
} from '../date';

/**
 * Home derives "today" client-side from the device clock (spec Screen 4 BACKEND
 * GAP — no `/today` endpoint). These tests pin the date math the dashboard
 * depends on: `Y-m-d` formatting, day arithmetic, and worked-time computation
 * with paid/unpaid breaks and midnight-crossing shifts.
 */
describe('todayApiDate', () => {
    it('emits Y-m-d with zero-padding so the shifts query never 422s', () => {
        expect(todayApiDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('matches toApiDate(new Date()) — the device clock is the source of truth', () => {
        expect(todayApiDate()).toBe(toApiDate(new Date()));
    });
});

describe('addDays', () => {
    it('advances across month boundaries', () => {
        expect(addDays('2026-09-15', 1)).toBe('2026-09-16');
        expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    });

    it('goes backwards for negative offsets (tomorrow → today)', () => {
        expect(addDays('2026-09-16', -1)).toBe('2026-09-15');
    });

    it('supports the +7d upcoming window used for "Next up"', () => {
        expect(addDays('2026-09-15', 7)).toBe('2026-09-22');
    });
});

describe('shiftDurationMinutes', () => {
    it('computes a plain day shift', () => {
        expect(shiftDurationMinutes('09:00', '17:00', null, null)).toBe(480);
    });

    it('subtracts an unpaid break but keeps a paid break', () => {
        expect(shiftDurationMinutes('09:00', '17:00', 30, false)).toBe(450);
        expect(shiftDurationMinutes('09:00', '17:00', 30, true)).toBe(480);
    });

    it('treats a null paid_break as unpaid (break still reduces worked time)', () => {
        expect(shiftDurationMinutes('09:00', '17:00', 30, null)).toBe(450);
    });

    it('handles midnight-crossing shifts (22:00 → 06:00)', () => {
        expect(shiftDurationMinutes('22:00', '06:00', null, null)).toBe(480);
    });

    it('never returns a negative duration', () => {
        expect(shiftDurationMinutes('09:00', '09:00', 60, false)).toBe(0);
    });
});

describe('formatDate', () => {
    it('renders the Home date header as "Tue 15 Sep 2026"', () => {
        expect(formatDate('2026-09-15')).toBe('Tue 15 Sep 2026');
    });

    it('renders the long variant used for the header subtitle', () => {
        expect(formatDate('2026-09-15', { long: true })).toBe('Tue 15 September 2026');
    });

    it('returns an em dash for missing dates instead of "undefined"', () => {
        expect(formatDate(null)).toBe('—');
        expect(formatDate(undefined)).toBe('—');
    });
});

describe('formatDuration', () => {
    it('renders the "Worked time today" summary', () => {
        expect(formatDuration(450)).toBe('7h 30m');
        expect(formatDuration(480)).toBe('8h');
        expect(formatDuration(0)).toBe('0h');
    });
});

import { addDays, startOfWeek, weekDates } from '../date';

/**
 * My Roster derives its week client-side (spec Screen 5 BACKEND GAP — no
 * `my-roster` endpoint, and the employee role cannot read
 * `company_settings.week_start_day`). Monday is the documented default.
 */
describe('startOfWeek', () => {
    it('returns Monday for a mid-week date', () => {
        // 2026-09-15 is a Tuesday.
        expect(startOfWeek('2026-09-15')).toBe('2026-09-14');
    });

    it('returns the same day when already Monday', () => {
        expect(startOfWeek('2026-09-14')).toBe('2026-09-14');
    });

    it('wraps Sunday back to the previous Monday', () => {
        expect(startOfWeek('2026-09-20')).toBe('2026-09-14');
    });
});

describe('weekDates', () => {
    it('returns seven days Mon–Sun in display order', () => {
        expect(weekDates('2026-09-15')).toEqual([
            '2026-09-14',
            '2026-09-15',
            '2026-09-16',
            '2026-09-17',
            '2026-09-18',
            '2026-09-19',
            '2026-09-20',
        ]);
    });

    it('spans month boundaries', () => {
        const dates = weekDates('2026-09-30');

        expect(dates).toHaveLength(7);
        expect(dates[0]).toBe('2026-09-28');
        expect(dates[6]).toBe('2026-10-04');
    });
});

describe('week navigation', () => {
    it('moves a full week for prev/next', () => {
        expect(addDays('2026-09-15', -7)).toBe('2026-09-08');
        expect(addDays('2026-09-15', 7)).toBe('2026-09-22');
    });

    it('derives weekEnd as weekStart + 6', () => {
        const start = startOfWeek('2026-09-15');

        expect(addDays(start, 6)).toBe('2026-09-20');
    });
});

import { formatDurationParts } from '../date';

/**
 * `formatDurationParts` splits a worked-minutes total into the two numbers the
 * Home "Today" hero renders as a large figure (`12h 30m`). The hero is the
 * first thing an employee sees, so a negative or `NaN` result would be a
 * visible data fault on the landing screen. These tests pin the two
 * guarantees the component relies on: hours/minutes split correctly, and a bad
 * input degrades to `0` rather than rendering "NaN" or "-1h".
 */
describe('formatDurationParts', () => {
    it('splits a whole-hour total with zero minutes', () => {
        expect(formatDurationParts(480)).toEqual({ hours: 8, minutes: 0 });
    });

    it('splits a mixed total into hours and remainder minutes', () => {
        expect(formatDurationParts(750)).toEqual({ hours: 12, minutes: 30 });
    });

    it('keeps sub-hour totals as 0 hours', () => {
        expect(formatDurationParts(45)).toEqual({ hours: 0, minutes: 45 });
    });

    it('returns 0/0 for zero minutes (no shift yet today)', () => {
        expect(formatDurationParts(0)).toEqual({ hours: 0, minutes: 0 });
    });

    it('clamps negative input to 0 rather than showing a negative figure', () => {
        expect(formatDurationParts(-30)).toEqual({ hours: 0, minutes: 0 });
    });

    it('clamps NaN to 0 — a missing duration must not render as "NaN"', () => {
        expect(formatDurationParts(Number.NaN)).toEqual({ hours: 0, minutes: 0 });
    });

    it('clamps Infinity to 0 rather than emitting an infinite figure', () => {
        expect(formatDurationParts(Number.POSITIVE_INFINITY)).toEqual({ hours: 0, minutes: 0 });
    });

    it('floors a fractional total so the figure never overstates worked time', () => {
        expect(formatDurationParts(750.9)).toEqual({ hours: 12, minutes: 30 });
    });
});

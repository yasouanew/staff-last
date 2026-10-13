import { availabilityCopy, TIME_END_HINT, TIME_INPUT_HINT } from '../copy';

/**
 * Copy contract.
 *
 * The time-format hint is the specific defect this module closes: two builds
 * described the same field with two different conventions. These tests pin the
 * single spelling so it cannot drift back.
 */
describe('time input hints', () => {
    it('describes the 24-hour input format in one canonical spelling', () => {
        expect(TIME_INPUT_HINT).toBe('HH:MM (24h)');
    });

    it('never mentions the AM/PM variant the input does not accept', () => {
        expect(TIME_INPUT_HINT).not.toContain('AM/PM');
        expect(TIME_INPUT_HINT).not.toContain('12-hour');
    });

    it('states the end-time constraint', () => {
        expect(TIME_END_HINT).toBe('Must be after start');
    });
});

describe('availability copy', () => {
    it('pins the spec-verbatim strings', () => {
        expect(availabilityCopy.title).toBe('Availability');
        expect(availabilityCopy.subtitle).toBe('Your usual working pattern.');
        expect(availabilityCopy.unsaved).toBe('You have unsaved changes.');
        expect(availabilityCopy.unavailable).toBe('Unavailable');
        expect(availabilityCopy.availableAllDay).toBe('Available all day');
        expect(availabilityCopy.markUnavailable).toBe('Mark as unavailable');
        expect(availabilityCopy.saveWeek).toBe('Save week');
    });

    it('keeps the intro copy the spec requires', () => {
        expect(availabilityCopy.intro).toBe(
            'Set the hours you prefer to work each day. Days marked unavailable are left out of rostering.',
        );
    });
});

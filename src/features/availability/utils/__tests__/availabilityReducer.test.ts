import {
    availabilityReducer,
    createAvailabilityState,
    isAvailabilityDirty,
    type AvailabilityState,
} from '../availabilityReducer';
import type { WeekDayDraft } from '../availabilityWeek';

/**
 * Dirty-state rules for the availability screen.
 *
 * The banner and the save button's enabled state both derive from
 * `isAvailabilityDirty`, so these tests pin the one derivation they share.
 */

function week(overrides: Partial<WeekDayDraft>[] = []): WeekDayDraft[] {
    return Array.from({ length: 7 }, (_, day) => ({
        day_of_week: day as WeekDayDraft['day_of_week'],
        is_available: false,
        start_time: null,
        end_time: null,
        ...(overrides[day] ?? {}),
    }));
}

describe('availabilityReducer', () => {
    it('starts clean, with the server week as both days and baseline', () => {
        const days = week([{ is_available: true, start_time: '09:00', end_time: '17:00' }]);
        const state = createAvailabilityState(days);

        // `days` and `original` are independent copies, so an edit to one can
        // never mutate the other through a shared reference.
        expect(state.days).toStrictEqual(days);
        expect(state.original).toStrictEqual(days);
        expect(state.days).not.toBe(days);
        expect(state.original).not.toBe(days);
        expect(state.days).not.toBe(state.original);
        expect(isAvailabilityDirty(state)).toBe(false);
    });

    it('becomes dirty when a day is toggled', () => {
        const state = createAvailabilityState(week());

        const next = availabilityReducer(state, {
            type: 'updateDay',
            day: 1,
            patch: { is_available: true },
        });

        expect(isAvailabilityDirty(next)).toBe(true);
        expect(next.days[1]?.is_available).toBe(true);
    });

    it('becomes dirty when a time changes', () => {
        const state = createAvailabilityState(
            week([{ is_available: true, start_time: '09:00', end_time: '17:00' }]),
        );

        const next = availabilityReducer(state, {
            type: 'updateDay',
            day: 0,
            patch: { start_time: '08:00' },
        });

        expect(isAvailabilityDirty(next)).toBe(true);
    });

    it('clears a stale confirmation on the next edit', () => {
        const state: AvailabilityState = {
            ...createAvailabilityState(week()),
            savedMessage: 'Availability saved.',
        };

        const next = availabilityReducer(state, {
            type: 'updateDay',
            day: 2,
            patch: { is_available: true },
        });

        expect(next.savedMessage).toBeNull();
    });

    it('reset restores the baseline and clears the confirmation', () => {
        const original = week([{ is_available: true, start_time: '09:00', end_time: '17:00' }]);
        const dirty = availabilityReducer(createAvailabilityState(original), {
            type: 'updateDay',
            day: 3,
            patch: { is_available: true },
        });

        const reset = availabilityReducer(dirty, { type: 'reset' });

        expect(isAvailabilityDirty(reset)).toBe(false);
        expect(reset.days).toStrictEqual(original);
        expect(reset.days).not.toBe(original);
        expect(reset.savedMessage).toBeNull();
    });

    it('a save that adopts the server week leaves the screen clean', () => {
        const dirty = availabilityReducer(createAvailabilityState(week()), {
            type: 'updateDay',
            day: 1,
            patch: { is_available: true, start_time: '09:00', end_time: '17:00' },
        });

        const serverWeek = week([
            { is_available: true, start_time: '09:00', end_time: '17:00' },
        ]);

        const saved = availabilityReducer(dirty, {
            type: 'saved',
            message: 'Availability saved.',
            days: serverWeek,
        });

        expect(isAvailabilityDirty(saved)).toBe(false);
        expect(saved.days).toStrictEqual(serverWeek);
        expect(saved.original).toStrictEqual(serverWeek);
        expect(saved.days).not.toBe(serverWeek);
        expect(saved.original).not.toBe(serverWeek);
        expect(saved.savedMessage).toBe('Availability saved.');
    });

    it('a queued save keeps the local edits as the new baseline', () => {
        const dirty = availabilityReducer(createAvailabilityState(week()), {
            type: 'updateDay',
            day: 1,
            patch: { is_available: true },
        });

        const queued = availabilityReducer(dirty, {
            type: 'saved',
            message: 'Saved on this device. It will sync when you are back online.',
        });

        // The server has not received the week, so the local edits become the
        // baseline — the screen is clean, but the data is the user's, not the
        // server's.
        expect(isAvailabilityDirty(queued)).toBe(false);
        expect(queued.days[1]?.is_available).toBe(true);
        expect(queued.savedMessage).toContain('sync');
    });

    it('init replaces the whole slice from a server week', () => {
        const dirty = availabilityReducer(createAvailabilityState(week()), {
            type: 'updateDay',
            day: 1,
            patch: { is_available: true },
        });

        const refreshed = availabilityReducer(dirty, {
            type: 'init',
            days: week([{ is_available: true, start_time: '10:00', end_time: '18:00' }]),
        });

        expect(isAvailabilityDirty(refreshed)).toBe(false);
        expect(refreshed.days[0]?.start_time).toBe('10:00');
        expect(refreshed.savedMessage).toBeNull();
    });
});

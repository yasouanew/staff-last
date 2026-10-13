import type { DayOfWeek } from '../../../utils/date';
import { isWeekDirty, type WeekDayDraft } from './availabilityWeek';

/**
 * Availability screen state.
 *
 * ## Why a reducer rather than three `useState` calls
 *
 * The screen has three pieces of state that must move together: the editable
 * `days`, the `original` baseline they are compared against, and the transient
 * `savedMessage`. Keeping them in one reducer means:
 *
 *  - `isDirty` is *derived* from `original` vs `days` on every render, so the
 *    unsaved banner and the save button's enabled state can never disagree with
 *    the data — there is no separate boolean to forget to update.
 *  - A save that returns the server's canonical week replaces both `days` and
 *    `original` in one transition, so the screen is instantly clean again.
 *  - A pull-to-refresh re-initialises the whole slice atomically.
 *
 * The reducer is pure and exported, so the dirty-state rules are unit-testable
 * without a renderer.
 */
export type AvailabilityState = {
    /** The editable week. */
    days: WeekDayDraft[];
    /** The last-known server week, used as the dirty baseline. */
    original: WeekDayDraft[];
    /** Transient confirmation copy, cleared on the next edit. */
    savedMessage: string | null;
};

export type AvailabilityAction =
    /** Replace the whole slice from a server week (initial load or refresh). */
    | { type: 'init'; days: WeekDayDraft[] }
    /** Patch one day. Clears any stale confirmation. */
    | { type: 'updateDay'; day: DayOfWeek; patch: Partial<WeekDayDraft> }
    /** Discard edits, restoring the server baseline. */
    | { type: 'reset' }
    /** Record a successful save; optionally adopt the server's canonical week. */
    | { type: 'saved'; message: string; days?: WeekDayDraft[] };

export function createAvailabilityState(
    days: WeekDayDraft[],
): AvailabilityState {
    return {
        days: days.map(day => ({ ...day })),
        original: days.map(day => ({ ...day })),
        savedMessage: null,
    };
}

export function availabilityReducer(
    state: AvailabilityState,
    action: AvailabilityAction,
): AvailabilityState {
    switch (action.type) {
        case 'init':
            return createAvailabilityState(action.days);

        case 'updateDay':
            return {
                ...state,
                savedMessage: null,
                days: state.days.map(entry =>
                    entry.day_of_week === action.day ? { ...entry, ...action.patch } : entry,
                ),
            };

        case 'reset':
            return {
                ...state,
                days: state.original.map(day => ({ ...day })),
                savedMessage: null,
            };

        case 'saved': {
            // When the server echoes the canonical week, adopt it as the new
            // baseline so the screen is clean; otherwise keep the local edits as
            // the baseline (an offline queue has no server week to adopt).
            const savedDays =
                action.days !== undefined
                    ? action.days
                    : state.days;

            return {
                days: savedDays.map(day => ({ ...day })),
                original: savedDays.map(day => ({ ...day })),
                savedMessage: action.message,
            };
        }

        default:
            return state;
    }
}

/** `true` when the editable week differs from the server baseline. */
export function isAvailabilityDirty(state: AvailabilityState): boolean {
    return isWeekDirty(state.original, state.days);
}

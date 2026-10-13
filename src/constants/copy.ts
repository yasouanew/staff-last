/**
 * Centralised copy constants.
 *
 * ## Why this file exists
 *
 * The Availability screen previously described its time inputs with two different
 * conventions depending on the build: a hardcoded `"HH:MM, 24-hour"` in one place
 * and a locale-derived `"H:MM AM/PM"` in another. Two strings for one value is
 * exactly the kind of drift that makes a form feel untrustworthy — the user cannot
 * tell which format the field actually accepts.
 *
 * The time inputs always take 24-hour `HH:MM` (the API's interchange format), so
 * the hint is now a single, locale-independent constant. It lives here rather than
 * inline so a second screen that ever needs the same field cannot invent a third
 * spelling of it.
 *
 * ## Scope
 *
 * This is deliberately *not* a wholesale extraction of every literal in the tree.
 * It holds the strings that are either (a) shared across more than one surface, or
 * (b) the specific copy the design spec pins verbatim. Screen-local prose that will
 * never vary stays on its screen.
 */

/**
 * The one canonical hint shown under a time input.
 *
 * `HH:MM (24h)` states both the shape and the cycle in the fewest characters, and
 * is identical on every build — the AM/PM variant is gone.
 */
export const TIME_INPUT_HINT = 'HH:MM (24h)';

/** The constraint hint shown under the end-time input. */
export const TIME_END_HINT = 'Must be after start';

/**
 * Availability screen copy.
 *
 * Pinned verbatim by the design spec so the header, the intro, the day rows and
 * the save bar cannot drift apart between revisions.
 */
export const availabilityCopy = {
    /** Screen title. */
    title: 'Availability',
    /** Header subtitle. */
    subtitle: 'Your usual working pattern.',
    /** Intro paragraph under the header. */
    intro:
        'Set the hours you prefer to work each day. Days marked unavailable are left out of rostering.',
    /** Inline unsaved-changes banner. */
    unsaved: 'You have unsaved changes.',
    /** Day-row subline when the day is toggled off. */
    unavailable: 'Unavailable',
    /** Day-row subline when the day is available with no time range. */
    availableAllDay: 'Available all day',
    /** Start-time field label. */
    startLabel: 'Start',
    /** End-time field label. */
    endLabel: 'End',
    /** Link that turns an available day off. */
    markUnavailable: 'Mark as unavailable',
    /** Sticky save-bar button label. */
    saveWeek: 'Save week',
    /** Confirmation after a successful server save. */
    saved: 'Availability saved.',
    /** Confirmation when the save was queued offline. */
    queued: 'Saved on this device. It will sync when you are back online.',
    /** Footnote under the save button. */
    saveNote: 'Saving replaces the whole week at once.',
} as const;

export type AvailabilityCopy = typeof availabilityCopy;

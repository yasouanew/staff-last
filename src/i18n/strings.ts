/**
 * String catalogue.
 *
 * ## What this is, and what it deliberately is not
 *
 * Today the app ships **one** locale. This module exists so that copy has a single
 * home the moment a second is added, and so that copy which is *derived from data*
 * rather than written inline — status words, weekday names, relative timestamps —
 * stops being scattered across components.
 *
 * It is therefore not a wholesale extraction of every literal in the tree. Extracting
 * a string that will never vary adds indirection to every call site for no benefit;
 * what it does not do is add value. The catalogue covers the surfaces that are
 * genuinely locale-dependent or reused across many screens:
 *
 *  - navigation and tab labels,
 *  - status vocabulary (shift / leave / roster), which is also what the screen reader
 *    announces,
 *  - relative-time units, which need plural handling.
 *
 * ## Extension rule
 *
 * A new key is added here when a string is either (a) shown in more than one place, or
 * (b) derived from a value rather than written at a call site. Inline copy that lives
 * on exactly one screen stays on that screen until there is a reason to move it.
 */

/** The key set the app resolves against. `en` is the reference implementation. */
export const en = {
    /* ---- Navigation ---- */
    'nav.home': 'Home',
    'nav.roster': 'Roster',
    'nav.availability': 'Availability',
    'nav.leave': 'Leave',
    'nav.account': 'Account',

    /* ---- Shared actions ---- */
    'action.retry': 'Try again',
    'action.cancel': 'Cancel',
    'action.back': 'Go back',
    'action.save': 'Save',

    /* ---- Status vocabulary: shifts ---- */
    'status.scheduled': 'Scheduled',
    'status.completed': 'Completed',
    'status.cancelled': 'Cancelled',
    'status.swap_requested': 'Swap requested',

    /* ---- Status vocabulary: leave ---- */
    'status.pending': 'Pending',
    'status.approved': 'Approved',
    'status.rejected': 'Rejected',

    /* ---- Status vocabulary: rosters ---- */
    'status.draft': 'Draft',
    'status.published': 'Published',

    /* ---- Status vocabulary: users ---- */
    'status.active': 'Active',
    'status.inactive': 'Inactive',

    /* ---- Leave session slots ---- */
    'session.full_day': 'Full day',
    'session.first_half': 'First half',
    'session.second_half': 'Second half',

    /* ---- Relative time ---- */
    'relative.justNow': 'Just now',
    /** `{count}` is substituted with the number of minutes. */
    'relative.minutes': '{count}m ago',
    'relative.hours': '{count}h ago',
    'relative.days': '{count}d ago',

    /* ---- Availability ---- */
    'availability.timeFormat24h': 'HH:MM, 24-hour',
    'availability.timeFormat12h': 'H:MM AM/PM',

    /* ---- Accessibility announcements ---- */
    'a11y.passwordUpdated': 'Password updated.',
    'a11y.profileSaved': 'Personal details saved.',
    'a11y.leaveSubmitted': 'Leave request submitted.',
    'a11y.availabilitySaved': 'Availability saved.',
    'a11y.availabilityQueued': 'Saved on this device. It will sync when you are back online.',
} as const;

/** A valid catalogue key. */
export type StringKey = keyof typeof en;

/** Every locale's catalogue must supply the full key set. */
export type Catalogue = Record<StringKey, string>;

type Substitutions = Record<string, string | number>;

/**
 * Replaces `{name}` placeholders.
 *
 * A deliberately tiny substitution rather than ICU MessageFormat: the app needs
 * numbers in four strings, and pulling in a message-format runtime for that would be
 * a dependency with more surface area than the problem. Plural *selection* is handled
 * by supplying distinct keys, which is the part that actually varies by language.
 */
function substitute(template: string, values?: Substitutions): string {
    if (values === undefined) {
        return template;
    }

    return template.replace(/\{(\w+)\}/g, (match, name: string) => {
        const value = values[name];

        return value === undefined ? match : String(value);
    });
}

/**
 * Resolves a key against the active catalogue.
 *
 * Falls back to `en` for any key a future catalogue omits, so a partially translated
 * language degrades to English rather than rendering the raw key.
 */
export function translate(key: StringKey, values?: Substitutions): string {
    return substitute(en[key], values);
}

/**
 * Human label for an API status value.
 *
 * The API emits snake_case enums (`swap_requested`, `full_day`); those must never
 * reach the screen. Unknown values fall back to a title-cased de-snake_cased form
 * rather than an empty string, so a backend that adds a status degrades to something
 * readable instead of to a blank badge — the same rule
 * [`StatusBadge`](src/components/StatusBadge/StatusBadge.tsx:1) already applies.
 */
export function statusLabel(status: string): string {
    const key = `status.${status}` as StringKey;

    if (key in en) {
        return en[key];
    }

    return status.replace(/_/g, ' ').replace(/^\w/, character => character.toUpperCase());
}

/**
 * Relative-time label for a count and unit.
 *
 * Kept as a function (rather than four keys resolved at call sites) so the unit→key
 * mapping lives with the catalogue and a plural-aware locale has one place to branch.
 */
export function relativeLabel(unit: 'minutes' | 'hours' | 'days', count: number): string {
    return translate(`relative.${unit}` as StringKey, { count });
}

/**
 * Haptic tokens.
 *
 * Why the trigger names are declared here instead of imported
 * -----------------------------------------------------------
 * `react-native-haptic-feedback` exports a `HapticFeedbackTypes` map, but
 * importing it into the theme layer would make the token file depend on a native
 * module at import time — which breaks any non-native consumer (tests, the
 * Metro-side style factory, storybooks). The library's trigger names are a
 * stable, documented string union, so they are re-declared here as the single
 * source of truth and the component layer passes them straight through.
 *
 * The `bySemantic` map is the point of this file: a component asks for
 * "a successful action" or "a destructive confirmation", not for
 * "impactMedium". That keeps the *feel* consistent as the product grows, and
 * makes it trivial to tune the whole app's haptics from one place.
 */

/**
 * The trigger vocabulary understood by `react-native-haptic-feedback`.
 * Mirrors the library's `HapticFeedbackTypes` union.
 */
export type HapticTrigger =
    | 'selection'
    | 'impactLight'
    | 'impactMedium'
    | 'impactHeavy'
    | 'soft'
    | 'rigid'
    | 'notificationSuccess'
    | 'notificationWarning'
    | 'notificationError';

/**
 * Semantic → trigger mapping.
 *
 * Deliberately conservative: haptics are seasoning. Only state *changes* that
 * carry meaning (a selection landing, an action succeeding or failing) fire one;
 * mere navigation does not, or the device buzzes constantly.
 */
export const hapticFeedback = {
    /** Moving through a segmented control, filter chip or week strip. */
    selection: 'selection',
    /** A primary action being pressed — the lightest acknowledgement. */
    actionPress: 'impactLight',
    /** A consequential action committing (submit, confirm, send). */
    actionCommit: 'impactMedium',
    /** Destructive action arming or committing (sign out, delete). */
    destructive: 'impactHeavy',
    /** Pull-to-refresh trigger and other mechanical detents. */
    detent: 'soft',
    /** An operation completing successfully. */
    success: 'notificationSuccess',
    /** A recoverable problem the user should notice. */
    warning: 'notificationWarning',
    /** A validation failure or blocked action. */
    error: 'notificationError',
} as const satisfies Record<string, HapticTrigger>;

export type HapticSemantic = keyof typeof hapticFeedback;

/**
 * Which semantics are suppressed when the user has reduced motion enabled.
 *
 * Reduced motion is a proxy signal for "I want fewer sensory interruptions" on
 * both major platforms, so the decorative triggers are dropped while the
 * *informational* ones (success/error) are kept — those convey state, not flair.
 */
export const reducedMotionSuppressed: ReadonlySet<HapticSemantic> = new Set([
    'selection',
    'actionPress',
    'detent',
]);

export const haptics = {
    feedback: hapticFeedback,
    reducedMotionSuppressed,
} as const;

export type Haptics = typeof haptics;

import { AccessibilityInfo } from 'react-native';

/**
 * Screen-reader announcement helpers.
 *
 * ## Why this exists
 *
 * `accessibilityLiveRegion` (Android) and `accessibilityRole="alert"` cover *errors*
 * across the app, but they do not cover the **success** case: a mutation that swaps a
 * screen, closes a sheet, or silently flips stored state announces nothing. A
 * VoiceOver / TalkBack user then has no confirmation that the action they triggered
 * actually happened.
 *
 * These helpers are the one place that decision lives, so a successful mutation is
 * announced the same way everywhere and a future screen cannot forget the pattern.
 *
 * ## Polite vs assertive
 *
 * `announceForAccessibility` is the *polite* queue: it waits for the current utterance
 * to finish. That is the correct default for a success confirmation, which must never
 * interrupt what the user is currently reading. The assertive variant is offered for
 * the rare case where an interruption is warranted, and is named so it cannot be
 * reached for casually.
 */

/**
 * Queues a polite announcement. Safe to call when no screen reader is active — the
 * native call is a no-op in that case, so callers never need to guard it.
 *
 * Empty/whitespace messages are dropped: an empty announcement is a no-op that noisy
 * call sites would otherwise emit on every render.
 */
export function announceForAccessibility(message: string): void {
    const trimmed = message.trim();

    if (trimmed.length === 0) {
        return;
    }

    AccessibilityInfo.announceForAccessibility(trimmed);
}

/**
 * Assertive announcement — interrupts the current utterance.
 *
 * Reserved for time-critical failures (e.g. a session expiry) where waiting for the
 * polite queue would let the user act on a screen that is no longer valid.
 */
export function announceForAccessibilityAssertive(message: string): void {
    const trimmed = message.trim();

    if (trimmed.length === 0) {
        return;
    }

    AccessibilityInfo.announceForAccessibilityWithOptions(trimmed, { queue: true });
}

/**
 * Announces the *outcome* of an async mutation from a single call site, so a screen
 * does not have to branch on success inside its own handler.
 *
 * Returns the value it was given, so it can be used inline in a promise chain:
 *
 * ```ts
 * const result = await announceMutation(save(), 'Availability saved.');
 * ```
 */
export async function announceMutation<T>(
    promise: Promise<T>,
    successMessage: string,
): Promise<T> {
    const value = await promise;
    announceForAccessibility(successMessage);

    return value;
}

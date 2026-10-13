/**
 * Notification type → visual kind.
 *
 * The feed differentiates notifications by *what they are about*, not by their raw
 * backend `type` string. Two kinds are rendered:
 *
 *  - `roster` — shift and roster events (a calendar glyph on an `infoSoft` tile).
 *  - `leave`  — leave events (a check-circle glyph on a `successSoft` tile).
 *
 * Anything unrecognised falls back to `roster`, which is the neutral "schedule"
 * family — a notification the app cannot classify still gets a legible tile rather
 * than a blank one.
 *
 * Kept as a pure function so the mapping is unit-testable without a renderer and so
 * the card component holds no knowledge of the backend's type vocabulary.
 */
export type NotificationKind = 'roster' | 'leave';

/** The backend `type` prefixes that map to each kind. */
const LEAVE_PREFIX = 'leave.';

export function notificationKind(type: string | null | undefined): NotificationKind {
    if (typeof type === 'string' && type.startsWith(LEAVE_PREFIX)) {
        return 'leave';
    }

    return 'roster';
}

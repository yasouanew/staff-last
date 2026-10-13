import type { AppRoute } from '../../../navigation/navigationRef';

/**
 * Maps an FCM notification payload to an in-app destination.
 *
 * ## Why this is a pure function
 *
 * The push service must not import the navigator (see
 * [`navigationRef`](src/navigation/navigationRef.ts:1)), and the mapping from a
 * backend `type` to a screen is business logic that deserves its own tests. Keeping
 * it pure means the service only has to call `navigateWhenReady(routeForNotification(...))`
 * and the routing table can be unit-tested without a native build.
 *
 * ## Payload shape
 *
 * The backend's `FcmMessage` puts the business key in the **data** bag, not the
 * `notification` block: `type` plus the relevant id (`shift_id`, `roster_id`,
 * `leave_request_id`). The `notification` block carries only the rendered
 * title/body. So routing reads `data`, and falls back to the Notifications list
 * when the type is unknown or the id is missing — a tap must always land
 * *somewhere* sensible rather than doing nothing.
 *
 * ## Ids are numbers
 *
 * FCM data values are strings on the wire, so each id is coerced with `Number()`
 * and rejected when it is not a finite positive integer. Passing `NaN` into a
 * screen's params would make it fetch `/shifts/NaN` and render an error.
 */

/** The notification list, used as the safe fallback for an unroutable tap. */
const NOTIFICATIONS_ROUTE: AppRoute = { tab: 'HomeTab', screen: 'Notifications' };

function toPositiveInt(value: unknown): number | null {
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
        return value;
    }

    if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = Number(value);

        return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
    }

    return null;
}

/**
 * Resolves the destination for a notification payload.
 *
 * @param data the FCM `data` bag (or an inbox row's `data`).
 * @returns a route that is always valid; unknown types fall back to the list.
 */
export function routeForNotification(data: Record<string, unknown> | undefined): AppRoute {
    const payload = data ?? {};
    const type = typeof payload.type === 'string' ? payload.type : '';

    switch (type) {
        case 'shift.assigned':
        case 'shift.changed':
        case 'shift.removed': {
            const shiftId = toPositiveInt(payload.shift_id);

            return shiftId === null
                ? NOTIFICATIONS_ROUTE
                : { tab: 'HomeTab', screen: 'ShiftDetail', params: { shiftId } };
        }

        case 'roster.published':
        case 'roster.changed': {
            const rosterId = toPositiveInt(payload.roster_id);

            return rosterId === null
                ? { tab: 'RosterTab', screen: 'MyRoster' }
                : { tab: 'RosterTab', screen: 'RosterDetail', params: { rosterId } };
        }

        case 'leave.submitted':
        case 'leave.decided':
        case 'leave.status': {
            const leaveRequestId = toPositiveInt(payload.leave_request_id);

            return leaveRequestId === null
                ? { tab: 'LeaveTab', screen: 'LeaveList' }
                : { tab: 'LeaveTab', screen: 'LeaveDetail', params: { leaveRequestId } };
        }

        default:
            return NOTIFICATIONS_ROUTE;
    }
}

import { routeForNotification } from '../notificationRouting';

/**
 * Notification tap routing.
 *
 * The push service hands a tap's `data` bag to `routeForNotification` and navigates
 * to whatever it returns. These tests pin the two properties that matter:
 *
 * 1. A known type with a valid id lands on the specific detail screen.
 * 2. Anything else — unknown type, missing id, non-numeric id — lands on a sensible
 *    fallback rather than producing a route with `NaN` params (which would make the
 *    target screen fetch `/shifts/NaN` and render an error).
 */

describe('routeForNotification', () => {
    it('routes a shift notification to the shift detail', () => {
        expect(routeForNotification({ type: 'shift.assigned', shift_id: 42 })).toEqual({
            tab: 'HomeTab',
            screen: 'ShiftDetail',
            params: { shiftId: 42 },
        });
    });

    it('coerces a string id, because FCM data values are strings on the wire', () => {
        expect(routeForNotification({ type: 'shift.assigned', shift_id: '42' })).toEqual({
            tab: 'HomeTab',
            screen: 'ShiftDetail',
            params: { shiftId: 42 },
        });
    });

    it('routes a roster notification to the roster detail', () => {
        expect(routeForNotification({ type: 'roster.published', roster_id: 9 })).toEqual({
            tab: 'RosterTab',
            screen: 'RosterDetail',
            params: { rosterId: 9 },
        });
    });

    it('routes a leave notification to the leave detail', () => {
        expect(routeForNotification({ type: 'leave.decided', leave_request_id: 7 })).toEqual({
            tab: 'LeaveTab',
            screen: 'LeaveDetail',
            params: { leaveRequestId: 7 },
        });
    });

    it('falls back to the roster list when a roster id is missing', () => {
        expect(routeForNotification({ type: 'roster.published' })).toEqual({
            tab: 'RosterTab',
            screen: 'MyRoster',
        });
    });

    it('falls back to the leave list when a leave id is missing', () => {
        expect(routeForNotification({ type: 'leave.decided' })).toEqual({
            tab: 'LeaveTab',
            screen: 'LeaveList',
        });
    });

    it('falls back to the notifications list for an unknown type', () => {
        expect(routeForNotification({ type: 'something.else' })).toEqual({
            tab: 'HomeTab',
            screen: 'Notifications',
        });
    });

    it('falls back to the notifications list when there is no payload at all', () => {
        expect(routeForNotification(undefined)).toEqual({
            tab: 'HomeTab',
            screen: 'Notifications',
        });
    });

    it('rejects a non-numeric id rather than routing with NaN params', () => {
        expect(routeForNotification({ type: 'shift.assigned', shift_id: 'not-a-number' })).toEqual({
            tab: 'HomeTab',
            screen: 'Notifications',
        });
    });

    it('rejects a zero or negative id', () => {
        expect(routeForNotification({ type: 'shift.assigned', shift_id: 0 })).toEqual({
            tab: 'HomeTab',
            screen: 'Notifications',
        });
    });
});

import { notificationKind } from '../notificationKind';

/**
 * The type → kind mapping that drives the feed's iconography.
 *
 * The card renders a calendar tile for `roster` and a check-circle tile for
 * `leave`, so this mapping is what makes a leave decision visually distinct from a
 * shift change at a glance.
 */
describe('notificationKind', () => {
    it('maps leave events to the leave kind', () => {
        expect(notificationKind('leave.submitted')).toBe('leave');
        expect(notificationKind('leave.decided')).toBe('leave');
        expect(notificationKind('leave.status')).toBe('leave');
    });

    it('maps shift and roster events to the roster kind', () => {
        expect(notificationKind('shift.assigned')).toBe('roster');
        expect(notificationKind('shift.changed')).toBe('roster');
        expect(notificationKind('roster.published')).toBe('roster');
    });

    it('falls back to the roster kind for an unknown type', () => {
        expect(notificationKind('something.else')).toBe('roster');
        expect(notificationKind('')).toBe('roster');
    });

    it('falls back to the roster kind for a missing type', () => {
        expect(notificationKind(null)).toBe('roster');
        expect(notificationKind(undefined)).toBe('roster');
    });
});

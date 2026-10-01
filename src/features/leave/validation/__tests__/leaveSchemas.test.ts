import { createLeaveRequestSchema } from '../leaveSchemas';

/**
 * Pins the client-side boundary (spec Screen 9 §7 / StoreLeaveRequestRequest):
 * - end_date >= start_date else 422 — caught here to save a round-trip
 * - single-day session order (first_half < full_day < second_half)
 * - total_days nullable min 0.5 (hint only), reason max 1000
 * - schemas stay looser than Laravel; balance/holidays/overlap are server-owned
 */
describe('createLeaveRequestSchema', () => {
    it('accepts a standard multi-day full-day request', () => {
        expect(
            createLeaveRequestSchema.safeParse({
                leave_type_id: 2,
                start_date: '2026-09-20',
                end_date: '2026-09-22',
                start_session: 'full_day',
                end_session: 'full_day',
                total_days: 3,
                reason: 'Family trip',
            }).success,
        ).toBe(true);
    });

    it('accepts minimal input with nullish sessions and reason', () => {
        expect(
            createLeaveRequestSchema.safeParse({
                leave_type_id: 2,
                start_date: '2026-09-20',
                end_date: '2026-09-20',
            }).success,
        ).toBe(true);
    });

    it('rejects end_date before start_date on the end_date path', () => {
        const result = createLeaveRequestSchema.safeParse({
            leave_type_id: 2,
            start_date: '2026-09-22',
            end_date: '2026-09-20',
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues.some(issue => issue.path[0] === 'end_date')).toBe(true);
        }
    });

    it('rejects a single-day request ending before it starts (second_half to first_half)', () => {
        const result = createLeaveRequestSchema.safeParse({
            leave_type_id: 2,
            start_date: '2026-09-20',
            end_date: '2026-09-20',
            start_session: 'second_half',
            end_session: 'first_half',
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues.some(issue => issue.path[0] === 'end_session')).toBe(true);
        }
    });

    it('accepts a single-day half-day request (first_half to first_half)', () => {
        expect(
            createLeaveRequestSchema.safeParse({
                leave_type_id: 2,
                start_date: '2026-09-20',
                end_date: '2026-09-20',
                start_session: 'first_half',
                end_session: 'first_half',
            }).success,
        ).toBe(true);
    });

    it('rejects total_days below the 0.5 floor', () => {
        expect(
            createLeaveRequestSchema.safeParse({
                leave_type_id: 2,
                start_date: '2026-09-20',
                end_date: '2026-09-20',
                total_days: 0.2,
            }).success,
        ).toBe(false);
    });

    it('rejects a reason over 1000 characters', () => {
        expect(
            createLeaveRequestSchema.safeParse({
                leave_type_id: 2,
                start_date: '2026-09-20',
                end_date: '2026-09-20',
                reason: 'x'.repeat(1001),
            }).success,
        ).toBe(false);
    });

    it('rejects malformed dates outside YYYY-MM-DD', () => {
        expect(
            createLeaveRequestSchema.safeParse({
                leave_type_id: 2,
                start_date: '20/09/2026',
                end_date: '2026-09-20',
            }).success,
        ).toBe(false);
    });
});

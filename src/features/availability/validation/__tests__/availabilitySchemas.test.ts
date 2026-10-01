import {
    availabilitySlotSchema,
    syncWeeklyAvailabilitySchema,
} from '../availabilitySchemas';

/**
 * Pins the client-side boundary (spec Screen 7 §7):
 * - `end_time after start_time` else 422 — caught here to save a round-trip
 * - `day_of_week` 0–6, empty sync array → 422
 * - schemas stay looser than Laravel; permission/ownership are server-owned
 */
describe('availabilitySlotSchema', () => {
    it('accepts a standard weekday slot', () => {
        expect(
            availabilitySlotSchema.safeParse({
                day_of_week: 1,
                start_time: '09:00',
                end_time: '17:00',
                is_available: true,
            }).success,
        ).toBe(true);
    });

    it('accepts an unavailable day with no times', () => {
        expect(
            availabilitySlotSchema.safeParse({ day_of_week: 3, is_available: false }).success,
        ).toBe(true);
    });

    it('rejects end_time at or before start_time on the end_time path', () => {
        const result = availabilitySlotSchema.safeParse({
            day_of_week: 1,
            start_time: '17:00',
            end_time: '09:00',
            is_available: true,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues.some(issue => issue.path[0] === 'end_time')).toBe(true);
        }
    });

    it('rejects day_of_week outside 0–6', () => {
        expect(
            availabilitySlotSchema.safeParse({ day_of_week: 9, is_available: false }).success,
        ).toBe(false);
    });

    it('rejects malformed clock times', () => {
        expect(
            availabilitySlotSchema.safeParse({
                day_of_week: 1,
                start_time: '9am',
                end_time: '17:00',
            }).success,
        ).toBe(false);
    });
});

describe('syncWeeklyAvailabilitySchema', () => {
    it('accepts a mixed week payload', () => {
        expect(
            syncWeeklyAvailabilitySchema.safeParse({
                availabilities: [
                    { day_of_week: 1, start_time: '09:00', end_time: '17:00', is_available: true },
                    { day_of_week: 3, is_available: false },
                ],
            }).success,
        ).toBe(true);
    });

    it('rejects an empty sync array (server 422)', () => {
        expect(syncWeeklyAvailabilitySchema.safeParse({ availabilities: [] }).success).toBe(false);
    });
});

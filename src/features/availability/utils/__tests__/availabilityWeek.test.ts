import type { Availability } from '../../types';
import {
    buildSyncPayload,
    isWeekDirty,
    orderAvailability,
    toWeekDrafts,
    validateSlotTime,
} from '../availabilityWeek';

function makeAvailability(overrides: Partial<Availability> = {}): Availability {
    return {
        id: 1,
        employee_id: 9,
        day_of_week: 1,
        day_name: 'Monday',
        is_available: true,
        start_time: '09:00',
        end_time: '17:00',
        created_at: '2026-09-01T10:00:00+10:00',
        updated_at: '2026-09-01T10:00:00+10:00',
        ...overrides,
    };
}

/**
 * Week-editor invariants (spec Screen 7 §4/§6-§7):
 * - list order is `day_of_week,start_time` (backend guarantees it; client re-sorts defensively)
 * - `end_time after start_time` else 422 — caught client-side to save a round-trip
 * - sync replaces the whole week; unavailable days send no times
 * - dirty guard compares the server snapshot against the draft
 */
describe('availabilityWeek', () => {
    it('orders by day_of_week then start_time, nulls last', () => {
        const wednesday = makeAvailability({ id: 2, day_of_week: 3, start_time: '09:00' });
        const mondayLate = makeAvailability({ id: 3, day_of_week: 1, start_time: '14:00' });
        const mondayEarly = makeAvailability({ id: 1, day_of_week: 1, start_time: '09:00' });
        const mondayAllDay = makeAvailability({
            id: 4,
            day_of_week: 1,
            start_time: null,
            end_time: null,
        });

        expect(
            orderAvailability([wednesday, mondayAllDay, mondayLate, mondayEarly]).map(a => a.id),
        ).toEqual([1, 3, 4, 2]);
    });

    it('rejects end_time at or before start_time', () => {
        expect(validateSlotTime('09:00', '09:00', true)).toBe('End time must be after start time.');
        expect(validateSlotTime('17:00', '09:00', true)).toBe('End time must be after start time.');
        expect(validateSlotTime('09:00', '17:00', true)).toBeNull();
    });

    it('accepts blank times (all-day) and skips validation for unavailable days', () => {
        expect(validateSlotTime(null, null, true)).toBeNull();
        expect(validateSlotTime('bad', 'also-bad', false)).toBeNull();
    });

    it('rejects malformed clock times', () => {
        expect(validateSlotTime('9am', '17:00', true)).toBe('Use HH:MM 24-hour format.');
        expect(validateSlotTime('09:00', '25:00', true)).toBe('Use HH:MM 24-hour format.');
    });

    it('builds a 7-day scaffold from sparse server rows', () => {
        const drafts = toWeekDrafts([makeAvailability({ day_of_week: 1 })]);

        expect(drafts).toHaveLength(7);
        expect(drafts.map(d => d.day_of_week)).toEqual([0, 1, 2, 3, 4, 5, 6]);
        expect(drafts[1]).toMatchObject({ is_available: true, start_time: '09:00' });
        expect(drafts[0]).toMatchObject({ is_available: false, start_time: null });
    });

    it('builds a sync payload where unavailable days carry no times', () => {
        const drafts = toWeekDrafts([
            makeAvailability({ day_of_week: 1, start_time: '09:00', end_time: '17:00' }),
        ]);

        const payload = buildSyncPayload(drafts);

        expect(payload).toHaveLength(7);
        expect(payload[1]).toEqual({
            day_of_week: 1,
            is_available: true,
            start_time: '09:00',
            end_time: '17:00',
        });
        expect(payload[0]).toEqual({ day_of_week: 0, is_available: false });
    });

    it('detects unsaved changes field-by-field', () => {
        const original = toWeekDrafts([makeAvailability({ day_of_week: 1 })]);

        expect(isWeekDirty(original, original)).toBe(false);
        expect(
            isWeekDirty(
                original,
                original.map(d => (d.day_of_week === 1 ? { ...d, end_time: '18:00' } : d)),
            ),
        ).toBe(true);
        expect(
            isWeekDirty(
                original,
                original.map(d => (d.day_of_week === 1 ? { ...d, is_available: false } : d)),
            ),
        ).toBe(true);
    });
});

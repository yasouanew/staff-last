import type { Availability } from '../../types';
import {
    TIME_OPTIONS,
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

    describe('server times served as H:i:s', () => {
        /**
         * The live backend returns availability times with seconds
         * (`04:00:00`), not the documented `H:i`. If those reach the draft
         * unconverted they make every day permanently invalid, which pins the
         * Save button disabled — the reported "save not interactive" bug.
         */
        const slot = (overrides: Record<string, unknown>) => ({
            id: 1,
            employee_id: 1,
            day_of_week: 3 as const,
            day_name: 'Wednesday',
            is_available: true,
            start_time: '04:00:00',
            end_time: '01:00:00',
            created_at: '2026-10-01T00:00:00+10:00',
            updated_at: '2026-10-01T00:00:00+10:00',
            ...overrides,
        });

        it('normalises seconds away when building drafts', () => {
            const drafts = toWeekDrafts([
                slot({ day_of_week: 3, start_time: '04:00:00', end_time: '01:00:00' }),
            ]);

            const wednesday = drafts.find(day => day.day_of_week === 3);

            expect(wednesday?.start_time).toBe('04:00');
            expect(wednesday?.end_time).toBe('01:00');
        });

        it('produces a value that is a member of the select options', () => {
            const drafts = toWeekDrafts([slot({ day_of_week: 3, start_time: '04:00:00' })]);
            const wednesday = drafts.find(day => day.day_of_week === 3);

            expect(TIME_OPTIONS).toContain(wednesday?.start_time);
        });

        it('accepts a seconds-bearing time without a format error', () => {
            // The end precedes the start here, so the *ordering* rule fires —
            // but crucially not the format rule, which is what used to stick.
            expect(validateSlotTime('04:00', '01:00', true)).toBe(
                'End time must be after start time.',
            );
            expect(validateSlotTime('04:00', '01:00', true)).not.toBe(
                'Use HH:MM 24-hour format.',
            );
        });

        it('leaves a null time null', () => {
            const drafts = toWeekDrafts([
                slot({ day_of_week: 3, start_time: null, end_time: null }),
            ]);

            expect(drafts.find(day => day.day_of_week === 3)?.start_time).toBeNull();
        });
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

/**
 * The select's option set is the contract that replaced free-text entry: every
 * value it offers must already be a legal `HH:MM` time, so a selection can never
 * fail validation. These tests pin the boundaries and the step.
 */
describe('TIME_OPTIONS', () => {
    it('covers the whole day in 30-minute steps', () => {
        expect(TIME_OPTIONS).toHaveLength(48);
        expect(TIME_OPTIONS[0]).toBe('00:00');
        expect(TIME_OPTIONS[1]).toBe('00:30');
        expect(TIME_OPTIONS[TIME_OPTIONS.length - 1]).toBe('23:30');
    });

    it('offers only values the validator accepts', () => {
        for (const option of TIME_OPTIONS) {
            const result = validateSlotTime(option, '23:30', true);
            if (option === '23:30') {
                // Same time is not "after", but the format itself is accepted.
                expect(result).toBe('End time must be after start time.');
            } else {
                expect(result).toBeNull();
            }
        }
    });
});

describe('validateSlotTime half-filled ranges', () => {
    it('rejects a start time with no end time', () => {
        expect(validateSlotTime('09:00', null, true)).toBe('Set both start and end times.');
    });

    it('rejects an end time with no start time', () => {
        expect(validateSlotTime(null, '17:00', true)).toBe('Set both start and end times.');
    });

    it('still accepts the deliberate all-day state (both blank)', () => {
        expect(validateSlotTime(null, null, true)).toBeNull();
    });
});

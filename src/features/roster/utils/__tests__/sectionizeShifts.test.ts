import type { Shift } from '../../../shifts/types';
import { sectionizeShifts } from '../sectionizeShifts';

function makeShift(overrides: Partial<Shift> = {}): Shift {
    return {
        id: 1,
        company_id: 1,
        branch_id: null,
        branch: null,
        roster_id: 20,
        employee_id: 9,
        employee: null,
        position_id: null,
        department_id: null,
        date: '2026-09-15',
        start_time: '09:00',
        end_time: '17:00',
        break_minutes: null,
        paid_break: null,
        status: 'scheduled',
        notes: null,
        created_at: '2026-09-01T00:00:00Z',
        updated_at: '2026-09-01T00:00:00Z',
        ...overrides,
    };
}

/**
 * The roster feed groups shifts by their own ISO date. The grouping is shared
 * with the screen's day headers and its `getItemLayout` prefix sums, so the
 * ordering contract — date ascending, then start time ascending — is asserted
 * here rather than only through the screen.
 */
describe('sectionizeShifts', () => {
    it('groups shifts by ISO date, one section per day', () => {
        const sections = sectionizeShifts([
            makeShift({ id: 1, date: '2026-09-15' }),
            makeShift({ id: 2, date: '2026-09-16' }),
            makeShift({ id: 3, date: '2026-09-15' }),
        ]);

        expect(sections.map(section => section.date)).toEqual(['2026-09-15', '2026-09-16']);
        expect(sections[0]?.shifts.map(shift => shift.id)).toEqual([1, 3]);
        expect(sections[1]?.shifts.map(shift => shift.id)).toEqual([2]);
    });

    it('sorts days ascending and shifts within a day by start time', () => {
        const sections = sectionizeShifts([
            makeShift({ id: 1, date: '2026-09-16', start_time: '08:00' }),
            makeShift({ id: 2, date: '2026-09-15', start_time: '14:00' }),
            makeShift({ id: 3, date: '2026-09-15', start_time: '09:00' }),
        ]);

        expect(sections.map(section => section.date)).toEqual(['2026-09-15', '2026-09-16']);
        expect(sections[0]?.shifts.map(shift => shift.id)).toEqual([3, 2]);
    });

    it('omits days with no shifts rather than emitting an empty section', () => {
        const sections = sectionizeShifts([makeShift({ date: '2026-09-15' })]);

        expect(sections).toHaveLength(1);
        expect(sections[0]?.date).toBe('2026-09-15');
    });

    it('returns an empty array for an empty week', () => {
        expect(sectionizeShifts([])).toEqual([]);
    });

    it('does not mutate the input array', () => {
        const input = [
            makeShift({ id: 1, date: '2026-09-16' }),
            makeShift({ id: 2, date: '2026-09-15' }),
        ];
        const snapshot = input.map(shift => shift.id);

        sectionizeShifts(input);

        expect(input.map(shift => shift.id)).toEqual(snapshot);
    });
});

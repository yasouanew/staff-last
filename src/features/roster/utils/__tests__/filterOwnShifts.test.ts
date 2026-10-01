import type { Shift } from '../../../shifts/types';
import { filterOwnShifts } from '../filterOwnShifts';

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
 * Roster detail returns every shift on the roster — mobile must only render
 * `shifts where employee_id == own` (spec Screen 5 API 3), otherwise a tap
 * would leak a coworker's schedule through `ShiftDetail`.
 */
describe('filterOwnShifts', () => {
    it('drops coworkers shifts, keeping only own employee_id', () => {
        const mine = makeShift({ id: 1, employee_id: 9 });
        const coworker = makeShift({ id: 2, employee_id: 10 });
        const open = makeShift({ id: 3, employee_id: null });

        expect(filterOwnShifts([mine, coworker, open], 9).map(s => s.id)).toEqual([1]);
    });

    it('sorts own shifts by date then start_time (backend fixed ordering)', () => {
        const late = makeShift({ id: 2, date: '2026-09-15', start_time: '14:00' });
        const early = makeShift({ id: 1, date: '2026-09-15', start_time: '09:00' });
        const nextDay = makeShift({ id: 3, date: '2026-09-16', start_time: '08:00' });

        expect(filterOwnShifts([late, nextDay, early], 9).map(s => s.id)).toEqual([1, 2, 3]);
    });

    it('returns empty when there is no linked employee record (never someone elses data)', () => {
        const mine = makeShift({ id: 1, employee_id: 9 });

        expect(filterOwnShifts([mine], null)).toEqual([]);
    });
});

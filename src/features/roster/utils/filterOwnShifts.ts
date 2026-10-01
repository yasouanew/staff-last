import type { Shift } from '../../shifts/types';

/**
 * Own-shift filter for roster detail (spec Screen 5 API 3).
 *
 * `GET /rosters/{id}` returns every shift on the roster, including coworkers'.
 * Mobile must only render `shifts where employee_id == own` — `ShiftPolicy@view`
 * permits viewing any company shift, so linking a coworker's shift would leak
 * their schedule. Sorted by date then start time (backend's fixed ordering).
 */
export function filterOwnShifts(shifts: Shift[], employeeId: number | null): Shift[] {
    if (employeeId === null) {
        return [];
    }

    return [...shifts]
        .filter(shift => shift.employee_id === employeeId)
        .sort((a, b) => {
            const byDate = a.date.localeCompare(b.date);

            return byDate !== 0 ? byDate : a.start_time.localeCompare(b.start_time);
        });
}

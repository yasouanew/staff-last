import type { DayOfWeek } from '../../../utils/date';

/**
 * Availability types — spec Screen 7.
 *
 * Endpoints live under `/employees/{employee}/availabilities` where `employee`
 * is `employees.id` (NOT `users.id`) — resolve via `me.employee_id`.
 *
 * List is NOT paginated (plain collection) ordered by `day_of_week,start_time`.
 * Model: `DAYS 0=Sunday..6=Saturday`, `is_available` bool, times `H:i|null`.
 *
 * BACKEND GAP (BLOCKING): `index` authorizes `employee.view` and
 * `store/sync/update/destroy` authorize `employee.update` via `EmployeePolicy`,
 * which the employee role does NOT hold — real calls 403 until backend grants
 * scoped own-record access. Mobile must surface 403 distinctly.
 */
export type Availability = {
    id: number;
    employee_id: number;
    /** 0 = Sunday … 6 = Saturday. */
    day_of_week: DayOfWeek;
    day_name: string;
    is_available: boolean;
    /** `H:i` — null when unavailable or all-day. */
    start_time: string | null;
    end_time: string | null;
    created_at: string;
    updated_at: string;
};

export type AvailabilitySlotInput = {
    day_of_week: DayOfWeek;
    start_time?: string | null;
    end_time?: string | null;
    is_available?: boolean;
};

export type CreateAvailabilityPayload = AvailabilitySlotInput;

export type SyncWeeklyAvailabilityPayload = {
    availabilities: AvailabilitySlotInput[];
};

export type UpdateAvailabilityPayload = Partial<AvailabilitySlotInput>;

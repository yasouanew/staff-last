import type { EmployeeSummary, RosterStatus } from '../../../types/api';
import type { Shift } from '../../shifts/types';

/**
 * Roster types.
 *
 * Transcribed from `RosterResource` (spec §0.3 / Screens 5–6). Rosters group
 * shifts for a date range and carry a publish state — employees only ever see
 * `published` rows, but the status is typed in full because the API returns it.
 */

export type Roster = {
    id: number;
    company_id: number;
    branch_id: number | null;
    employee_id: number | null;
    employee: EmployeeSummary | null;
    /** `Y-m-d`. */
    week_start: string;
    week_end: string;
    status: RosterStatus;
    notes: string | null;
    published_at: string | null;
    /** Present on list when annotated (`shifts_count`) or detail (`shifts`). */
    shifts?: Shift[];
    shifts_count?: number | null;
    version?: number | null;
    published_by?: number | null;
    created_at: string;
    updated_at: string;
};

/**
 * Query parameters accepted by `GET /rosters` (spec Screen 5 API 2).
 *
 * From `RosterController@index`: `status`, `branch_id?`, `week_start?`,
 * `week_end?`, `per_page`. `employee_id` is a mobile-side scoping aid — the
 * backend does NOT auto-scope rosters to the token, so "my" queries pass the
 * signed-in employee explicitly and then filter `status=published` client-side
 * as well (backend does NOT hide drafts from employees).
 */
export type RosterListParams = {
    employee_id?: number;
    status?: RosterStatus;
    branch_id?: number;
    /** `Y-m-d` — week window start. */
    week_start?: string;
    /** `Y-m-d` — week window end. */
    week_end?: string;
    /** `Y-m-d` legacy aliases kept for backwards-compat with older callers. */
    date_from?: string;
    /** `Y-m-d` legacy aliases kept for backwards-compat with older callers. */
    date_to?: string;
    page?: number;
    per_page?: number;
};

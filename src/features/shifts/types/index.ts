import type {
    BranchSummary,
    CompanySummary,
    EmployeeSummary,
    RelationSummary,
    RosterSummary,
    ShiftStatus,
} from '../../../types/api';

/**
 * Shift types.
 *
 * Transcribed from the `ShiftResource` shape documented in
 * `.roo/mobile-screen-specification.md` Screen 4 (lines 419-443).
 *
 * Field names match the API verbatim: `date` (Y-m-d) and `paid_break`
 * (boolean). Previous `shift_date` / `is_paid_break` names never existed
 * server-side and produced `undefined` at runtime.
 *
 * Note the scoping rule (spec §0.5): `GET /shifts` is **not** auto-scoped to the
 * signed-in user, so every request must pass `?employee_id=` explicitly.
 */

export type Shift = {
    id: number;
    company_id: number;
    company?: CompanySummary | null;
    branch_id: number | null;
    branch: BranchSummary | null;
    roster_id: number | null;
    roster?: RosterSummary | null;
    employee_id: number | null;
    employee: EmployeeSummary | null;
    position_id: number | null;
    position?: RelationSummary | null;
    department_id: number | null;
    department?: RelationSummary | null;
    /** `Y-m-d` — calendar date, never parsed as UTC midnight (spec §0.4). */
    date: string;
    /** `H:i` — held as a string, never parsed into a `Date` (spec §0.6). */
    start_time: string;
    end_time: string;
    break_minutes: number | null;
    paid_break: boolean | null;
    required_staff?: number | null;
    status: ShiftStatus;
    notes: string | null;
    created_at: string;
    updated_at: string;
};

/** Query parameters accepted by `GET /shifts` (spec Screen 4 API 2). */
export type ShiftListParams = {
    /** Required in practice — the server does not scope by the token. */
    employee_id: number;
    /** `Y-m-d` — today for Home, week range for Roster. */
    date_from?: string;
    date_to?: string;
    status?: ShiftStatus;
    branch_id?: number;
    roster_id?: number;
    page?: number;
    per_page?: number;
};

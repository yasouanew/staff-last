import type { EmployeeSummary, LeaveRequestStatus, LeaveSession } from '../../../types/api';

/**
 * Leave request types.
 *
 * Transcribed from `LeaveRequestResource` / `LeaveTypeResource` (spec Screens 8–10).
 * Two backend quirks are encoded here:
 *
 * - `GET /leave-requests` **is** auto-scoped to the authenticated employee, so the
 *   client must NOT send `employee_id` (spec §0.5). This is the opposite of shifts
 *   and rosters, and is the single most likely place to introduce a bug.
 * - There is no cancel/withdraw endpoint (G6). A pending request cannot be taken
 *   back from the app, so the UI must say so rather than offer a dead action.
 */

export type LeaveTypeSummary = {
    id: number;
    name: string;
    code: string | null;
    is_paid: boolean;
};

/** `LeaveTypeResource` — spec Screen 9 API 1. */
export type LeaveType = {
    id: number;
    name: string;
    code: string | null;
    description: string | null;
    allowance_days: string | null;
    is_paid: boolean;
    allows_rollover: boolean;
    max_rollover_days: string | null;
    requires_approval: boolean;
    /** Server flag gating half-day sessions — `allow_half_day`, not `allows_*`. */
    allow_half_day: boolean;
    max_days_per_request: string | null;
    color: string | null;
    status: string;
};

/** Minimal user object embedded as `approver` / `rejecter` on the detail endpoint. */
export type LeaveDecisionUser = {
    id: number;
    name: string;
    email?: string | null;
};

export type LeaveRequest = {
    id: number;
    company_id: number;
    employee_id: number;
    leave_type_id: number;
    leave_type: LeaveTypeSummary | null;
    employee: Pick<EmployeeSummary, 'id' | 'full_name'> | null;
    start_date: string;
    end_date: string;
    /** Slot enum, not a duration: `full_day | first_half | second_half`. */
    start_session: LeaveSession | null;
    /** Slot enum, not a duration: `full_day | first_half | second_half`. */
    end_session: LeaveSession | null;
    /** `decimal:2` string on the wire — recalculated server-side. */
    total_days: string | null;
    reason: string | null;
    /** Legacy single path; `attachments` is the current array. */
    attachment: string | null;
    attachments: string[];
    status: LeaveRequestStatus;
    /** Who decided, once approved or rejected. */
    approved_by: number | null;
    approved_at: string | null;
    rejected_by: number | null;
    rejected_at: string | null;
    rejection_reason: string | null;
    admin_notes: string | null;
    approver: LeaveDecisionUser | null;
    rejecter: LeaveDecisionUser | null;
    created_at: string;
    updated_at: string;
};

/** Local attachment picked on-device before multipart upload. */
export type LeaveAttachmentInput = {
    uri: string;
    name: string;
    mimeType: string;
    size?: number;
};

/**
 * Request body for `POST /leave-requests` (spec Screen 9 / `StoreLeaveRequestRequest`).
 *
 * The field names are `start_session`/`end_session` — not a `session` + clock-time
 * pair. The backend models a request as a date range with a slot at each end, so
 * "first half of the 20th to second half of the 22nd" is expressible and there is
 * no notion of clock times at all. Inventing `start_time`/`end_time` here would
 * send fields the server ignores.
 *
 * `employee_id` is **required on the wire** and must be the caller's own id,
 * resolved from the session (`user.employee_id`). The specification claimed the
 * server injects it, but the deployed backend validates it as `required` at the
 * `StoreLeaveRequestRequest` layer and returns `422 {"employee_id": ["The employee
 * id field is required."]}` when it is absent. The backend is authoritative here,
 * so the field is typed as required — a non-optional property makes any future
 * call site that forgets it a compile error rather than a silent 422.
 *
 * `company_id` is still omitted: the backend derives it and it is not validated as
 * required. `total_days` is a non-authoritative hint (server recalculates);
 * `attachments` are sent as multipart files, never as JSON paths.
 *
 * NOTE: `GET /leave-requests` (list/detail) remains auto-scoped and MUST NOT send
 * `employee_id` as a query parameter — the requirement applies to the create body
 * only. These two directions genuinely differ; see
 * [`leaveApi.list`](src/features/leave/api/leaveApi.ts:24).
 */
export type CreateLeaveRequestPayload = {
    /** Own employees.id from the session — required by the backend, not inferred. */
    employee_id: number;
    leave_type_id: number;
    start_date: string;
    end_date: string;
    start_session?: LeaveSession;
    end_session?: LeaveSession;
    total_days?: number;
    reason?: string;
    attachments?: LeaveAttachmentInput[];
};

/** Query for `GET /leave-requests`. `employee_id` is forced server-side. */
export type LeaveRequestListParams = {
    status?: LeaveRequestStatus;
    leave_type_id?: number;
    date_from?: string;
    date_to?: string;
    page?: number;
    per_page?: number;
};

/** Query for `GET /leave-types`. `company_id` is forced server-side. */
export type LeaveTypeListParams = {
    search?: string;
    status?: string;
    per_page?: number;
};

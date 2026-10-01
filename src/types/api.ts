/**
 * Shared API contract types.
 *
 * These describe the Laravel envelope produced by `app/Traits/ApiResponse.php` and
 * the Laravel paginator shape — see `.roo/mobile-screen-specification.md` §0.3.
 * Nothing here is invented: every field maps to a documented response.
 */

/** Success envelope: `data` is omitted when the endpoint returns `null`. */
export type ApiSuccess<TData> = {
    success: true;
    message: string;
    data?: TData;
};

/** Field-level validation errors, keyed by request field (`errors.email[0]`). */
export type ApiValidationErrors = Record<string, string[]>;

/** Error envelope for 401 / 403 / 404 / 422 / 500 responses. */
export type ApiErrorResponse = {
    success: false;
    message: string;
    errors?: ApiValidationErrors;
};

/**
 * Pagination metadata. The backend returns this inside `data.meta` because
 * controllers call `->response()->getData(true)` on resource collections.
 */
export type PaginationMeta = {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
};

/**
 * Paginated payload: `{ data: T[], links, meta }` nested inside the `data` key of
 * the envelope, e.g. `GET /shifts` → `{ success, message, data: { data: [...] } }`.
 */
export type PaginatedData<TItem> = {
    data: TItem[];
    links?: Record<string, unknown>;
    meta: PaginationMeta;
};

/** Pagination query parameters accepted by list endpoints. */
export type PaginationParams = {
    page?: number;
    per_page?: number;
};

/** ID/name pairs returned by `*Resource` classes for relations. */
export type RelationSummary = {
    id: number;
    name: string;
};

/** `company` relation on user/branch resources. */
export type CompanySummary = {
    id: number;
    name: string;
};

/** Branch relation including display hints (spec §0.4 + Screen 6). */
export type BranchSummary = {
    id: number;
    name: string;
    timezone?: string | null;
    address?: string | null;
};

/** Employee relation as embedded in shift/leave resources. */
export type EmployeeSummary = {
    id: number;
    first_name?: string;
    last_name?: string;
    full_name: string;
};

/** Roster relation embedded in a shift resource. */
export type RosterSummary = {
    id: number;
    week_start: string;
    week_end: string;
    status: RosterStatus;
};

/** `rosters.status` enum — `draft,published` per spec Screen 5. */
export type RosterStatus = 'draft' | 'published';

/** `shifts.status` enum per migration + spec Screen 4. */
export type ShiftStatus = 'scheduled' | 'completed' | 'cancelled' | 'swap_requested';

/** `leave_requests.status` enum per spec Screen 8. */
export type LeaveRequestStatus = 'pending' | 'approved' | 'rejected';

/** `leave_requests.start_session/end_session` enum per spec Screen 9. */
export type LeaveSession = 'full_day' | 'first_half' | 'second_half';

/** Notification filter accepted by `GET /notifications?filter=`. */
export type NotificationFilter = 'all' | 'unread' | 'read';

/** Platform values accepted by `auth/login` and `device-tokens`. */
export type DevicePlatform = 'ios' | 'android' | 'web';

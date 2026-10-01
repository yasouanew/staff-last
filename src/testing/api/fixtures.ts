/**
 * Schema-valid response fixtures.
 *
 * Every factory below produces a payload that satisfies the app's **runtime Zod
 * schema** for its endpoint (see [`src/api/schemas.ts`](../../../src/api/schemas.ts:1)
 * and each feature's `validation/apiSchemas.ts`). That is load-bearing: the real API
 * services validate responses at the boundary, so a fixture that merely "looks right"
 * would make a test fail for the wrong reason — the assertion would be about the
 * fixture, not the behaviour.
 *
 * Each factory takes a partial override so a test can state only the field it cares
 * about:
 *
 * ```ts
 * loginResponse({ user: authUser({ employee_id: null }) })
 * ```
 */

import type { AppError, AppErrorKind } from '../../../src/types/appError';

/** `company_access` block — drives the locked-company paywall. */
export function companyAccess(
    overrides: Partial<{
        is_locked: boolean;
        reason: string | null;
        trial_ends_at: string | null;
        trial_is_active: boolean;
        active_subscription_id: number | null;
        active_subscription_ends_at: string | null;
    }> = {},
) {
    return {
        is_locked: false,
        reason: null,
        trial_ends_at: null,
        trial_is_active: true,
        active_subscription_id: 1,
        active_subscription_ends_at: null,
        ...overrides,
    };
}

/** `UserResource` as returned by `/auth/login`, `/auth/me` and `/auth/profile`. */
export function authUser(overrides: Record<string, unknown> = {}) {
    return {
        id: 7,
        company_id: 1,
        company_access: companyAccess(),
        branch_id: 3,
        employee_id: 42,
        name: 'Alex Rivera',
        email: 'alex@example.com',
        phone: '+61 400 000 000',
        role: 'employee',
        status: 'active',
        roles: ['employee'],
        permissions: ['shift.view', 'leave_request.view', 'leave_request.create'],
        last_login_at: '2026-09-24T08:00:00+10:00',
        email_verified_at: '2026-01-05T00:00:00+10:00',
        ...overrides,
    };
}

/** `POST /auth/login` payload — `{ user, token, token_type, … }`. */
export function loginResponse(overrides: Record<string, unknown> = {}) {
    return {
        user: authUser(),
        token: '1|sanctum-plain-text-token',
        token_type: 'Bearer',
        expires_at: null,
        expires_in: null,
        refresh_token: null,
        ...overrides,
    };
}

/** A `LeaveTypeResource`. Decimal fields are strings on the wire. */
export function leaveType(overrides: Record<string, unknown> = {}) {
    return {
        id: 2,
        name: 'Annual Leave',
        code: 'ANNUAL',
        description: null,
        allowance_days: '20.00',
        is_paid: true,
        allows_rollover: false,
        max_rollover_days: null,
        requires_approval: true,
        allow_half_day: true,
        max_days_per_request: null,
        color: null,
        status: 'active',
        ...overrides,
    };
}

/** A `LeaveRequestResource`. */
export function leaveRequest(overrides: Record<string, unknown> = {}) {
    return {
        id: 101,
        company_id: 1,
        employee_id: 42,
        leave_type_id: 2,
        leave_type: { id: 2, name: 'Annual Leave', code: 'ANNUAL', is_paid: true },
        employee: { id: 42, full_name: 'Alex Rivera' },
        start_date: '2026-10-01',
        end_date: '2026-10-02',
        start_session: 'full_day',
        end_session: 'full_day',
        total_days: '2.00',
        reason: 'Family trip',
        attachment: null,
        attachments: [],
        status: 'pending',
        approved_by: null,
        approved_at: null,
        rejected_by: null,
        rejected_at: null,
        rejection_reason: null,
        admin_notes: null,
        approver: null,
        rejecter: null,
        created_at: '2026-09-24T08:00:00+10:00',
        updated_at: '2026-09-24T08:00:00+10:00',
        ...overrides,
    };
}

/** Pagination metadata, per spec §0.3. */
export function paginationMeta(
    overrides: Partial<{
        current_page: number;
        last_page: number;
        per_page: number;
        total: number;
    }> = {},
) {
    return {
        current_page: 1,
        last_page: 1,
        per_page: 20,
        total: 1,
        ...overrides,
    };
}

/** A Laravel-paginated payload: `{ data, meta, links }`. */
export function paginated<TItem>(items: TItem[], meta = paginationMeta({ total: items.length })) {
    return {
        data: items,
        meta,
        links: { first: null, last: null, prev: null, next: null },
    };
}

/** A `Shift` object. */
export function shift(overrides: Record<string, unknown> = {}) {
    return {
        id: 101,
        company_id: 1,
        branch_id: 5,
        branch: { id: 5, name: 'CBD Store' },
        roster_id: 20,
        employee_id: 42,
        employee: { id: 42, first_name: 'Alex', last_name: 'Rivera', full_name: 'Alex Rivera' },
        position_id: 3,
        position: { id: 3, name: 'Cashier' },
        department_id: 4,
        department: { id: 4, name: 'Front' },
        date: '2026-09-24',
        start_time: '09:00',
        end_time: '17:00',
        break_minutes: 30,
        paid_break: false,
        status: 'scheduled',
        notes: 'Close the till at the end.',
        created_at: '2026-09-01T00:00:00Z',
        updated_at: '2026-09-01T00:00:00Z',
        ...overrides,
    };
}

/** A `RosterResource` (list shape — `shifts` is only embedded on the detail endpoint). */
export function roster(overrides: Record<string, unknown> = {}) {
    return {
        id: 20,
        company_id: 1,
        branch_id: 5,
        employee_id: 42,
        employee: { id: 42, full_name: 'Alex Rivera', first_name: 'Alex', last_name: 'Rivera' },
        week_start: '2026-09-21',
        week_end: '2026-09-27',
        status: 'published',
        notes: null,
        published_at: '2026-09-18T00:00:00+10:00',
        shifts_count: 1,
        version: 1,
        published_by: 3,
        created_at: '2026-09-18T00:00:00+10:00',
        updated_at: '2026-09-18T00:00:00+10:00',
        ...overrides,
    };
}

/** An app notification row. */
export function appNotification(overrides: Record<string, unknown> = {}) {
    return {
        id: 'ntf-1',
        type: 'shift.assigned',
        title: 'New shift assigned',
        body: 'You have been assigned a shift on 1 Oct.',
        data: { shift_id: 101 },
        read_at: null,
        created_at: '2026-09-24T08:00:00+10:00',
        ...overrides,
    };
}

/** `GET /notifications` — a custom wrapper, not a Laravel paginator. */
export function notificationList(
    notifications = [appNotification()],
    overrides: Record<string, unknown> = {},
) {
    return {
        notifications,
        unread_count: notifications.filter(item => item.read_at === null).length,
        meta: paginationMeta({ total: notifications.length }),
        ...overrides,
    };
}

/** `DeviceTokenResource` — the backend never echoes the raw token back. */
export function deviceTokenResource(overrides: Record<string, unknown> = {}) {
    return {
        id: 11,
        device_name: 'Pixel 8',
        platform: 'android',
        is_active: true,
        last_used_at: '2026-09-24T08:00:00+10:00',
        ...overrides,
    };
}

/**
 * A minimal `AppError` for `toEqual`/`toMatchObject` assertions.
 *
 * Not used to *produce* errors in tests — those come from the real client so the
 * normalisation path is exercised. This exists only to state an expectation.
 */
export function expectAppError(kind: AppErrorKind, status?: number): Partial<AppError> {
    return status === undefined ? { kind } : { kind, status };
}

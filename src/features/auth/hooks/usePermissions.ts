import { useSessionStore } from '../store/sessionStore';

/**
 * Permission checks.
 *
 * The employee role in this backend is limited to `shift.view`, `roster.view`,
 * `leave_request.view` and `leave_request.create` (spec §0.4). Screens use these
 * helpers to hide — never to authorize — because authorization is enforced
 * server-side and a hidden button is not a security control.
 *
 * Reads from the store rather than the `/auth/me` query so the checks are stable
 * while the query is refetching and can be called outside a query boundary.
 */
export const EMPLOYEE_PERMISSIONS = {
    shiftView: 'shift.view',
    rosterView: 'roster.view',
    leaveRequestView: 'leave_request.view',
    leaveRequestCreate: 'leave_request.create',
} as const;

export function usePermissions(): {
    permissions: string[];
    can: (permission: string) => boolean;
} {
    const permissions = useSessionStore(state => state.user?.permissions ?? []);

    return {
        permissions,
        can: (permission: string) => permissions.includes(permission),
    };
}

/** True while the company is locked (expired trial / inactive subscription). */
export function useCompanyAccess(): {
    isLocked: boolean;
    reason: string | null;
} {
    const companyAccess = useSessionStore(state => state.user?.company_access ?? null);

    return {
        isLocked: companyAccess?.is_locked ?? false,
        reason: companyAccess?.reason ?? null,
    };
}

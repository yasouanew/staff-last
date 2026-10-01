/**
 * TanStack Query key factory.
 *
 * Keys are declared here rather than inline in hooks so that invalidation is
 * reliable: a mutation invalidates `queryKeys.shifts.all` and every shift query
 * (list, detail, today) refetches, without any hook having to know the others'
 * exact keys. Prefix order matters — TanStack matches keys by prefix.
 */
export const queryKeys = {
    session: {
        all: ['session'] as const,
        me: () => ['session', 'me'] as const,
    },
    shifts: {
        all: ['shifts'] as const,
        list: (filters: Record<string, unknown>) => ['shifts', 'list', filters] as const,
        detail: (shiftId: number) => ['shifts', 'detail', shiftId] as const,
    },
    rosters: {
        all: ['rosters'] as const,
        list: (filters: Record<string, unknown>) => ['rosters', 'list', filters] as const,
        detail: (rosterId: number) => ['rosters', 'detail', rosterId] as const,
    },
    availability: {
        all: ['availability'] as const,
        list: (employeeId: number) => ['availability', 'list', employeeId] as const,
    },
    leave: {
        all: ['leave'] as const,
        list: (filters: Record<string, unknown>) => ['leave', 'list', filters] as const,
        detail: (leaveRequestId: number) => ['leave', 'detail', leaveRequestId] as const,
        types: () => ['leave', 'types'] as const,
    },
    notifications: {
        all: ['notifications'] as const,
        list: (filters: Record<string, unknown>) => ['notifications', 'list', filters] as const,
        unreadCount: () => ['notifications', 'unreadCount'] as const,
    },
} as const;

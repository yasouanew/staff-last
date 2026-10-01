import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import type { AppError } from '../../../types/appError';
import { queryKeys } from '../../../utils/queryKeys';
import { todayApiDate, addDays, shiftDurationMinutes } from '../../../utils/date';
import { useUnreadCount } from '../../notifications/hooks';
import { useShifts } from '../../shifts/hooks';
import type { Shift } from '../../shifts/types';

/**
 * Everything the Home dashboard needs, composed from the feature hooks.
 *
 * Home is a *composition* screen, not a feature with its own endpoints: the backend
 * exposes no `/home` or `/today` route (spec G7). This hook is the seam that keeps
 * that fact contained — the screen renders one object and never learns that "today"
 * is derived from a date-ranged shift query.
 *
 * Query contract (spec Screen 4 API 2):
 * `GET /shifts?employee_id=<own>&date_from=<today>&date_to=<today>&per_page=10`.
 * A second narrow window (`tomorrow → +7d`) powers "Next up" without downloading
 * the whole shift table.
 */

export type HomeDashboard = {
    /** Shifts falling on today's date, in start-time order. */
    todayShifts: Shift[];
    /** The next upcoming shift after today, if any. */
    nextShift: Shift | null;
    unreadNotifications: number;
    /** Worked minutes across today's shifts (unpaid breaks subtracted). */
    todayMinutes: number;
    /** `Y-m-d` for today — the screen renders the date header from this. */
    today: string;
    /** Null when the account has no linked employee record (cannot have shifts). */
    employeeId: number | null;
    isLoading: boolean;
    isError: boolean;
    /** Non-null exactly when `isError` is true. */
    error: AppError;
    /** True when every source loaded successfully but there is nothing to show. */
    isEmpty: boolean;
    refresh: () => void;
    isRefreshing: boolean;
};

export function useHomeDashboard(): HomeDashboard {
    const queryClient = useQueryClient();
    const today = todayApiDate();
    const tomorrow = addDays(today, 1);
    const weekAhead = addDays(today, 7);

    const todayQuery = useShifts({ date_from: today, date_to: today, per_page: 10 });
    const upcomingQuery = useShifts({ date_from: tomorrow, date_to: weekAhead, per_page: 50 });
    const unread = useUnreadCount();

    const todayShiftList = useMemo(() => {
        const all = todayQuery.data?.data ?? [];

        return [...all].sort((a, b) => a.start_time.localeCompare(b.start_time));
    }, [todayQuery.data]);

    const nextShift = useMemo(() => {
        const all = upcomingQuery.data?.data ?? [];

        return (
            [...all].sort((a, b) => {
                const byDate = a.date.localeCompare(b.date);

                return byDate !== 0 ? byDate : a.start_time.localeCompare(b.start_time);
            })[0] ?? null
        );
    }, [upcomingQuery.data]);

    const todayMinutes = useMemo(
        () =>
            todayShiftList.reduce(
                (total, shift) =>
                    total +
                    shiftDurationMinutes(
                        shift.start_time,
                        shift.end_time,
                        shift.break_minutes,
                        shift.paid_break,
                    ),
                0,
            ),
        [todayShiftList],
    );

    // The dashboard is loading only while the primary source (today's shifts) has
    // nothing to show. Auxiliary failures (badge count, upcoming) must not blank
    // the screen, because the today list is still useful without them.
    // When there is no linked employee record the queries stay disabled — that is
    // not loading, it is an empty state the screen renders explicitly.
    const employeeId = todayQuery.employeeId;
    const isLoading = employeeId !== null && todayQuery.isPending;

    const refresh = () => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.session.me() });
        void todayQuery.refetch();
        void upcomingQuery.refetch();
        void unread.refetch();
    };

    return {
        todayShifts: todayShiftList,
        nextShift,
        unreadNotifications: unread.data?.count ?? 0,
        todayMinutes,
        today,
        employeeId,
        isLoading,
        isError: todayQuery.isError,
        // The today query is the dashboard's primary source, so its failure is the
        // screen's failure. `useQuery` leaves `error` null on success, which is why
        // this can be asserted safely here rather than defaulted at every call site.
        error: todayQuery.error as AppError,
        // Never "empty" while loading — the UI shows the skeleton, not a hollow state.
        isEmpty:
            !isLoading && !todayQuery.isError && todayShiftList.length === 0 && nextShift === null,
        refresh,
        isRefreshing: todayQuery.isRefetching || upcomingQuery.isRefetching,
    };
}

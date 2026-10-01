import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import { queryKeys } from '../../../../utils/queryKeys';
import { addDays, todayApiDate } from '../../../../utils/date';
import { useHomeDashboard } from '../useHomeDashboard';
import type { Shift } from '../../../shifts/types';

const mockUseShifts = jest.fn();
const mockUseUnreadCount = jest.fn();
const mockInvalidateQueries = jest.fn();

jest.mock('../../../shifts/hooks', () => ({
    useShifts: (...args: unknown[]) => mockUseShifts(...args),
}));

jest.mock('../../../notifications/hooks', () => ({
    useUnreadCount: (...args: unknown[]) => mockUseUnreadCount(...args),
}));

jest.mock('@tanstack/react-query', () => {
    const actual = jest.requireActual('@tanstack/react-query');
    return {
        ...actual,
        useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
    };
});

function makeShift(overrides: Partial<Shift> = {}): Shift {
    return {
        id: 1,
        company_id: 1,
        branch_id: 5,
        branch: { id: 5, name: 'CBD' },
        roster_id: 20,
        employee_id: 9,
        employee: { id: 9, first_name: 'Ava', last_name: 'S', full_name: 'Ava S' },
        position_id: null,
        department_id: null,
        date: todayApiDate(),
        start_time: '09:00',
        end_time: '17:00',
        break_minutes: 30,
        paid_break: false,
        status: 'scheduled',
        notes: null,
        created_at: '2026-09-01T00:00:00Z',
        updated_at: '2026-09-01T00:00:00Z',
        ...overrides,
    };
}

function paginated(items: Shift[]) {
    return {
        data: items,
        meta: { current_page: 1, last_page: 1, per_page: 50, total: items.length },
    };
}

type Harness = { current: ReturnType<typeof useHomeDashboard> | null };

function renderDashboard(): Harness {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const harness: Harness = { current: null };
    function Probe(): null {
        harness.current = useHomeDashboard();
        return null;
    }
    ReactTestRenderer.act(() => {
        ReactTestRenderer.create(
            <QueryClientProvider client={queryClient}>
                <Probe />
            </QueryClientProvider>,
        );
    });
    return harness;
}

describe('useHomeDashboard', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockUseUnreadCount.mockReturnValue({ data: { count: 3 }, refetch: jest.fn() });
    });

    it('queries today with date_from/date_to=today per_page=10 and upcoming as tomorrow→+7d', () => {
        const today = todayApiDate();
        mockUseShifts
            .mockReturnValueOnce({
                data: paginated([]),
                isPending: false,
                isError: false,
                error: null,
                isRefetching: false,
                refetch: jest.fn(),
                employeeId: 9,
            })
            .mockReturnValueOnce({
                data: paginated([]),
                isPending: false,
                isError: false,
                error: null,
                isRefetching: false,
                refetch: jest.fn(),
                employeeId: 9,
            });

        renderDashboard();

        expect(mockUseShifts).toHaveBeenNthCalledWith(1, {
            date_from: today,
            date_to: today,
            per_page: 10,
        });
        expect(mockUseShifts).toHaveBeenNthCalledWith(2, {
            date_from: addDays(today, 1),
            date_to: addDays(today, 7),
            per_page: 50,
        });
        // Old from/to names must never be sent — backend ignores them.
        expect(mockUseShifts.mock.calls[0]?.[0]).not.toHaveProperty('from');
        expect(mockUseShifts.mock.calls[0]?.[0]).not.toHaveProperty('to');
    });

    it('sorts today shifts by start_time and sums worked minutes minus unpaid breaks', () => {
        const today = todayApiDate();
        const late = makeShift({ id: 2, start_time: '14:00', end_time: '18:00', break_minutes: null, paid_break: null });
        const early = makeShift({ id: 1, start_time: '09:00', end_time: '17:00', break_minutes: 30, paid_break: false });
        mockUseShifts
            .mockReturnValueOnce({
                data: paginated([late, early]),
                isPending: false,
                isError: false,
                error: null,
                isRefetching: false,
                refetch: jest.fn(),
                employeeId: 9,
            })
            .mockReturnValueOnce({
                data: paginated([]),
                isPending: false,
                isError: false,
                error: null,
                isRefetching: false,
                refetch: jest.fn(),
                employeeId: 9,
            });

        const harness = renderDashboard();

        expect(harness.current?.todayShifts.map(s => s.id)).toEqual([1, 2]);
        expect(harness.current?.today).toBe(today);
        // 09-17 minus 30 unpaid = 450, plus 14-18 = 240 → 690.
        expect(harness.current?.todayMinutes).toBe(690);
        expect(harness.current?.isEmpty).toBe(false);
    });

    it('picks nextShift strictly after today, never a later-today shift', () => {
        const today = todayApiDate();
        const tomorrowShift = makeShift({ id: 10, date: addDays(today, 1), start_time: '09:00' });
        mockUseShifts
            .mockReturnValueOnce({
                data: paginated([makeShift({ id: 1 })]),
                isPending: false,
                isError: false,
                error: null,
                isRefetching: false,
                refetch: jest.fn(),
                employeeId: 9,
            })
            .mockReturnValueOnce({
                data: paginated([tomorrowShift]),
                isPending: false,
                isError: false,
                error: null,
                isRefetching: false,
                refetch: jest.fn(),
                employeeId: 9,
            });

        const harness = renderDashboard();

        expect(harness.current?.nextShift?.id).toBe(10);
    });

    it('reports empty only when both today and upcoming are clear, and never while loading', () => {
        mockUseShifts
            .mockReturnValueOnce({
                data: undefined,
                isPending: true,
                isError: false,
                error: null,
                isRefetching: false,
                refetch: jest.fn(),
                employeeId: 9,
            })
            .mockReturnValueOnce({
                data: paginated([]),
                isPending: false,
                isError: false,
                error: null,
                isRefetching: false,
                refetch: jest.fn(),
                employeeId: 9,
            });

        const loading = renderDashboard();
        expect(loading.current?.isLoading).toBe(true);
        expect(loading.current?.isEmpty).toBe(false);
    });

    it('refresh revalidates me plus both shift windows and the badge', () => {
        const todayRefetch = jest.fn();
        const upcomingRefetch = jest.fn();
        const badgeRefetch = jest.fn();
        mockUseShifts
            .mockReturnValueOnce({
                data: paginated([]),
                isPending: false,
                isError: false,
                error: null,
                isRefetching: false,
                refetch: todayRefetch,
                employeeId: 9,
            })
            .mockReturnValueOnce({
                data: paginated([]),
                isPending: false,
                isError: false,
                error: null,
                isRefetching: false,
                refetch: upcomingRefetch,
                employeeId: 9,
            });
        mockUseUnreadCount.mockReturnValue({ data: { count: 0 }, refetch: badgeRefetch });

        const harness = renderDashboard();
        ReactTestRenderer.act(() => {
            harness.current?.refresh();
        });

        expect(mockInvalidateQueries).toHaveBeenCalledWith({
            queryKey: queryKeys.session.me(),
        });
        expect(todayRefetch).toHaveBeenCalled();
        expect(upcomingRefetch).toHaveBeenCalled();
        expect(badgeRefetch).toHaveBeenCalled();
    });
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import type { AppError } from '../../../../types/appError';
import { leaveApi } from '../../api';
import { useLeaveTypes } from '../useLeaveTypes';
import type { LeaveType } from '../../types';

const mockUseQuery = jest.fn();

jest.mock('@tanstack/react-query', () => {
    const actual = jest.requireActual('@tanstack/react-query');

    return {
        ...actual,
        useQuery: (...args: unknown[]) => mockUseQuery(...args),
    };
});

jest.mock('../../api', () => ({
    leaveApi: {
        types: jest.fn(),
    },
}));

const mockedApi = leaveApi as jest.Mocked<typeof leaveApi>;

function makeType(overrides: Partial<LeaveType> = {}): LeaveType {
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

function queryState(overrides: Record<string, unknown> = {}) {
    const { error = null, ...rest } = overrides as { error?: unknown } & Record<string, unknown>;
    return {
        data: undefined,
        isPending: false,
        isFetching: false,
        refetch: jest.fn(),
        ...rest,
        error,
        isError: error !== null,
    };
}

function forbiddenError(): AppError {
    return { kind: 'forbidden', status: 403, message: 'Forbidden' };
}

type Harness = { current: ReturnType<typeof useLeaveTypes> | null };

function renderTypes(): Harness {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const harness: Harness = { current: null };
    function Probe(): null {
        harness.current = useLeaveTypes();
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

/**
 * Pins the G2 picker contract (spec Screen 9 §5):
 * - queries leave-types with status=active per_page=100
 * - 403/401 surfaces as isUnsupported (fallback banner), never as a fatal error
 * - 403 never retries; genuine failures do
 * - paginated and plain-array payloads both unwrap
 */
describe('useLeaveTypes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('queries active leave types for the picker', async () => {
        mockUseQuery.mockReturnValue(queryState({ data: [makeType()] }));
        mockedApi.types.mockResolvedValue([makeType()]);

        renderTypes();

        const options = mockUseQuery.mock.calls[0]?.[0] as {
            queryFn: () => Promise<unknown>;
        };

        await options.queryFn();
        expect(mockedApi.types).toHaveBeenCalledWith({ status: 'active', per_page: 100 });
    });

    it('treats a 403 as the documented G2 gap, not a retryable error', () => {
        mockUseQuery.mockReturnValue(queryState({ error: forbiddenError(), isPending: false }));

        const harness = renderTypes();

        expect(harness.current?.isUnsupported).toBe(true);
        expect(harness.current?.isError).toBe(false);
        expect(harness.current?.error).toBeNull();
        expect(harness.current?.leaveTypes).toEqual([]);
    });

    it('does not retry a 403 (deterministic authorization failure)', () => {
        mockUseQuery.mockReturnValue(queryState({ error: forbiddenError() }));

        renderTypes();

        const options = mockUseQuery.mock.calls[0]?.[0] as {
            retry: (failureCount: number, error: AppError) => boolean;
        };
        expect(options.retry(0, forbiddenError())).toBe(false);
        expect(options.retry(5, forbiddenError())).toBe(false);
    });

    it('reports a genuine failure as a retryable error, not as the gap', () => {
        mockUseQuery.mockReturnValue(
            queryState({
                error: { kind: 'server', status: 500, message: 'Boom' } as AppError,
            }),
        );

        const harness = renderTypes();

        expect(harness.current?.isUnsupported).toBe(false);
        expect(harness.current?.isError).toBe(true);
        expect(harness.current?.error).not.toBeNull();
    });

    it('unwraps both paginated and plain-array type payloads', () => {
        mockUseQuery.mockReturnValue(
            queryState({ data: { data: [makeType({ id: 3 })] } }),
        );
        const paginated = renderTypes();
        expect(paginated.current?.leaveTypes.map(t => t.id)).toEqual([3]);

        mockUseQuery.mockReturnValue(queryState({ data: [makeType({ id: 4 })] }));
        const plain = renderTypes();
        expect(plain.current?.leaveTypes.map(t => t.id)).toEqual([4]);
    });

    /**
     * The refresh signal and the first-load signal answer different questions, and
     * the Request Leave pull-to-refresh depends on that difference: `isLoading` is
     * "nothing to show yet" (a skeleton), `isRefreshing` is "a request is in flight"
     * (a spinner over content that is already there).
     */
    it('reports refreshing for any in-flight fetch, not only the first load', () => {
        mockUseQuery.mockReturnValue(
            queryState({ data: [makeType()], isPending: false, isFetching: true }),
        );

        const harness = renderTypes();

        expect(harness.current?.isRefreshing).toBe(true);
        // Cached types are present, so this is a repeat fetch, not a cold load.
        expect(harness.current?.isLoading).toBe(false);
    });

    it('reports refreshing during the cold load so a pull stays engaged', () => {
        mockUseQuery.mockReturnValue(
            queryState({ data: undefined, isPending: true, isFetching: true }),
        );

        const harness = renderTypes();

        expect(harness.current?.isRefreshing).toBe(true);
        expect(harness.current?.isLoading).toBe(true);
    });

    it('reports not refreshing once the request settles', () => {
        mockUseQuery.mockReturnValue(queryState({ data: [], isPending: false, isFetching: false }));

        const harness = renderTypes();

        expect(harness.current?.isRefreshing).toBe(false);
    });
});

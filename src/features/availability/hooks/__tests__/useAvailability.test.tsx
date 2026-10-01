import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import type { AppError } from '../../../../types/appError';
import { availabilityApi } from '../../api';
import { useAvailability } from '../useAvailability';
import type { Availability } from '../../types';

const mockUseSessionStore = jest.fn();
const mockUseQuery = jest.fn();

jest.mock('../../../auth/store/sessionStore', () => ({
    useSessionStore: (selector: (state: unknown) => unknown) => mockUseSessionStore(selector),
}));

jest.mock('@tanstack/react-query', () => {
    const actual = jest.requireActual('@tanstack/react-query');

    return {
        ...actual,
        useQuery: (...args: unknown[]) => mockUseQuery(...args),
    };
});

jest.mock('../../api', () => ({
    availabilityApi: {
        list: jest.fn(),
    },
}));

const mockedApi = availabilityApi as jest.Mocked<typeof availabilityApi>;

function makeAvailability(overrides: Partial<Availability> = {}): Availability {
    return {
        id: 1,
        employee_id: 9,
        day_of_week: 1,
        day_name: 'Monday',
        is_available: true,
        start_time: '09:00',
        end_time: '17:00',
        created_at: '2026-09-01T10:00:00+10:00',
        updated_at: '2026-09-01T10:00:00+10:00',
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

type Harness = { current: ReturnType<typeof useAvailability> | null };

function renderAvailability(): Harness {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const harness: Harness = { current: null };
    function Probe(): null {
        harness.current = useAvailability();
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

describe('useAvailability', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockUseSessionStore.mockImplementation((selector: (state: unknown) => unknown) =>
            selector({ user: { employee_id: 9 } }),
        );
    });

    it('scopes the query to me.employee_id and calls employees/{id}/availabilities', async () => {
        mockUseQuery.mockReturnValue(queryState({ data: [makeAvailability()] }));
        mockedApi.list.mockResolvedValue([makeAvailability()]);

        renderAvailability();

        const options = mockUseQuery.mock.calls[0]?.[0] as {
            queryFn: () => Promise<Availability[]>;
            enabled: boolean;
        };
        expect(options.enabled).toBe(true);

        await options.queryFn();
        expect(mockedApi.list).toHaveBeenCalledWith(9);
    });

    it('disables the query when there is no linked employee record', () => {
        mockUseSessionStore.mockImplementation((selector: (state: unknown) => unknown) =>
            selector({ user: { employee_id: null } }),
        );
        mockUseQuery.mockReturnValue(queryState({ isPending: false }));

        const harness = renderAvailability();

        const options = mockUseQuery.mock.calls[0]?.[0] as { enabled: boolean };
        expect(options.enabled).toBe(false);
        expect(harness.current?.employeeId).toBeNull();
        expect(harness.current?.isLoading).toBe(false);
        expect(mockedApi.list).not.toHaveBeenCalled();
    });

    it('treats a 403 as the documented backend gap, not a retryable error', () => {
        mockUseQuery.mockReturnValue(queryState({ error: forbiddenError(), isPending: false }));

        const harness = renderAvailability();

        expect(harness.current?.isUnsupported).toBe(true);
        expect(harness.current?.isError).toBe(false);
        expect(harness.current?.error).toBeNull();
    });

    it('does not retry a 403 (deterministic authorization failure)', () => {
        mockUseQuery.mockReturnValue(queryState({ error: forbiddenError() }));

        renderAvailability();

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

        const harness = renderAvailability();

        expect(harness.current?.isUnsupported).toBe(false);
        expect(harness.current?.isError).toBe(true);
        expect(harness.current?.error).not.toBeNull();
    });

    it('re-sorts server rows by day_of_week then start_time', () => {
        mockUseQuery.mockReturnValue(
            queryState({
                data: [
                    makeAvailability({ id: 3, day_of_week: 3 }),
                    makeAvailability({ id: 2, day_of_week: 1, start_time: '14:00' }),
                    makeAvailability({ id: 1, day_of_week: 1, start_time: '09:00' }),
                ],
            }),
        );

        const harness = renderAvailability();

        expect(harness.current?.availability.map(a => a.id)).toEqual([1, 2, 3]);
    });
});

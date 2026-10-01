import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import { useSessionStore } from '../../../auth/store/sessionStore';
import { leaveApi } from '../../api';
import type { CreateLeaveRequestPayload } from '../../types';
import { useCreateLeaveRequest } from '../useCreateLeaveRequest';

/**
 * The session trust boundary, at the write site.
 *
 * [`requireValidatedSession`](src/features/auth/store/sessionStore.ts:1) is unit-tested
 * in the store suite; this pins that the *actual* leave-submission mutation invokes it,
 * so a refactor cannot quietly drop the guard while the store-level test still passes.
 *
 * The hook is exercised through `react-test-renderer` (the project has no
 * `@testing-library/react-native`), driving the real mutation and real store.
 */

jest.mock('../../api', () => ({
    leaveApi: { create: jest.fn() },
}));

const mockedCreate = leaveApi.create as jest.MockedFunction<typeof leaveApi.create>;

const PAYLOAD: CreateLeaveRequestPayload = {
    employee_id: 42,
    leave_type_id: 2,
    start_date: '2026-09-20',
    end_date: '2026-09-20',
};

type Harness = { current: ReturnType<typeof useCreateLeaveRequest> | null };

function renderHook(): Harness {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const harness: Harness = { current: null };

    function Probe(): null {
        harness.current = useCreateLeaveRequest();

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

function mutationOf(harness: Harness): ReturnType<typeof useCreateLeaveRequest> {
    if (harness.current === null) {
        throw new Error('The create-leave hook was not rendered.');
    }

    return harness.current;
}

describe('useCreateLeaveRequest session gating', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockedCreate.mockResolvedValue({ id: 1 } as never);
    });

    it('submits when the session is validated (authenticated-online)', async () => {
        useSessionStore.setState({ status: 'authenticated-online' });

        const harness = renderHook();

        await ReactTestRenderer.act(async () => {
            await mutationOf(harness).mutateAsync(PAYLOAD);
        });

        expect(mockedCreate).toHaveBeenCalledWith(PAYLOAD);
    });

    it('refuses to submit while the session is offline, without calling the API', async () => {
        // A cached user is present but the session is not server-validated.
        useSessionStore.setState({ status: 'authenticated-offline', user: { id: 42 } as never });

        const harness = renderHook();

        await ReactTestRenderer.act(async () => {
            await expect(mutationOf(harness).mutateAsync(PAYLOAD)).rejects.toMatchObject({
                kind: 'network',
            });
        });

        // The decisive assertion: a stale cached user must not reach the network.
        expect(mockedCreate).not.toHaveBeenCalled();
    });

    it('refuses to submit while the session is still validating', async () => {
        useSessionStore.setState({ status: 'authenticated-validating', user: { id: 42 } as never });

        const harness = renderHook();

        await ReactTestRenderer.act(async () => {
            await expect(mutationOf(harness).mutateAsync(PAYLOAD)).rejects.toBeDefined();
        });

        expect(mockedCreate).not.toHaveBeenCalled();
    });
});

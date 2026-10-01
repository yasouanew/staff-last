import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { act } from 'react';
import ReactTestRenderer from 'react-test-renderer';

import { useSessionStore } from '../../../auth/store/sessionStore';
import { useNotificationInboxStore } from '../../store';
import { useInbox } from '../useInbox';
import type { NotificationListResponse } from '../../types';

/**
 * Regression guard for the `GET /notifications` response shape.
 *
 * The endpoint returns a *custom wrapper* — `data.notifications` plus
 * `data.unread_count`/`data.meta` — not a Laravel paginator's `data.data`. The inbox
 * previously read `query.data?.data`, which was `undefined`, so a successful 200
 * rendered an empty screen. These tests drive the real store/merge pipeline and pin
 * the hook to the correct key.
 */

const mockList = jest.fn();

jest.mock('../../api', () => ({
    notificationsApi: { list: (...args: unknown[]) => mockList(...args) },
}));

function makeResponse(overrides: Partial<NotificationListResponse> = {}): NotificationListResponse {
    return {
        notifications: [
            {
                id: 'adb3f516-517a-48a3-8353-583e666ce260',
                type: 'roster_updated',
                title: 'Roster updated',
                body: '1 change to your roster for the week.',
                data: { type: 'roster_published' },
                read_at: null,
                created_at: '2026-09-12T09:00:00+10:00',
            },
        ],
        unread_count: 1,
        meta: { current_page: 1, last_page: 1, per_page: 30, total: 1 },
        ...overrides,
    };
}

/**
 * The list response is now validated at the API boundary
 * ([`notificationListResponseSchema`](../../validation/apiSchemas.ts:1)), so the mocked
 * `notificationsApi.list` returns the *validated* shape the real service would.
 * `notifications: undefined` cannot occur post-validation; the "empty" case is an empty
 * array, which is the honest contract for "no rows".
 */

let renderer: ReactTestRenderer.ReactTestRenderer | null = null;

async function renderInbox(): Promise<void> {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
                // Without this, React Query schedules a GC timer that outlives the
                // test and keeps Jest's process alive.
                gcTime: Infinity,
            },
        },
    });

    function Probe(): null {
        useInbox(30);
        return null;
    }

    await ReactTestRenderer.act(async () => {
        renderer = ReactTestRenderer.create(
            <QueryClientProvider client={queryClient}>
                <Probe />
            </QueryClientProvider>,
        );
        // Let the query resolve, the effect fire, and the merge persist.
        await Promise.resolve();
        await Promise.resolve();
    });
}

describe('useInbox', () => {
    beforeEach(async () => {
        jest.clearAllMocks();
        mockList.mockResolvedValue(makeResponse());
        useSessionStore.setState({ status: 'authenticated-online', user: { id: 7 } as never });
        await act(async () => {
            await useNotificationInboxStore.getState().reset();
        });
    });

    afterEach(async () => {
        await act(async () => {
            renderer?.unmount();
        });
        renderer = null;
    });

    it('merges the rows from the custom wrapper (`data.notifications`) into the inbox', async () => {
        await renderInbox();

        const { items } = useNotificationInboxStore.getState();

        expect(mockList).toHaveBeenCalledWith({ per_page: 30 });
        expect(items).toHaveLength(1);
        expect(items[0]?.id).toBe('adb3f516-517a-48a3-8353-583e666ce260');
        expect(items[0]?.server_id).toBe('adb3f516-517a-48a3-8353-583e666ce260');
        expect(items[0]?.pending).toBe(false);
    });

    it('leaves the inbox empty when the server returns no rows', async () => {
        // The API boundary guarantees `notifications` is an array, so "no rows" is an
        // empty array rather than `undefined`.
        mockList.mockResolvedValue(makeResponse({ notifications: [] }));

        await renderInbox();

        expect(useNotificationInboxStore.getState().items).toHaveLength(0);
    });
});

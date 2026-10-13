import AsyncStorage from '@react-native-async-storage/async-storage';

import { useSessionStore } from '../../../auth/store/sessionStore';
import { useNotificationInboxStore } from '../../store';
import { syncNotifications } from '../syncNotifications';

/**
 * Server reconciliation.
 *
 * The sync is the fallback for a push that was never delivered (device offline or
 * force-stopped). It must:
 *
 * - request only the gap after the stored watermark, not the whole feed,
 * - merge the returned rows into the local inbox,
 * - deduplicate a row that was already materialised locally by push,
 * - swallow a failure rather than throwing into the recovery pipeline.
 */

const mockList = jest.fn();

jest.mock('../../api', () => ({
    notificationsApi: { list: (...args: unknown[]) => mockList(...args) },
}));

function serverRow(overrides: Record<string, unknown> = {}) {
    return {
        id: 'server-1',
        type: 'roster.published',
        title: 'Roster published',
        body: 'Your roster is ready.',
        data: { roster_id: 9 },
        read_at: null,
        created_at: '2026-09-12T09:00:00.000Z',
        ...overrides,
    };
}

describe('syncNotifications', () => {
    beforeEach(async () => {
        jest.clearAllMocks();
        await AsyncStorage.clear();
        useNotificationInboxStore.setState({
            items: [],
            hydrated: false,
            userId: null,
            synced: false,
            watermark: null,
        });
        useSessionStore.setState({ status: 'authenticated-online', user: { id: 7 } as never });
    });

    it('omits the cursor on a first sync and merges the returned rows', async () => {
        mockList.mockResolvedValueOnce({ notifications: [serverRow()], unread_count: 1, meta: {} });

        const merged = await syncNotifications();

        expect(mockList).toHaveBeenCalledWith({ per_page: 50 });
        expect(merged).toBe(1);
        expect(useNotificationInboxStore.getState().items).toHaveLength(1);
        expect(useNotificationInboxStore.getState().watermark).toBe('2026-09-12T09:00:00.000Z');
    });

    it('requests only the gap after the stored watermark', async () => {
        useNotificationInboxStore.setState({ watermark: '2026-09-10T00:00:00.000Z' });
        mockList.mockResolvedValueOnce({ notifications: [], unread_count: 0, meta: {} });

        await syncNotifications();

        expect(mockList).toHaveBeenCalledWith({
            per_page: 50,
            since: '2026-09-10T00:00:00.000Z',
        });
    });

    it('deduplicates a row already materialised locally by push', async () => {
        // A push created a pending row with a business-key id and no server id.
        await useNotificationInboxStore.getState().receivePush(
            { type: 'roster.published', roster_id: 9, title: 'Roster published', body: 'Your roster is ready.' },
            'push:roster_id=9&type=roster.published',
        );

        mockList.mockResolvedValueOnce({ notifications: [serverRow()], unread_count: 1, meta: {} });

        await syncNotifications();

        const items = useNotificationInboxStore.getState().items;

        // One row, not two: the server row adopted the push row's identity.
        expect(items).toHaveLength(1);
        expect(items[0]?.server_id).toBe('server-1');
        expect(items[0]?.pending).toBe(false);
    });

    it('does nothing without an authenticated session', async () => {
        useSessionStore.setState({ status: 'unauthenticated', user: null });

        const merged = await syncNotifications();

        expect(merged).toBe(0);
        expect(mockList).not.toHaveBeenCalled();
    });

    it('swallows a failure and reports zero merged rows', async () => {
        mockList.mockRejectedValueOnce({ kind: 'network', message: 'offline' });

        await expect(syncNotifications()).resolves.toBe(0);
    });
});

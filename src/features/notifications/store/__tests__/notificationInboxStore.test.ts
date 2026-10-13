import AsyncStorage from '@react-native-async-storage/async-storage';

import { STORAGE_KEYS } from '../../../../config/storageKeys';
import { useNotificationInboxStore } from '../notificationInboxStore';

const serverItem = {
    id: 'server-1',
    type: 'shift.assigned',
    title: 'Shift assigned',
    body: 'Monday',
    data: { shift_id: 42 },
    read_at: null,
    created_at: '2026-09-10T08:00:00.000Z',
};

describe('notificationInboxStore', () => {
    beforeEach(async () => {
        await AsyncStorage.clear();
        useNotificationInboxStore.setState({
            items: [],
            hydrated: false,
            loaded: false,
            userId: null,
            synced: false,
            watermark: null,
        });
    });

    it('hydrates from disk and discards another user\'s inbox', async () => {
        await AsyncStorage.setItem(
            STORAGE_KEYS.notificationInbox,
            JSON.stringify({
                userId: 1,
                items: [{ ...serverItem, server_id: 'server-1', pending: false }],
                hydrated: true,
                updatedAt: '2026-09-10T00:00:00.000Z',
            }),
        );

        await useNotificationInboxStore.getState().hydrate(2);

        const state = useNotificationInboxStore.getState();

        expect(state.items).toEqual([]);
        expect(state.userId).toBe(2);
        expect(await AsyncStorage.getItem(STORAGE_KEYS.notificationInbox)).toBeNull();
    });

    it('merges a server page and persists it', async () => {
        await useNotificationInboxStore.getState().mergeFromServer(7, [serverItem]);

        const state = useNotificationInboxStore.getState();

        expect(state.items).toHaveLength(1);
        expect(state.synced).toBe(true);

        const raw = await AsyncStorage.getItem(STORAGE_KEYS.notificationInbox);

        expect(raw).not.toBeNull();
        expect(JSON.parse(raw ?? '{}').items).toHaveLength(1);
    });

    it('receives a push and marks it read locally', async () => {
        await useNotificationInboxStore.getState().receivePush(
            { type: 'shift.assigned', shift_id: 42, title: 'Shift assigned' },
            'push:1',
        );

        expect(useNotificationInboxStore.getState().items).toHaveLength(1);

        await useNotificationInboxStore.getState().markRead('push:1');

        expect(useNotificationInboxStore.getState().items[0]?.read_at).not.toBeNull();
    });

    it('does not wipe stored rows when a push arrives before hydration (headless launch)', async () => {
        // A previous session persisted a row.
        await AsyncStorage.setItem(
            STORAGE_KEYS.notificationInbox,
            JSON.stringify({
                userId: 7,
                items: [{ ...serverItem, server_id: 'server-1', notification_id: 'server-1', pending: false }],
                hydrated: true,
                updatedAt: '2026-09-10T00:00:00.000Z',
                watermark: null,
            }),
        );

        // A fresh headless process: in-memory state is empty and `loaded` is false.
        useNotificationInboxStore.setState({
            items: [],
            hydrated: false,
            loaded: false,
            userId: null,
            synced: false,
            watermark: null,
        });

        await useNotificationInboxStore.getState().receivePush(
            { type: 'roster.published', roster_id: 9, notification_id: 'server-2', title: 'Roster' },
            'push:2',
        );

        const items = useNotificationInboxStore.getState().items;

        // The stored row survived and the new push was added — not a one-row inbox.
        expect(items).toHaveLength(2);
        expect(items.map(item => item.id).sort()).toEqual(['server-1', 'server-2']);
    });

    it('is idempotent when the same notification_id is received twice', async () => {
        await useNotificationInboxStore.getState().receivePush(
            { type: 'roster.published', roster_id: 9, notification_id: 'server-2', title: 'Roster' },
            'push:delivery-1',
        );
        await useNotificationInboxStore.getState().receivePush(
            { type: 'roster.published', roster_id: 9, notification_id: 'server-2', title: 'Roster' },
            'push:delivery-2',
        );

        expect(useNotificationInboxStore.getState().items).toHaveLength(1);
    });

    it('resets to an empty inbox', async () => {
        await useNotificationInboxStore.getState().mergeFromServer(7, [serverItem]);
        await useNotificationInboxStore.getState().reset();

        const state = useNotificationInboxStore.getState();

        expect(state.items).toEqual([]);
        expect(state.userId).toBeNull();
    });
});

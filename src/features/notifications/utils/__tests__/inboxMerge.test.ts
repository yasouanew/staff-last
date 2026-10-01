import {
    INBOX_MAX_ITEMS,
    countUnread,
    deserializeInbox,
    emptyInbox,
    fromPushPayload,
    markAllItemsRead,
    markItemRead,
    mergeServerPage,
    upsertItem,
    type InboxItem,
    type PersistedInbox,
} from '../inboxMerge';
import type { AppNotification } from '../../types';

function serverNotification(overrides: Partial<AppNotification> = {}): AppNotification {
    return {
        id: 'server-1',
        type: 'shift.assigned',
        title: 'Shift assigned',
        body: 'You have a shift on Monday',
        data: { shift_id: 42 },
        read_at: null,
        created_at: '2026-09-10T08:00:00.000Z',
        ...overrides,
    };
}

function inboxItem(overrides: Partial<InboxItem> = {}): InboxItem {
    return {
        ...serverNotification(),
        server_id: 'server-1',
        pending: false,
        ...overrides,
    };
}

function persisted(overrides: Partial<PersistedInbox> = {}): PersistedInbox {
    return {
        userId: 7,
        items: [],
        hydrated: false,
        updatedAt: '2026-09-10T00:00:00.000Z',
        ...overrides,
    };
}

describe('deserializeInbox', () => {
    it('returns an empty inbox for non-object payloads', () => {
        expect(deserializeInbox(null)).toEqual(emptyInbox());
        expect(deserializeInbox('junk')).toEqual(emptyInbox());
        expect(deserializeInbox({ items: 'not-an-array' })).toEqual(emptyInbox());
    });

    it('drops rows that cannot be rendered', () => {
        const raw = {
            userId: 7,
            hydrated: true,
            updatedAt: '2026-09-10T00:00:00.000Z',
            items: [
                { id: 'ok', title: 'Title', created_at: '2026-09-10T08:00:00.000Z' },
                { id: 'no-title', created_at: '2026-09-10T08:00:00.000Z' },
                { title: 'no-id', created_at: '2026-09-10T08:00:00.000Z' },
                { id: 'no-date', title: 'Title' },
                'not-an-object',
            ],
        };

        const inbox = deserializeInbox(raw);

        expect(inbox.items).toHaveLength(1);
        expect(inbox.items[0]?.id).toBe('ok');
        expect(inbox.items[0]?.body).toBe('');
        expect(inbox.items[0]?.data).toEqual({});
    });
});

describe('mergeServerPage', () => {
    it('adopts server rows and marks the inbox hydrated', () => {
        const next = mergeServerPage(persisted(), [serverNotification()]);

        expect(next.hydrated).toBe(true);
        expect(next.items).toHaveLength(1);
        expect(next.items[0]?.server_id).toBe('server-1');
        expect(next.items[0]?.pending).toBe(false);
    });

    it('keeps a local read the server has not seen yet', () => {
        const local = persisted({
            items: [inboxItem({ read_at: '2026-09-10T09:00:00.000Z' })],
        });

        const next = mergeServerPage(local, [serverNotification({ read_at: null })]);

        expect(next.items[0]?.read_at).toBe('2026-09-10T09:00:00.000Z');
    });

    it('adopts a server read over a local unread', () => {
        const local = persisted({ items: [inboxItem({ read_at: null })] });

        const next = mergeServerPage(local, [
            serverNotification({ read_at: '2026-09-10T10:00:00.000Z' }),
        ]);

        expect(next.items[0]?.read_at).toBe('2026-09-10T10:00:00.000Z');
    });

    it('retains pending push rows the server does not know about', () => {
        const pending = inboxItem({
            id: 'push:abc',
            server_id: null,
            pending: true,
            type: 'roster.published',
            data: { roster_id: 9 },
        });
        const local = persisted({ items: [pending] });

        const next = mergeServerPage(local, [serverNotification()]);

        expect(next.items.map(item => item.id)).toContain('push:abc');
    });

    it('replaces the inbox when asked to', () => {
        const local = persisted({
            items: [inboxItem({ id: 'stale', server_id: 'stale', type: 'other' })],
        });

        const next = mergeServerPage(local, [serverNotification()], { replace: true });

        expect(next.items.map(item => item.id)).toEqual(['server-1']);
    });

    it('sorts newest first', () => {
        const next = mergeServerPage(
            persisted(),
            [
                serverNotification({ id: 'old', created_at: '2026-09-01T00:00:00.000Z' }),
                serverNotification({ id: 'new', created_at: '2026-09-12T00:00:00.000Z' }),
            ],
        );

        expect(next.items.map(item => item.id)).toEqual(['new', 'old']);
    });
});

describe('fromPushPayload', () => {
    it('builds a pending row from a data-only payload', () => {
        const item = fromPushPayload(
            { type: 'shift.assigned', shift_id: 42, title: 'Shift assigned', body: 'Monday' },
            { id: 'push:1', now: new Date('2026-09-10T08:00:00.000Z') },
        );

        expect(item).toMatchObject({
            id: 'push:1',
            type: 'shift.assigned',
            title: 'Shift assigned',
            body: 'Monday',
            read_at: null,
            server_id: null,
            pending: true,
        });
        expect(item.data).toEqual({ type: 'shift.assigned', shift_id: 42 });
    });

    it('falls back to a generic title when the payload has none', () => {
        const item = fromPushPayload({ type: 'leave.decided' }, { id: 'push:2' });

        expect(item.title).toBe('New notification');
        expect(item.type).toBe('leave.decided');
    });
});

describe('upsertItem', () => {
    it('inserts new rows newest-first and caps the inbox', () => {
        let inbox = persisted({ hydrated: true });

        for (let index = 0; index < INBOX_MAX_ITEMS + 10; index += 1) {
            inbox = upsertItem(
                inbox,
                inboxItem({
                    id: `item-${index}`,
                    server_id: `item-${index}`,
                    // Distinct business data per row, so this test exercises capacity
                    // rather than the same-notification identity match.
                    data: { shift_id: index },
                    created_at: new Date(Date.UTC(2026, 8, 10, 0, 0, index)).toISOString(),
                }),
            );
        }

        expect(inbox.items).toHaveLength(INBOX_MAX_ITEMS);
        expect(inbox.items[0]?.id).toBe(`item-${INBOX_MAX_ITEMS + 9}`);
    });

    it('treats rows with different server ids as distinct even with identical data', () => {
        const first = inboxItem({ id: 'a', server_id: 'a', data: { shift_id: 42 } });
        const second = inboxItem({ id: 'b', server_id: 'b', data: { shift_id: 42 } });

        const inbox = upsertItem(persisted({ items: [first] }), second);

        expect(inbox.items.map(item => item.id).sort()).toEqual(['a', 'b']);
    });

    it('refreshes an existing row instead of duplicating it', () => {
        const inbox = persisted({ items: [inboxItem({ read_at: null })] });

        const next = upsertItem(inbox, inboxItem({ read_at: '2026-09-10T09:00:00.000Z' }));

        expect(next.items).toHaveLength(1);
        expect(next.items[0]?.read_at).toBe('2026-09-10T09:00:00.000Z');
    });
});

describe('markItemRead / markAllItemsRead', () => {
    it('marks by id or server id and is idempotent', () => {
        const inbox = persisted({
            items: [inboxItem({ id: 'local', server_id: 'server-1', read_at: null })],
        });

        const byServerId = markItemRead(inbox, 'server-1', '2026-09-10T09:00:00.000Z');

        expect(byServerId.items[0]?.read_at).toBe('2026-09-10T09:00:00.000Z');

        const again = markItemRead(byServerId, 'local', '2026-09-10T10:00:00.000Z');

        expect(again).toBe(byServerId);
    });

    it('marks everything read', () => {
        const inbox = persisted({
            items: [
                inboxItem({ id: 'a', server_id: 'a', read_at: null }),
                inboxItem({ id: 'b', server_id: 'b', read_at: '2026-09-01T00:00:00.000Z' }),
            ],
        });

        const next = markAllItemsRead(inbox, '2026-09-10T09:00:00.000Z');

        expect(next.items.every(item => item.read_at !== null)).toBe(true);
        expect(next.items[1]?.read_at).toBe('2026-09-01T00:00:00.000Z');
    });
});

describe('countUnread', () => {
    it('counts only unread rows', () => {
        const inbox = persisted({
            items: [
                inboxItem({ id: 'a', server_id: 'a', read_at: null }),
                inboxItem({ id: 'b', server_id: 'b', read_at: '2026-09-01T00:00:00.000Z' }),
            ],
        });

        expect(countUnread(inbox)).toBe(1);
    });
});

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
        notification_id: null,
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
        watermark: null,
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

    it('collapses a push row into its server twin on the canonical id', () => {
        // A push materialised the row with the backend id already known.
        const pushRow = fromPushPayload(
            { type: 'roster.published', roster_id: 9, notification_id: 'server-1', title: 'Roster' },
            { id: 'push:delivery' },
        );
        const local = persisted({ items: [pushRow] });

        const next = mergeServerPage(local, [serverNotification({ id: 'server-1' })]);

        expect(next.items).toHaveLength(1);
        expect(next.items[0]?.id).toBe('server-1');
        expect(next.items[0]?.pending).toBe(false);
    });

    it('does not duplicate a notification the server page itself repeats', () => {
        const next = mergeServerPage(persisted(), [
            serverNotification({ id: 'server-1' }),
            serverNotification({ id: 'server-1' }),
        ]);

        expect(next.items).toHaveLength(1);
    });

    it('collapses a push row into its server twin when the payload is a subset (real backend shape)', () => {
        /*
         * REGRESSION GUARD for the reported "2 rows for 1 event" defect.
         *
         * The backend FCM payload carries only the routing keys and NO `notification_id`:
         *   { type: 'shift.assigned', shift_id: 42 }
         * The server row's `data` is the full `toArray()` bag — a strict superset:
         *   { type, shift_id, date, start_time, end_time, title, body }
         * The old identity check required identical key counts, so the two never matched
         * and the push row survived beside the server row.
         */
        const pushRow = fromPushPayload(
            { type: 'shift.assigned', shift_id: 42, title: 'New shift assigned', body: 'Monday' },
            { id: 'push:type=shift.assigned&shift_id=42' },
        );
        const local = persisted({ items: [pushRow] });

        const next = mergeServerPage(local, [
            serverNotification({
                id: 'server-1',
                type: 'shift.assigned',
                data: {
                    type: 'shift.assigned',
                    shift_id: 42,
                    date: '2026-09-14',
                    start_time: '09:00',
                    end_time: '17:00',
                    title: 'New shift assigned',
                    body: 'Monday',
                },
            }),
        ]);

        expect(next.items).toHaveLength(1);
        expect(next.items[0]?.id).toBe('server-1');
        expect(next.items[0]?.pending).toBe(false);
    });

    it('collapses a push row that carries a transport-only dedupe_key', () => {
        /*
         * The backend's FCM channel adds `dedupe_key` to the push data at send time, but
         * the server row's `data` (from `toArray()`) never contains it. Leaving it in the
         * business bag made the push a non-subset of the server row, so the two failed to
         * match and one event produced two rows.
         */
        const pushRow = fromPushPayload(
            {
                type: 'roster.published',
                roster_id: 9,
                dedupe_key: 'roster:9:v4:emp:7',
                title: 'Roster published',
                body: 'Ready.',
            },
            { id: 'push:roster-9' },
        );
        const local = persisted({ items: [pushRow] });

        const next = mergeServerPage(local, [
            serverNotification({
                id: 'server-1',
                type: 'roster.published',
                data: {
                    type: 'roster.published',
                    roster_id: 9,
                    week_start: '2026-09-14',
                    week_end: '2026-09-20',
                    title: 'Roster published',
                    body: 'Ready.',
                },
            }),
        ]);

        expect(next.items).toHaveLength(1);
        expect(next.items[0]?.id).toBe('server-1');
    });

    it('does not collapse two different events of the same type', () => {
        const pushRow = fromPushPayload(
            { type: 'shift.assigned', shift_id: 42, title: 'Shift' },
            { id: 'push:shift-42' },
        );
        const local = persisted({ items: [pushRow] });

        // A different shift id is a different event and must survive as its own row.
        const next = mergeServerPage(local, [
            serverNotification({
                id: 'server-99',
                type: 'shift.assigned',
                data: { type: 'shift.assigned', shift_id: 99, date: '2026-09-15' },
            }),
        ]);

        expect(next.items).toHaveLength(2);
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
            notification_id: null,
            pending: true,
        });
        expect(item.data).toEqual({ type: 'shift.assigned', shift_id: 42 });
    });

    it('adopts the canonical notification_id as the row identity', () => {
        const item = fromPushPayload(
            {
                type: 'shift.assigned',
                shift_id: 42,
                notification_id: 'ntf-9',
                title: 'Shift assigned',
                body: 'Monday',
            },
            { id: 'push:whatever' },
        );

        // The backend id wins over the caller's fallback id, and the row is no longer
        // "pending" because the server already owns it.
        expect(item.id).toBe('ntf-9');
        expect(item.server_id).toBe('ntf-9');
        expect(item.notification_id).toBe('ntf-9');
        expect(item.pending).toBe(false);
    });

    it('accepts a numeric notification_id from the wire', () => {
        const item = fromPushPayload({ type: 'leave.decided', notification_id: 17 }, { id: 'push:x' });

        expect(item.notification_id).toBe('17');
        expect(item.id).toBe('17');
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

    it('is idempotent for repeated delivery of the same notification_id', () => {
        // Two deliveries of one event, each with a different local fallback id (as FCM
        // assigns a fresh messageId per delivery) but the same canonical backend id.
        const first = fromPushPayload(
            { type: 'roster.published', roster_id: 9, notification_id: 'ntf-9', title: 'Roster' },
            { id: 'push:delivery-1' },
        );
        const second = fromPushPayload(
            { type: 'roster.published', roster_id: 9, notification_id: 'ntf-9', title: 'Roster' },
            { id: 'push:delivery-2' },
        );

        const inbox = upsertItem(persisted(), first);
        const next = upsertItem(inbox, second);

        expect(next.items).toHaveLength(1);
        expect(next.items[0]?.id).toBe('ntf-9');
    });

    it('does not resurrect a read row when the same notification is redelivered', () => {
        const read = inboxItem({ notification_id: 'ntf-9', server_id: 'ntf-9', read_at: '2026-09-10T09:00:00.000Z' });
        const redelivered = fromPushPayload(
            { type: 'shift.assigned', shift_id: 42, notification_id: 'ntf-9', title: 'Shift' },
            { id: 'push:again' },
        );

        const next = upsertItem(persisted({ items: [read] }), redelivered);

        expect(next.items).toHaveLength(1);
        expect(next.items[0]?.read_at).toBe('2026-09-10T09:00:00.000Z');
    });

    it('does not downgrade a server-confirmed row when a pending push arrives for it', () => {
        // The server already confirmed the event (superset data, real server id).
        const confirmed = inboxItem({
            id: 'server-1',
            server_id: 'server-1',
            notification_id: 'server-1',
            pending: false,
            type: 'shift.assigned',
            data: { type: 'shift.assigned', shift_id: 42, date: '2026-09-14' },
        });
        // A late/duplicate push for the same event (subset data, no server id).
        const push = fromPushPayload(
            { type: 'shift.assigned', shift_id: 42, title: 'Shift' },
            { id: 'push:late' },
        );

        const next = upsertItem(persisted({ items: [confirmed] }), push);

        expect(next.items).toHaveLength(1);
        expect(next.items[0]?.id).toBe('server-1');
        expect(next.items[0]?.pending).toBe(false);
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

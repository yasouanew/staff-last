import type { AppNotification } from '../types';

/**
 * Pure merge/normalisation logic for the offline notification inbox.
 *
 * Everything here is deliberately free of React, AsyncStorage and Firebase imports so
 * it can be unit-tested in a plain Jest environment and reasoned about in isolation.
 * The store ([`notificationInboxStore.ts`](src/features/notifications/store/notificationInboxStore.ts:1))
 * owns persistence; this module owns *meaning*.
 */

/**
 * Upper bound on how many notifications are kept on-device.
 *
 * The backend notification feed is unbounded, but a device only ever renders the first
 * screenful or two. Capping keeps the AsyncStorage payload (serialised as one JSON
 * blob) small enough that reads stay cheap, and means a device that has been offline
 * for months cannot grow an unbounded local database.
 */
export const INBOX_MAX_ITEMS = 200;

/**
 * A locally persisted notification.
 *
 * Extends the API shape with two device-local fields that the server knows nothing
 * about:
 *
 * - `server_id` — the backend id once known. Notifications created from a *data-only*
 *   push have no server id yet, and are only reconciled when a `GET /notifications`
 *   response contains their `id`. Until then they are marked `pending: true`.
 * - `pending` — true when the row was materialised from a push but has not yet been
 *   confirmed by the server. Pending rows are re-dated from the push event, not from
 *   a server timestamp.
 */
export type InboxItem = AppNotification & {
    server_id: string | null;
    pending: boolean;
};

export type PersistedInbox = {
    /** Owner of these rows. A different user's inbox must never be shown. */
    userId: number | null;
    items: InboxItem[];
    /** `false` until the first successful `GET /notifications` for this user. */
    hydrated: boolean;
    updatedAt: string;
};

/** An inbox owned by nobody, used as the reset value on sign-out. */
export function emptyInbox(): PersistedInbox {
    return { userId: null, items: [], hydrated: false, updatedAt: new Date(0).toISOString() };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Rebuilds a persisted payload defensively.
 *
 * AsyncStorage is shared with older app versions and can contain arbitrary JSON, so
 * every field is validated rather than trusted. A payload that cannot be salvaged
 * degrades to an empty inbox instead of crashing the notification screen — the same
 * contract [`getItem`](src/utils/storage.ts:16) documents for corrupt keys.
 */
export function deserializeInbox(raw: unknown): PersistedInbox {
    if (!isRecord(raw) || !Array.isArray(raw.items)) {
        return emptyInbox();
    }

    const items: InboxItem[] = [];

    for (const candidate of raw.items) {
        if (!isRecord(candidate)) {
            continue;
        }

        const id = typeof candidate.id === 'string' ? candidate.id : null;
        const title = typeof candidate.title === 'string' ? candidate.title : null;
        const body = typeof candidate.body === 'string' ? candidate.body : null;
        const createdAt = typeof candidate.created_at === 'string' ? candidate.created_at : null;

        // A row without an identity, a readable title and a date cannot be rendered and
        // would poison `formatRelative`, so it is dropped.
        if (id === null || title === null || createdAt === null) {
            continue;
        }

        items.push({
            id,
            type: typeof candidate.type === 'string' ? candidate.type : 'unknown',
            title,
            body: body ?? '',
            data: isRecord(candidate.data) ? candidate.data : {},
            read_at: typeof candidate.read_at === 'string' ? candidate.read_at : null,
            created_at: createdAt,
            server_id: typeof candidate.server_id === 'string' ? candidate.server_id : null,
            pending: candidate.pending === true,
        });
    }

    return {
        userId: typeof raw.userId === 'number' ? raw.userId : null,
        items,
        hydrated: raw.hydrated === true,
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date(0).toISOString(),
    };
}

/** Newest first, with a stable tiebreak so equal timestamps do not reorder on re-render. */
function byNewestFirst(a: InboxItem, b: InboxItem): number {
    const delta = Date.parse(b.created_at) - Date.parse(a.created_at);

    if (Number.isNaN(delta) || delta === 0) {
        return a.id.localeCompare(b.id);
    }

    return delta;
}

function cap(items: InboxItem[]): InboxItem[] {
    return items.length > INBOX_MAX_ITEMS ? items.slice(0, INBOX_MAX_ITEMS) : items;
}

/**
 * Drops a locally-persisted row that a server response has now confirmed.
 *
 * A push-materialised row and its server twin carry different ids (the push payload
 * contains a business key such as `shift_id`, not the notification uuid), so identity
 * is matched on the notification `id` when the backend sent one, and otherwise on
 * `type` + `data` contents, which is stable across both sources.
 */
function isSameNotification(a: InboxItem, b: InboxItem): boolean {
    if (a.server_id !== null && a.server_id === b.id) {
        return true;
    }

    if (b.server_id !== null && b.server_id === a.id) {
        return true;
    }

    if (a.id === b.id) {
        return true;
    }

    if (a.type !== b.type) {
        return false;
    }

    const aKeys = Object.keys(a.data);
    const bKeys = Object.keys(b.data);

    if (aKeys.length === 0 || aKeys.length !== bKeys.length) {
        return false;
    }

    return aKeys.every(key => String(a.data[key]) === String(b.data[key]));
}

/**
 * Merges a server page into the persisted inbox.
 *
 * Server rows are authoritative for read state *except* where the device has an
 * unwritten local read. That exception matters offline: the user taps a notification
 * while the request fails, the row is marked read locally, and the next successful
 * sync must not silently flip it back to unread.
 */
export function mergeServerPage(
    current: PersistedInbox,
    serverItems: AppNotification[],
    options: { replace?: boolean } = {},
): PersistedInbox {
    const serverRows: InboxItem[] = serverItems.map(item => ({
        ...item,
        server_id: item.id,
        pending: false,
    }));

    const previous = options.replace ? [] : current.items;

    // Server state wins for anything it knows about; `previous` only contributes
    // pending (push-only) rows and read-state that has not reached the server yet.
    const survivors: InboxItem[] = [];

    for (const row of previous) {
        const confirmed = serverRows.find(server => isSameNotification(row, server));

        if (confirmed !== undefined) {
            // Preserve a local read that the server may not have observed yet.
            if (row.read_at !== null && confirmed.read_at === null) {
                confirmed.read_at = row.read_at;
            }

            continue;
        }

        survivors.push(row);
    }

    return {
        ...current,
        items: cap([...serverRows, ...survivors].sort(byNewestFirst)),
        hydrated: true,
        updatedAt: new Date().toISOString(),
    };
}

/**
 * Materialises a row from an FCM payload.
 *
 * Data-only messages (no `notification` block) still arrive with a `title`/`body` in
 * the data bag — the backend's [`FcmMessage`](../staff-sass-last17/app/Notifications/Messages/FcmMessage.php:1)
 * puts `type` there for exactly this reason. Rows created here are `pending` until a
 * server sync confirms them.
 */
export function fromPushPayload(
    data: Record<string, unknown>,
    options: { id: string; now?: Date },
): InboxItem {
    const createdAt = (options.now ?? new Date()).toISOString();

    const readData: Record<string, unknown> = { ...data };
    delete readData.title;
    delete readData.body;

    return {
        id: options.id,
        type: typeof data.type === 'string' ? data.type : 'unknown',
        title: typeof data.title === 'string' ? data.title : 'New notification',
        body: typeof data.body === 'string' ? data.body : '',
        data: readData,
        read_at: null,
        created_at: createdAt,
        server_id: null,
        pending: true,
    };
}

/**
 * Inserts or refreshes a row, keeping the newest `INBOX_MAX_ITEMS` entries.
 *
 * `isSameNotification` is a *business* identity match, so two unrelated notifications
 * of the same type carrying the same business keys would collide. For a push this is
 * exactly what is wanted — a redelivered FCM message must refresh one row rather than
 * stack duplicates — but it means the identity check must not be reached for a row
 * that already carries a server id: those are distinct notifications and are keyed by
 * that id alone.
 */
export function upsertItem(current: PersistedInbox, item: InboxItem): PersistedInbox {
    const withoutItem = current.items.filter(existing => {
        if (existing.id === item.id) {
            return false;
        }

        if (existing.server_id !== null && item.server_id !== null) {
            return existing.server_id !== item.server_id;
        }

        return !isSameNotification(existing, item);
    });

    return {
        ...current,
        items: cap([item, ...withoutItem].sort(byNewestFirst)),
        updatedAt: new Date().toISOString(),
    };
}

/**
 * Marks one row read.
 *
 * Matching is by id *or* by `server_id`, because the notification opened from a system
 * tray tap carries only the id the backend put in the payload.
 */
export function markItemRead(current: PersistedInbox, id: string, readAt: string): PersistedInbox {
    let changed = false;

    const items = current.items.map(item => {
        if (item.id !== id && item.server_id !== id) {
            return item;
        }

        // Idempotent: an already-read row keeps its original timestamp.
        if (item.read_at !== null) {
            return item;
        }

        changed = true;

        return { ...item, read_at: readAt };
    });

    return changed ? { ...current, items, updatedAt: new Date().toISOString() } : current;
}

/** Marks every row read, used by "Mark all read". */
export function markAllItemsRead(current: PersistedInbox, readAt: string): PersistedInbox {
    return {
        ...current,
        items: current.items.map(item => (item.read_at === null ? { ...item, read_at: readAt } : item)),
        updatedAt: new Date().toISOString(),
    };
}

/** Count of unread rows — the tab badge, computed without a network round trip. */
export function countUnread(current: PersistedInbox): number {
    return current.items.reduce((total, item) => (item.read_at === null ? total + 1 : total), 0);
}

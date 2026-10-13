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
    /**
     * The backend `notifications` id this row represents — the **canonical identity**.
     *
     * The backend puts it in the FCM data bag as `notification_id` (see
     * [`FcmMessage`](../staff-sass-last17/app/Notifications/Messages/FcmMessage.php:1)),
     * and a server row carries the same value as its `id`. Because both sources agree on
     * it, a push-materialised row and its server twin collapse to one row regardless of
     * which delivery path produced them.
     *
     * `null` only for a legacy payload that predates the field; those fall back to the
     * business-key match in [`isSameNotification`](src/features/notifications/utils/inboxMerge.ts:1).
     */
    notification_id: string | null;
};

export type PersistedInbox = {
    /** Owner of these rows. A different user's inbox must never be shown. */
    userId: number | null;
    items: InboxItem[];
    /** `false` until the first successful `GET /notifications` for this user. */
    hydrated: boolean;
    updatedAt: string;
    /**
     * High-water mark for server reconciliation.
     *
     * The newest `created_at` this device has observed from the server. On reconnect
     * the client asks for notifications created *after* this instant, so a device that
     * was offline for a week fetches only the gap rather than the whole feed. `null`
     * until the first successful sync, which is the signal to request the first page
     * without a cursor.
     */
    watermark: string | null;
};

/** An inbox owned by nobody, used as the reset value on sign-out. */
export function emptyInbox(): PersistedInbox {
    return {
        userId: null,
        items: [],
        hydrated: false,
        updatedAt: new Date(0).toISOString(),
        watermark: null,
    };
}

/**
 * The newest `created_at` across a set of rows, or `null` when there are none.
 *
 * Used to advance the reconciliation watermark. Invalid dates are ignored rather than
 * poisoning the comparison, so one malformed row cannot pin the cursor in the past.
 */
export function latestCreatedAt(items: readonly { created_at: string }[]): string | null {
    let latest: string | null = null;
    let latestMs = Number.NEGATIVE_INFINITY;

    for (const item of items) {
        const ms = Date.parse(item.created_at);

        if (Number.isNaN(ms)) {
            continue;
        }

        if (ms > latestMs) {
            latestMs = ms;
            latest = item.created_at;
        }
    }

    return latest;
}

/** Returns whichever of two ISO timestamps is newer; `null` loses to any value. */
function newerOf(a: string | null, b: string | null): string | null {
    if (a === null) {
        return b;
    }

    if (b === null) {
        return a;
    }

    return Date.parse(b) > Date.parse(a) ? b : a;
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
            notification_id:
                typeof candidate.notification_id === 'string' ? candidate.notification_id : null,
            pending: candidate.pending === true,
        });
    }

    return {
        userId: typeof raw.userId === 'number' ? raw.userId : null,
        items,
        hydrated: raw.hydrated === true,
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date(0).toISOString(),
        watermark: typeof raw.watermark === 'string' ? raw.watermark : null,
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
/**
 * The business fields of a payload, with transport-only keys removed.
 *
 * Two keys are stripped because they are **not** part of the server row's `data` and
 * would otherwise make the push bag a non-subset of the server bag, defeating the
 * identity match:
 *
 * - `type` — a push-materialised row keeps it inside `data` (the backend puts it there
 *   so a data-only message is self-describing), whereas a server row carries `type` as a
 *   first-class field and omits it from `data`. It is compared separately.
 * - `dedupe_key` — added by the backend's FCM channel at send time
 *   ([`FcmChannel::deliver()`](../staff-sass-last17/app/Notifications/Channels/FcmChannel.php:1))
 *   and never written to the database row. Leaving it in was the reason a push row and
 *   its server twin still failed to match after the subset fix.
 */
function businessData(data: Record<string, unknown>): Record<string, unknown> {
    const rest: Record<string, unknown> = { ...data };

    delete rest.type;
    delete rest.dedupe_key;

    return rest;
}

/**
 * Reads the canonical backend notification id out of a payload.
 *
 * The backend puts it in the FCM data bag as `notification_id`; a server row carries it
 * as `id`. FCM data values are strings on the wire, but a numeric value is accepted too
 * so a payload that serialised the id as a number is not silently treated as legacy.
 */
export function notificationIdFromData(data: Record<string, unknown>): string | null {
    const value = data.notification_id;

    if (typeof value === 'string' && value.length > 0) {
        return value;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
    }

    return null;
}

/**
 * Identity match for two inbox rows.
 *
 * Order matters, and it is deliberate:
 *
 * 1. **Canonical id** — the backend `notification_id` is identical on the push payload
 *    and the server row, so it is the only match guaranteed stable across delivery
 *    paths. This is what makes a redelivered FCM message, a tap, and a later server
 *    sync all resolve to one row.
 * 2. **Cross server id** — a row that knows the other's backend id.
 * 3. **Local id** — the same materialised row.
 * 4. **Business key** — a legacy fallback for a payload without `notification_id`:
 *    same `type` and identical business `data`.
 *
 * Two rows that both carry a `server_id` are distinct notifications even when their
 * business data collides — the id is authoritative, and treating them as one would
 * silently delete a notification.
 */
function isSameNotification(a: InboxItem, b: InboxItem): boolean {
    if (a.notification_id !== null && a.notification_id === b.notification_id) {
        return true;
    }

    if (a.server_id !== null && a.server_id === b.id) {
        return true;
    }

    if (b.server_id !== null && b.server_id === a.id) {
        return true;
    }

    if (a.id === b.id) {
        return true;
    }

    if (a.server_id !== null && b.server_id !== null) {
        return false;
    }

    if (a.type !== b.type) {
        return false;
    }

    /*
     * Business-key match, as a **subset** test.
     *
     * The FCM payload carries only the routing keys (`type` + `shift_id`/`roster_id`/
     * `leave_request_id`), while the server row's `data` is the full `toArray()` bag —
     * a strict superset (it adds `date`, `start_time`, `week_start`, `title`, `body`,
     * …). Requiring identical key counts therefore never matched the two, which is
     * exactly why one event produced two rows: the push row survived and the server
     * row was added beside it.
     *
     * Matching the smaller bag against the larger one is correct by construction: the
     * push payload is always a subset of the server data, and two different events of
     * the same type still differ on their business id (`shift_id`/`roster_id`/…).
     */
    const aData = businessData(a.data);
    const bData = businessData(b.data);
    const [smaller, larger] =
        Object.keys(aData).length <= Object.keys(bData).length ? [aData, bData] : [bData, aData];
    const keys = Object.keys(smaller);

    if (keys.length === 0) {
        return false;
    }

    return keys.every(key => key in larger && String(smaller[key]) === String(larger[key]));
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
        notification_id: item.id,
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

    // A server page can itself contain the same notification twice (a paginated overlap,
    // or a backend that returns one row under two ids). Collapse on the canonical id so
    // the merge cannot introduce a duplicate the server did not mean to send.
    const dedupedServerRows: InboxItem[] = [];

    for (const row of serverRows) {
        if (!dedupedServerRows.some(existing => isSameNotification(existing, row))) {
            dedupedServerRows.push(row);
        }
    }

    return {
        ...current,
        items: cap([...dedupedServerRows, ...survivors].sort(byNewestFirst)),
        hydrated: true,
        updatedAt: new Date().toISOString(),
        // Advance the cursor to the newest row the server has shown us. A page with no
        // rows leaves the existing watermark untouched, so an empty poll cannot rewind
        // the cursor and cause the next sync to re-fetch everything.
        watermark: newerOf(current.watermark, latestCreatedAt(dedupedServerRows)),
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
    const notificationId = notificationIdFromData(data);

    const readData: Record<string, unknown> = { ...data };
    delete readData.title;
    delete readData.body;

    return {
        // The canonical backend id is the row identity whenever the payload carries it,
        // so a push row and its server twin are literally the same key. The caller's
        // `id` is only a fallback for a legacy payload without `notification_id`.
        id: notificationId ?? options.id,
        type: typeof data.type === 'string' ? data.type : 'unknown',
        title: typeof data.title === 'string' ? data.title : 'New notification',
        body: typeof data.body === 'string' ? data.body : '',
        data: readData,
        read_at: null,
        created_at: createdAt,
        // Knowing the backend id means the server already owns this row, so it is not
        // "pending" — it is the same record the next sync will return.
        server_id: notificationId,
        notification_id: notificationId,
        pending: notificationId === null,
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
    const existing = current.items.find(candidate => isSameNotification(candidate, item));

    let next = item;

    if (existing !== undefined) {
        // A push must never downgrade a server-confirmed row. The server is the source
        // of truth, so when a pending push arrives for an event the server already
        // confirmed, the confirmed row wins and the push is absorbed.
        if (existing.server_id !== null && item.server_id === null) {
            next = existing;
        } else if (existing.read_at !== null && item.read_at === null) {
            // A redelivered push must not resurrect a row the user already read: keep
            // the local read when the incoming copy is unread. This is what makes
            // repeated FCM delivery idempotent for read state as well as row count.
            next = { ...item, read_at: existing.read_at };
        }
    }

    const withoutItem = current.items.filter(candidate => !isSameNotification(candidate, next));

    return {
        ...current,
        items: cap([next, ...withoutItem].sort(byNewestFirst)),
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

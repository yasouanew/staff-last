import { create } from 'zustand';

import { STORAGE_KEYS } from '../../../config/storageKeys';
import { getItem, removeItem, setItem } from '../../../utils/storage';
import { logger } from '../../../utils/logger';
import type { AppNotification } from '../types';
import {
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
} from '../utils/inboxMerge';

/**
 * Local notification inbox.
 *
 * ## Why this exists
 *
 * FCM is transport only; the backend `notifications` table is the system of record.
 * Without this store a push is nothing but a cache invalidation, so a device with no
 * connectivity — the common case for a shift worker on a factory floor or in a
 * basement — shows whatever React Query happened to cache last, and a notification
 * that arrives while the app is closed is *lost as content* the moment the tray entry
 * is dismissed.
 *
 * ## What it is not
 *
 * It is **not** a second source of truth. It never decides read state that the server
 * disagrees with once the server is reachable, and it never sends anything. Reads are
 * queued locally and reconciled by [`mergeServerPage`](src/features/notifications/utils/inboxMerge.ts:1),
 * which keeps a local unread->read transition rather than reverting it.
 *
 * ## Persistence
 *
 * The whole inbox is one AsyncStorage key, following the same conventions as
 * [`storageKeys.ts`](src/config/storageKeys.ts:1): a namespaced, version-suffixed key
 * whose payload is defensively parsed so a future shape change degrades to an empty
 * inbox rather than a crash.
 */

type InboxState = {
    items: InboxItem[];
    hydrated: boolean;
    /** Owner of the current rows; `null` before the first sync. */
    userId: number | null;
    /** True once a server sync has succeeded at least once this session. */
    synced: boolean;
    /** Loads the persisted inbox from disk. Safe to call repeatedly. */
    hydrate: (userId: number | null) => Promise<void>;
    /** Replaces/merges the inbox with a server page. */
    mergeFromServer: (userId: number, items: AppNotification[], replace?: boolean) => Promise<void>;
    /** Records a notification delivered by push while the app was running. */
    receivePush: (data: Record<string, unknown>, id: string) => Promise<void>;
    /** Marks one notification read locally. */
    markRead: (id: string) => Promise<void>;
    /** Marks everything read locally. */
    markAllRead: () => Promise<void>;
    /** Clears the inbox, e.g. on sign-out. */
    reset: () => Promise<void>;
};

function persist(state: PersistedInbox): void {
    // Fire-and-forget: a storage failure must never roll back the in-memory state,
    // which is what the UI is rendering from.
    void setItem(STORAGE_KEYS.notificationInbox, state);
}

function toPersisted(state: InboxState): PersistedInbox {
    return {
        userId: state.userId,
        items: state.items,
        hydrated: state.hydrated,
        updatedAt: new Date().toISOString(),
    };
}

export const useNotificationInboxStore = create<InboxState>((set, get) => ({
    items: [],
    hydrated: false,
    userId: null,
    synced: false,

    hydrate: async userId => {
        const stored = deserializeInbox(await getItem<unknown>(STORAGE_KEYS.notificationInbox));

        // A persisted inbox belonging to somebody else is discarded outright — devices
        // are shared in this domain, and showing the previous user's shift changes to
        // the next one would be a data leak.
        if (stored.userId !== null && userId !== null && stored.userId !== userId) {
            logger.info('[inbox] Discarding inbox owned by another user');

            await removeItem(STORAGE_KEYS.notificationInbox);
            set({ items: [], hydrated: false, userId, synced: false });

            return;
        }

        set({
            items: stored.items,
            hydrated: stored.hydrated,
            userId: userId ?? stored.userId,
            synced: false,
        });
    },

    mergeFromServer: async (userId, items, replace = false) => {
        const current = toPersisted(get());
        const next = mergeServerPage({ ...current, userId }, items, { replace });

        set({ items: next.items, hydrated: next.hydrated, userId, synced: true });
        persist(next);
    },

    receivePush: async (data, id) => {
        const current = toPersisted(get());
        const next = upsertItem(current, fromPushPayload(data, { id }));

        set({ items: next.items, userId: current.userId });
        persist(next);
    },

    markRead: async id => {
        const current = toPersisted(get());
        const next = markItemRead(current, id, new Date().toISOString());

        if (next === current) {
            return;
        }

        set({ items: next.items });
        persist(next);
    },

    markAllRead: async () => {
        const current = toPersisted(get());
        const next = markAllItemsRead(current, new Date().toISOString());

        set({ items: next.items });
        persist(next);
    },

    reset: async () => {
        const next = emptyInbox();

        set({ items: [], hydrated: false, userId: null, synced: false });
        await removeItem(STORAGE_KEYS.notificationInbox);
        persist(next);
    },
}));

/** Unread count for the tab badge, derived from the local inbox. */
export function selectUnreadCount(state: InboxState): number {
    return countUnread(toPersisted(state));
}

/** True when the local inbox has rows but no successful sync has happened yet. */
export function selectIsOfflineOnly(state: InboxState): boolean {
    return state.items.length > 0 && !state.synced;
}

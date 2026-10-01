import { create } from 'zustand';

import { STORAGE_KEYS } from '../../config/storageKeys';
import { getItem, removeItem, setItem } from '../../utils/storage';
import { logger } from '../../utils/logger';

/**
 * Durable outbox.
 *
 * A single, persisted queue of writes that could not reach the server. It exists
 * because several operations in this app are performed against a *cached* session and
 * would otherwise silently imply success: a "read" tap, a leave submission, an
 * availability save. The rule this store enforces is simple — **a write is only
 * reported as done once it has actually left the device**, or it is visibly queued.
 *
 * ## Guarantees
 *
 * | Concern | How it is handled |
 * |---|---|
 * | **Durability** | Persisted to AsyncStorage on every mutation, so a queued write survives a process death and is retried on the next launch. |
 * | **Deduplication** | Each entry has a stable `id` derived from the operation and its natural key (e.g. `notification.read:<uuid>`). Enqueuing the same operation twice replaces the existing entry rather than stacking. |
 * | **Retries** | Retryable failures get exponential backoff (`nextAttemptAt`). |
 * | **Dead-letter** | Non-retryable failures (4xx that a retry cannot fix) stop being retried and are surfaced to the user as failed. |
 * | **Conflict / ordering** | Single-flight flush in [`syncOutbox`](src/services/outbox/syncOutbox.ts:1); entries are processed oldest-first, and a 401 aborts the flush. |
 * | **Shared devices** | The queue is stamped with the owning `userId`; another user's queue is discarded on hydrate. |
 *
 * See [`docs/mutation-policy.md`](docs/mutation-policy.md:1) for the per-operation
 * policy this implements.
 */

/** The set of operations the outbox knows how to replay. */
export type OutboxKind =
    | 'notification.read'
    | 'notification.read-all'
    | 'availability.sync'
    | 'push.register'
    | 'push.unregister';

export type OutboxEntryStatus = 'pending' | 'failed';

export type OutboxEntry = {
    /** Stable dedupe key: `${kind}:${naturalKey}`. */
    id: string;
    kind: OutboxKind;
    /** JSON-serialisable arguments handed to the kind's handler on replay. */
    payload: Record<string, unknown>;
    /** Owner. A queue belonging to another user is discarded on hydrate. */
    userId: number | null;
    createdAt: string;
    updatedAt: string;
    /** How many times a replay has been attempted. */
    attempts: number;
    /**
     * `pending` — will be retried (subject to `nextAttemptAt`).
     * `failed` — dead-lettered: a retry cannot fix it, so it waits for the user.
     */
    status: OutboxEntryStatus;
    lastError: string | null;
    /** Epoch ms before which a replay must not be attempted. `0` = ready now. */
    nextAttemptAt: number;
};

/** Backoff schedule (ms) indexed by attempt count; the last value is the cap. */
const BACKOFF_MS = [0, 5_000, 15_000, 60_000, 300_000, 900_000];

/** After this many automatic attempts a retryable failure is dead-lettered too. */
const MAX_AUTO_ATTEMPTS = 5;

/** Hard cap so one pathological loop cannot grow the persisted blob unbounded. */
export const OUTBOX_MAX_ENTRIES = 200;

/** Backoff delay for the *next* attempt after `attempts` failures. */
export function backoffFor(attempts: number): number {
    const index = Math.min(Math.max(attempts, 0), BACKOFF_MS.length - 1);

    return BACKOFF_MS[index] ?? BACKOFF_MS[BACKOFF_MS.length - 1] ?? 0;
}

type PersistedOutbox = {
    version: 1;
    userId: number | null;
    entries: OutboxEntry[];
};

export type EnqueueInput = {
    kind: OutboxKind;
    payload: Record<string, unknown>;
    /** Natural key for dedupe, e.g. a notification id. Defaults to the kind. */
    naturalKey?: string;
    userId: number | null;
};

/** Builds the stable id used for dedupe. Exported for tests. */
export function outboxEntryId(kind: OutboxKind, naturalKey?: string): string {
    return `${kind}:${naturalKey ?? 'default'}`;
}

type OutboxState = {
    entries: OutboxEntry[];
    hydrated: boolean;
    /** True while a flush is in progress — drives the banner's "syncing" copy. */
    isFlushing: boolean;

    /** Loads the persisted queue, discarding it if it belongs to another user. */
    hydrate: (userId: number | null) => Promise<void>;
    /** Adds or replaces an entry (dedupe by id). */
    enqueue: (input: EnqueueInput) => Promise<void>;
    /** Records a failed attempt, applying backoff or dead-lettering. */
    markFailed: (id: string, error: string, retryable: boolean) => Promise<void>;
    /** Removes an entry — used after a successful replay. */
    remove: (id: string) => Promise<void>;
    /** Empties the queue (sign-out). */
    clear: () => Promise<void>;
    /** Re-arms a dead-lettered entry for an immediate retry (user "Retry"). */
    retry: (id: string) => Promise<void>;
    setFlushing: (isFlushing: boolean) => void;
};

function persist(state: { userId: number | null; entries: OutboxEntry[] }): void {
    const payload: PersistedOutbox = { version: 1, userId: state.userId, entries: state.entries };

    // Fire-and-forget: a storage failure must not roll back in-memory state.
    void setItem(STORAGE_KEYS.outbox, payload);
}

/** Derives the owner from the entries themselves (they are all stamped). */
function ownerOf(entries: OutboxEntry[]): number | null {
    return entries[0]?.userId ?? null;
}

export const useOutboxStore = create<OutboxState>((set, get) => ({
    entries: [],
    hydrated: false,
    isFlushing: false,

    hydrate: async userId => {
        const stored = await getItem<PersistedOutbox>(STORAGE_KEYS.outbox);

        // A queue owned by somebody else is discarded outright — devices are shared
        // in this domain, and replaying a previous user's write under a new session
        // would be both wrong and a data leak.
        if (stored !== null && stored.userId !== null && userId !== null && stored.userId !== userId) {
            logger.info('[outbox] Discarding queue owned by another user');

            await removeItem(STORAGE_KEYS.outbox);
            set({ entries: [], hydrated: true });

            return;
        }

        set({ entries: stored?.entries ?? [], hydrated: true });
    },

    enqueue: async input => {
        const id = outboxEntryId(input.kind, input.naturalKey);
        const now = new Date().toISOString();

        const next: OutboxEntry = {
            id,
            kind: input.kind,
            payload: input.payload,
            userId: input.userId,
            createdAt: now,
            updatedAt: now,
            attempts: 0,
            status: 'pending',
            lastError: null,
            nextAttemptAt: 0,
        };

        const existing = get().entries;
        const withoutDuplicate = existing.filter(entry => entry.id !== id);

        // Preserve the original createdAt when replacing, so ordering stays stable.
        const merged: OutboxEntry[] = [
            ...withoutDuplicate,
            { ...next, createdAt: existing.find(entry => entry.id === id)?.createdAt ?? now },
        ];

        // Oldest-first, capped: dropping the oldest is the least-bad overflow policy
        // because those are the writes most likely to be stale anyway.
        const capped = merged.slice(-OUTBOX_MAX_ENTRIES);

        set({ entries: capped });
        persist({ userId: input.userId, entries: capped });
    },

    markFailed: async (id, error, retryable) => {
        const entries = get().entries.map(entry => {
            if (entry.id !== id) {
                return entry;
            }

            const attempts = entry.attempts + 1;
            const deadLetter = !retryable || attempts >= MAX_AUTO_ATTEMPTS;

            return {
                ...entry,
                attempts,
                status: deadLetter ? ('failed' as const) : ('pending' as const),
                lastError: error,
                updatedAt: new Date().toISOString(),
                // A dead-lettered entry is not retried automatically; it waits for the
                // user. `Number.MAX_SAFE_INTEGER` makes that explicit in the data.
                nextAttemptAt: deadLetter ? Number.MAX_SAFE_INTEGER : Date.now() + backoffFor(attempts),
            };
        });

        set({ entries });
        persist({ userId: ownerOf(entries), entries });
    },

    remove: async id => {
        const entries = get().entries.filter(entry => entry.id !== id);

        set({ entries });
        persist({ userId: ownerOf(entries), entries });
    },

    clear: async () => {
        set({ entries: [], isFlushing: false });
        await removeItem(STORAGE_KEYS.outbox);
    },

    retry: async id => {
        const entries = get().entries.map(entry =>
            entry.id === id
                ? { ...entry, status: 'pending' as const, nextAttemptAt: 0, updatedAt: new Date().toISOString() }
                : entry,
        );

        set({ entries });
        persist({ userId: ownerOf(entries), entries });
    },

    setFlushing: isFlushing => set({ isFlushing }),
}));

/** Entries that are due to be replayed now, oldest first. */
export function selectReadyEntries(entries: OutboxEntry[], now: number = Date.now()): OutboxEntry[] {
    return entries
        .filter(entry => entry.nextAttemptAt <= now)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export type OutboxSummary = {
    /** Entries still awaiting a successful replay. */
    pendingCount: number;
    /** Entries a retry cannot fix — shown as failed to the user. */
    failedCount: number;
    total: number;
};

/** Counts for the status banner. Pure, so it is unit-testable. */
export function selectOutboxSummary(entries: OutboxEntry[]): OutboxSummary {
    const failedCount = entries.filter(entry => entry.status === 'failed').length;

    return {
        pendingCount: entries.length - failedCount,
        failedCount,
        total: entries.length,
    };
}

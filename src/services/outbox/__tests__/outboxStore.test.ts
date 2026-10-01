import AsyncStorage from '@react-native-async-storage/async-storage';

import { STORAGE_KEYS } from '../../../config/storageKeys';
import {
    backoffFor,
    outboxEntryId,
    selectOutboxSummary,
    selectReadyEntries,
    useOutboxStore,
    type OutboxEntry,
} from '../outboxStore';

/**
 * The outbox is the mechanism that makes deferred writes durable. These tests pin the
 * properties that make that claim true — persistence, dedupe, backoff, dead-lettering,
 * and cross-user isolation — because a regression here would silently drop a user's
 * change while the UI implied it was saved.
 */

const USER = 7;

function entry(overrides: Partial<OutboxEntry> = {}): OutboxEntry {
    return {
        id: 'notification.read:n1',
        kind: 'notification.read',
        payload: { id: 'n1' },
        userId: USER,
        createdAt: '2026-09-24T00:00:00.000Z',
        updatedAt: '2026-09-24T00:00:00.000Z',
        attempts: 0,
        status: 'pending',
        lastError: null,
        nextAttemptAt: 0,
        ...overrides,
    };
}

describe('outboxStore', () => {
    beforeEach(async () => {
        jest.clearAllMocks();
        await AsyncStorage.clear();
        useOutboxStore.setState({ entries: [], hydrated: false, isFlushing: false });
    });

    describe('enqueue', () => {
        it('adds an entry and persists it to storage', async () => {
            await useOutboxStore.getState().enqueue({
                kind: 'notification.read',
                naturalKey: 'n1',
                payload: { id: 'n1' },
                userId: USER,
            });

            expect(useOutboxStore.getState().entries).toHaveLength(1);

            const raw = await AsyncStorage.getItem(STORAGE_KEYS.outbox);

            expect(raw).not.toBeNull();
            expect(JSON.parse(raw as string).entries).toHaveLength(1);
        });

        it('deduplicates by kind + natural key, replacing rather than stacking', async () => {
            await useOutboxStore.getState().enqueue({
                kind: 'availability.sync',
                naturalKey: '9',
                payload: { employeeId: 9, week: 'A' },
                userId: USER,
            });
            await useOutboxStore.getState().enqueue({
                kind: 'availability.sync',
                naturalKey: '9',
                payload: { employeeId: 9, week: 'B' },
                userId: USER,
            });

            const { entries } = useOutboxStore.getState();

            expect(entries).toHaveLength(1);
            expect(entries[0]?.payload.week).toBe('B');
        });

        it('builds a stable id from the kind and natural key', () => {
            expect(outboxEntryId('notification.read', 'abc')).toBe('notification.read:abc');
            expect(outboxEntryId('notification.read-all')).toBe('notification.read-all:default');
        });
    });

    describe('markFailed', () => {
        it('applies backoff and keeps a retryable entry pending', async () => {
            await useOutboxStore.getState().enqueue({
                kind: 'notification.read',
                naturalKey: 'n1',
                payload: { id: 'n1' },
                userId: USER,
            });

            const id = outboxEntryId('notification.read', 'n1');

            await useOutboxStore.getState().markFailed(id, 'offline', true);

            const failed = useOutboxStore.getState().entries[0];

            expect(failed?.status).toBe('pending');
            expect(failed?.attempts).toBe(1);
            expect(failed?.nextAttemptAt).toBeGreaterThan(Date.now());
        });

        it('dead-letters a non-retryable failure', async () => {
            await useOutboxStore.getState().enqueue({
                kind: 'availability.sync',
                naturalKey: '9',
                payload: {},
                userId: USER,
            });

            const id = outboxEntryId('availability.sync', '9');

            await useOutboxStore.getState().markFailed(id, 'Forbidden', false);

            expect(useOutboxStore.getState().entries[0]?.status).toBe('failed');
        });

        it('dead-letters after the maximum number of automatic attempts', async () => {
            await useOutboxStore.getState().enqueue({
                kind: 'notification.read',
                naturalKey: 'n1',
                payload: { id: 'n1' },
                userId: USER,
            });

            const id = outboxEntryId('notification.read', 'n1');

            for (let i = 0; i < 5; i += 1) {
                await useOutboxStore.getState().markFailed(id, 'offline', true);
            }

            expect(useOutboxStore.getState().entries[0]?.status).toBe('failed');
        });
    });

    it('re-arms a dead-lettered entry on retry', async () => {
        useOutboxStore.setState({ entries: [entry({ status: 'failed', nextAttemptAt: Number.MAX_SAFE_INTEGER })] });

        await useOutboxStore.getState().retry('notification.read:n1');

        const rearmed = useOutboxStore.getState().entries[0];

        expect(rearmed?.status).toBe('pending');
        expect(rearmed?.nextAttemptAt).toBe(0);
    });

    it('clears the queue and its persisted copy', async () => {
        await useOutboxStore.getState().enqueue({
            kind: 'notification.read',
            naturalKey: 'n1',
            payload: { id: 'n1' },
            userId: USER,
        });

        await useOutboxStore.getState().clear();

        expect(useOutboxStore.getState().entries).toHaveLength(0);
        await expect(AsyncStorage.getItem(STORAGE_KEYS.outbox)).resolves.toBeNull();
    });

    describe('hydrate', () => {
        it('restores a persisted queue for the same user', async () => {
            useOutboxStore.setState({ entries: [entry()] });
            await AsyncStorage.setItem(
                STORAGE_KEYS.outbox,
                JSON.stringify({ version: 1, userId: USER, entries: [entry()] }),
            );
            useOutboxStore.setState({ entries: [] });

            await useOutboxStore.getState().hydrate(USER);

            expect(useOutboxStore.getState().entries).toHaveLength(1);
            expect(useOutboxStore.getState().hydrated).toBe(true);
        });

        it("discards another user's queue (shared-device safety)", async () => {
            await AsyncStorage.setItem(
                STORAGE_KEYS.outbox,
                JSON.stringify({ version: 1, userId: 99, entries: [entry({ userId: 99 })] }),
            );

            await useOutboxStore.getState().hydrate(USER);

            expect(useOutboxStore.getState().entries).toHaveLength(0);
            await expect(AsyncStorage.getItem(STORAGE_KEYS.outbox)).resolves.toBeNull();
        });
    });

    describe('selectors', () => {
        it('returns only entries whose backoff has elapsed, oldest first', () => {
            const now = Date.now();
            const ready = selectReadyEntries(
                [
                    entry({ id: 'b', createdAt: '2026-09-24T00:00:02.000Z', nextAttemptAt: now - 1 }),
                    entry({ id: 'a', createdAt: '2026-09-24T00:00:01.000Z', nextAttemptAt: 0 }),
                    entry({ id: 'c', createdAt: '2026-09-24T00:00:03.000Z', nextAttemptAt: now + 10_000 }),
                ],
                now,
            );

            expect(ready.map(item => item.id)).toEqual(['a', 'b']);
        });

        it('summarises pending vs failed counts', () => {
            const summary = selectOutboxSummary([
                entry({ id: 'a', status: 'pending' }),
                entry({ id: 'b', status: 'failed' }),
                entry({ id: 'c', status: 'pending' }),
            ]);

            expect(summary).toEqual({ pendingCount: 2, failedCount: 1, total: 3 });
        });
    });

    it('computes an increasing, capped backoff', () => {
        expect(backoffFor(0)).toBe(0);
        expect(backoffFor(1)).toBe(5000);
        expect(backoffFor(3)).toBe(60_000);
        // Beyond the schedule, the cap holds rather than returning undefined.
        expect(backoffFor(50)).toBe(900_000);
    });
});

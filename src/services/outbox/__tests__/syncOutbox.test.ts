import { useSessionStore } from '../../../features/auth/store/sessionStore';
import { outboxHandlers } from '../outboxHandlers';
import { outboxEntryId, useOutboxStore } from '../outboxStore';
import { syncOutbox } from '../syncOutbox';

/**
 * The flush runner enforces two rules that are easy to get wrong:
 *
 * 1. it only runs against a **server-validated** session (never replay a write while
 *    offline), and
 * 2. it is **single-flight**, so concurrent triggers cannot send the same entry twice.
 *
 * The handlers are mocked so the tests assert queue mechanics, not HTTP.
 */

jest.mock('../outboxHandlers', () => ({
    outboxHandlers: {
        'notification.read': jest.fn(),
        'notification.read-all': jest.fn(),
        'availability.sync': jest.fn(),
        'push.register': jest.fn(),
    },
}));

const mockedRead = outboxHandlers['notification.read'] as jest.MockedFunction<
    (typeof outboxHandlers)['notification.read']
>;

const USER = 7;

function seedEntry(kind: 'notification.read' | 'availability.sync' = 'notification.read'): string {
    const id = outboxEntryId(kind, kind === 'notification.read' ? 'n1' : '9');

    useOutboxStore.setState({
        entries: [
            {
                id,
                kind,
                payload: { id: 'n1', employeeId: 9, payload: {} },
                userId: USER,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                attempts: 0,
                status: 'pending',
                lastError: null,
                nextAttemptAt: 0,
            },
        ],
        hydrated: true,
        isFlushing: false,
    });

    return id;
}

describe('syncOutbox', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockedRead.mockResolvedValue(undefined);
        useOutboxStore.setState({ entries: [], hydrated: false, isFlushing: false });
    });

    it('does nothing while the session is not validated (offline)', async () => {
        seedEntry();
        useSessionStore.setState({ status: 'authenticated-offline' });

        const flushed = await syncOutbox();

        expect(flushed).toBe(0);
        expect(mockedRead).not.toHaveBeenCalled();
        // The entry is retained for a later, validated flush.
        expect(useOutboxStore.getState().entries).toHaveLength(1);
    });

    it('replays and removes entries when the session is validated', async () => {
        const id = seedEntry();
        useSessionStore.setState({ status: 'authenticated-online' });

        const flushed = await syncOutbox();

        expect(flushed).toBe(1);
        expect(mockedRead).toHaveBeenCalledTimes(1);
        expect(useOutboxStore.getState().entries.find(entry => entry.id === id)).toBeUndefined();
    });

    it('backs off a retryable failure instead of dropping the entry', async () => {
        const id = seedEntry();
        useSessionStore.setState({ status: 'authenticated-online' });
        mockedRead.mockRejectedValueOnce({ kind: 'network', message: 'offline' });

        await syncOutbox();

        const entry = useOutboxStore.getState().entries.find(item => item.id === id);

        expect(entry?.status).toBe('pending');
        expect(entry?.attempts).toBe(1);
    });

    it('dead-letters a non-retryable failure so it can be surfaced to the user', async () => {
        const id = seedEntry();
        useSessionStore.setState({ status: 'authenticated-online' });
        mockedRead.mockRejectedValueOnce({ kind: 'validation', status: 422, message: 'Rejected' });

        await syncOutbox();

        expect(useOutboxStore.getState().entries.find(item => item.id === id)?.status).toBe('failed');
    });

    it('stops the flush on a 401 and leaves the remaining entries queued', async () => {
        seedEntry();
        useSessionStore.setState({ status: 'authenticated-online' });
        mockedRead.mockRejectedValueOnce({ kind: 'unauthorized', status: 401, message: 'Session expired' });

        await syncOutbox();

        // Nothing was removed — the session is dead, so replay is deferred to the next
        // login rather than discarded.
        expect(useOutboxStore.getState().entries).toHaveLength(1);
    });

    it('is single-flight: concurrent calls do not double-send an entry', async () => {
        seedEntry();
        useSessionStore.setState({ status: 'authenticated-online' });

        let release: () => void = () => undefined;
        mockedRead.mockImplementationOnce(
            () =>
                new Promise<void>(resolve => {
                    release = resolve;
                }),
        );

        const first = syncOutbox();
        const second = syncOutbox();

        release();
        await Promise.all([first, second]);

        expect(mockedRead).toHaveBeenCalledTimes(1);
    });
});

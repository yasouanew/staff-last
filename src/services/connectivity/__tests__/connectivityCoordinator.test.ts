import { startConnectivityCoordinator } from '../connectivityCoordinator';
import { useConnectivityStore } from '../connectivityStore';
import { runRecoveryPipeline } from '../recoveryPipeline';

/**
 * The test-only helpers live on the Jest mock file, not on the real package's public
 * types. It is required by its **path** rather than through `jest.requireMock`, because
 * `moduleNameMapper` already points the package specifier at this exact file — so the
 * coordinator's import and this require resolve to the same cached module instance, and
 * an emitted state reaches the listener the coordinator registered.
 */
const { __emitNetInfoState, __resetNetInfo } = require('../../../../jest/netinfo.mock') as {
    __emitNetInfoState: (state: Record<string, unknown>) => void;
    __resetNetInfo: () => void;
};

/**
 * Connectivity coordinator.
 *
 * The behaviour under test is the one the AppState-only retry could not provide: an
 * offline → online edge while the app stays in the foreground must trigger recovery,
 * debounced, and only once per transition.
 */

jest.mock('../recoveryPipeline', () => ({
    runRecoveryPipeline: jest.fn(async () => ({
        sessionRefreshed: true,
        outboxFlushed: 0,
        notificationsMerged: 0,
    })),
}));

const mockedRun = runRecoveryPipeline as jest.MockedFunction<typeof runRecoveryPipeline>;

const OFFLINE = { isConnected: false, isInternetReachable: false };
const ONLINE = { isConnected: true, isInternetReachable: true };

describe('startConnectivityCoordinator', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.clearAllMocks();
        __resetNetInfo();
        useConnectivityStore.getState().reset();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('runs recovery after an offline → online edge, once the debounce elapses', async () => {
        const onRecovered = jest.fn();
        const stop = startConnectivityCoordinator({ onRecovered, debounceMs: 1_000 });

        __emitNetInfoState(OFFLINE);
        __emitNetInfoState(ONLINE);

        // Not yet: the connection must be stably online first.
        expect(mockedRun).not.toHaveBeenCalled();

        await jest.advanceTimersByTimeAsync(1_000);

        expect(mockedRun).toHaveBeenCalledTimes(1);
        expect(onRecovered).toHaveBeenCalledTimes(1);

        stop();
    });

    it('does not recover when the app was already online (no transition)', async () => {
        const stop = startConnectivityCoordinator({ debounceMs: 1_000 });

        // The store defaults to online, so a first "online" emission is not an edge.
        __emitNetInfoState(ONLINE);

        await jest.advanceTimersByTimeAsync(1_000);

        expect(mockedRun).not.toHaveBeenCalled();

        stop();
    });

    it('cancels a pending recovery when the connection drops again before the debounce', async () => {
        const stop = startConnectivityCoordinator({ debounceMs: 1_000 });

        __emitNetInfoState(OFFLINE);
        __emitNetInfoState(ONLINE);
        // Flap back offline before the debounce fires.
        __emitNetInfoState(OFFLINE);

        await jest.advanceTimersByTimeAsync(1_000);

        expect(mockedRun).not.toHaveBeenCalled();

        stop();
    });

    it('tracks the online flag in the store', () => {
        const stop = startConnectivityCoordinator({ debounceMs: 1_000 });

        __emitNetInfoState(OFFLINE);
        expect(useConnectivityStore.getState().isOnline).toBe(false);

        __emitNetInfoState(ONLINE);
        expect(useConnectivityStore.getState().isOnline).toBe(true);

        stop();
    });

    it('stops reacting after the returned function is called', async () => {
        const stop = startConnectivityCoordinator({ debounceMs: 1_000 });

        stop();

        __emitNetInfoState(OFFLINE);
        __emitNetInfoState(ONLINE);

        await jest.advanceTimersByTimeAsync(1_000);

        expect(mockedRun).not.toHaveBeenCalled();
    });
});

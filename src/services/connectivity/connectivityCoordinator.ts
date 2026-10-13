import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

import { logger } from '../../utils/logger';
import { useConnectivityStore } from './connectivityStore';
import { runRecoveryPipeline, type RecoveryResult } from './recoveryPipeline';

/**
 * Connectivity coordinator.
 *
 * ## The gap this closes
 *
 * The app previously retried only when `AppState` became `active`. That misses the
 * common case of a device that stays in the foreground while the network drops and
 * comes back — a lift, a tunnel, a flaky factory-floor Wi-Fi. Nothing re-registered the
 * push token, flushed the outbox, or reconciled the inbox, because no foreground event
 * ever fired.
 *
 * This coordinator subscribes to the OS network state and reacts to the **offline →
 * online edge** specifically, not to every state change.
 *
 * ## Debounce
 *
 * NetInfo emits a burst of states while a connection settles (Wi-Fi associating, then
 * DHCP, then reachability). Running the pipeline on the first `isConnected: true` would
 * fire against a half-up network and fail. The transition is therefore debounced: the
 * pipeline runs only after the connection has been stably online for
 * [`RECOVERY_DEBOUNCE_MS`](src/services/connectivity/connectivityCoordinator.ts:1).
 *
 * ## Single-flight with re-arm
 *
 * Only one recovery runs at a time. If another offline → online edge occurs while a run
 * is in flight, a follow-up run is scheduled rather than dropped, so a flapping
 * connection still converges.
 */

/** How long the connection must be stably online before recovery runs. */
export const RECOVERY_DEBOUNCE_MS = 1_500;

export type ConnectivityCoordinatorOptions = {
    /**
     * Invoked after a recovery run completes. The app uses this to invalidate the React
     * Query keys a replayed write or a merged notification could have changed. Kept as a
     * callback so this module never imports the query client.
     */
    onRecovered?: (result: RecoveryResult) => void;
    /** Overridable for tests. */
    debounceMs?: number;
};

/**
 * True when the OS reports a usable connection.
 *
 * `isInternetReachable` is `null` while the OS is still probing, so it is treated as
 * reachable when `isConnected` is true — otherwise a device that is genuinely online
 * would be considered offline for the first few hundred milliseconds of every launch.
 */
export function isStateOnline(state: NetInfoState): boolean {
    if (state.isConnected !== true) {
        return false;
    }

    return state.isInternetReachable !== false;
}

/**
 * Starts the coordinator. Returns a stop function.
 *
 * Safe to call once per app launch; the caller (a root-level hook) owns the lifecycle.
 */
export function startConnectivityCoordinator(
    options: ConnectivityCoordinatorOptions = {},
): () => void {
    const debounceMs = options.debounceMs ?? RECOVERY_DEBOUNCE_MS;

    // Seeded from the store's optimistic default so the first NetInfo emission does not
    // look like a transition and trigger a spurious recovery on launch.
    let wasOnline = useConnectivityStore.getState().isOnline;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let running = false;
    let rerunRequested = false;
    let stopped = false;

    const clearDebounce = (): void => {
        if (debounceTimer !== null) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
        }
    };

    const runRecovery = async (): Promise<void> => {
        if (stopped) {
            return;
        }

        if (running) {
            // A run is already in flight; make sure another follows it.
            rerunRequested = true;

            return;
        }

        running = true;
        useConnectivityStore.getState().setRecovering(true);

        try {
            const result = await runRecoveryPipeline();

            useConnectivityStore.getState().markRecovered();

            logger.info(
                `[connectivity] Recovery complete: session=${result.sessionRefreshed} ` +
                `outbox=${result.outboxFlushed} notifications=${result.notificationsMerged}`,
            );

            options.onRecovered?.(result);
        } catch (error) {
            // `runRecoveryPipeline` never throws, but a bug in a callback must not wedge
            // the coordinator in a permanent "recovering" state.
            logger.warn('[connectivity] Recovery run threw unexpectedly', error);
        } finally {
            running = false;
            useConnectivityStore.getState().setRecovering(false);

            if (rerunRequested && !stopped) {
                rerunRequested = false;
                void runRecovery();
            }
        }
    };

    const handleState = (state: NetInfoState): void => {
        const online = isStateOnline(state);

        useConnectivityStore.getState().setOnline(online);

        if (!online) {
            // Going offline cancels any pending recovery: the connection is not there.
            clearDebounce();
            wasOnline = false;

            return;
        }

        if (wasOnline) {
            // Already online — a reachability flap within an established connection is
            // not a recovery trigger.
            return;
        }

        wasOnline = true;

        // Debounce: wait for the connection to be stably online before recovering.
        clearDebounce();
        debounceTimer = setTimeout(() => {
            debounceTimer = null;
            void runRecovery();
        }, debounceMs);
    };

    const unsubscribe = NetInfo.addEventListener(handleState);

    return () => {
        stopped = true;
        clearDebounce();
        unsubscribe();
    };
}

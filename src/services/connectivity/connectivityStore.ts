import { create } from 'zustand';

/**
 * Connectivity state.
 *
 * A small, observable record of the device's network reachability and the recovery
 * pipeline's progress. It exists so UI (a banner, a settings row) can react to
 * "offline" and "recovering" without subscribing to NetInfo directly, and so the
 * coordinator's behaviour is inspectable in tests.
 *
 * It is deliberately **not** the source of truth for the session's trust level — that
 * is [`useSessionStore`](../../features/auth/store/sessionStore.ts:1). This store only
 * answers "does the OS think we have a usable connection right now".
 */

type ConnectivityState = {
    /** True when the OS reports a connection with internet reachability. */
    isOnline: boolean;
    /** True while the recovery pipeline is running after a reconnect. */
    isRecovering: boolean;
    /** ISO timestamp of the most recent offline → online transition. */
    lastOnlineAt: string | null;
    /** ISO timestamp of the most recent completed recovery run. */
    lastRecoveredAt: string | null;

    setOnline: (online: boolean) => void;
    setRecovering: (recovering: boolean) => void;
    /** Records a completed recovery run. */
    markRecovered: () => void;
    /** Restores the initial state (sign-out, tests). */
    reset: () => void;
};

const INITIAL = {
    // Assume online until NetInfo says otherwise: the app boots and immediately makes
    // requests, and a pessimistic default would flash an offline banner on every launch.
    isOnline: true,
    isRecovering: false,
    lastOnlineAt: null,
    lastRecoveredAt: null,
} as const;

export const useConnectivityStore = create<ConnectivityState>(set => ({
    ...INITIAL,

    setOnline: online =>
        set(state => {
            if (state.isOnline === online) {
                return state;
            }

            return {
                isOnline: online,
                lastOnlineAt: online ? new Date().toISOString() : state.lastOnlineAt,
            };
        }),

    setRecovering: recovering => set({ isRecovering: recovering }),

    markRecovered: () => set({ lastRecoveredAt: new Date().toISOString() }),

    reset: () => set({ ...INITIAL }),
}));

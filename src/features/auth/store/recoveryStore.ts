import { create } from 'zustand';

/**
 * Transient state for the password-recovery flow.
 *
 * This exists for one reason: the Forgot screen learns the address the user typed, and
 * the Reset screen needs it prefilled so the user does not have to remember and retype
 * it. Route params are the wrong channel for that — they would persist in the
 * navigation state and be re-applied if the user later opened Reset from a different
 * entry point with a different address.
 *
 * It is deliberately **in-memory only** and single-use: `consume()` reads and clears in
 * one step, so a stale address can never leak into an unrelated reset attempt. Nothing
 * here is persisted, so a cold start simply means "no prefill", which is safe.
 *
 * Scope note: an email address is not a secret (it is already on the login screen), but
 * the *token* is — it is never stored here, only passed through navigation params.
 */

type RecoveryState = {
    /** Address entered on the Forgot screen, awaiting prefill on Reset. */
    pendingEmail: string | null;
    /** Marks the address as submitted so Reset can explain the prefill. */
    requestedAt: number | null;

    /** Records the address a reset was requested for. */
    setPendingEmail: (email: string) => void;
    /** Reads and clears the pending address in a single step. */
    consumePendingEmail: () => string | null;
    /** Clears everything — called when the flow completes or is abandoned. */
    reset: () => void;
};

export const useRecoveryStore = create<RecoveryState>((set, get) => ({
    pendingEmail: null,
    requestedAt: null,

    setPendingEmail: (email) => {
        const normalized = email.trim();

        set({
            pendingEmail: normalized.length > 0 ? normalized : null,
            requestedAt: normalized.length > 0 ? Date.now() : null,
        });
    },

    consumePendingEmail: () => {
        const { pendingEmail } = get();

        if (pendingEmail !== null) {
            set({ pendingEmail: null, requestedAt: null });
        }

        return pendingEmail;
    },

    reset: () => set({ pendingEmail: null, requestedAt: null }),
}));

/** Non-React accessors, for consistency with `sessionActions`. */
export const recoveryActions = {
    getState: () => useRecoveryStore.getState(),
    setPendingEmail: (email: string) => useRecoveryStore.getState().setPendingEmail(email),
    consumePendingEmail: () => useRecoveryStore.getState().consumePendingEmail(),
    reset: () => useRecoveryStore.getState().reset(),
};

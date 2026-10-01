import {
    isAuthenticatedStatus,
    isSessionValidated,
    useSessionStore,
    type SessionStatus,
} from '../store/sessionStore';

/**
 * Reactive view of the session trust level.
 *
 * Screens use this to (a) tell a fully synchronised session apart from an offline one
 * and (b) decide whether a sensitive action may proceed. It is the read-only
 * counterpart to [`requireValidatedSession`](src/features/auth/store/sessionStore.ts:1),
 * which enforces the same rule inside mutation functions.
 *
 * `canMutate` is the single flag a screen should gate a state-changing control on:
 * disabling the control is the user-facing half of the rule, and
 * `requireValidatedSession` is the non-bypassable half.
 */
export type SessionValidity = {
    status: SessionStatus;
    /** The app shell is showing (any `authenticated-*` status). */
    isAuthenticated: boolean;
    /** The session has been confirmed by the server (`authenticated-online`). */
    isValidated: boolean;
    /** Authenticated but not server-confirmed (`validating` or `offline`). */
    isOffline: boolean;
    /** Whether a state-changing operation may proceed right now. */
    canMutate: boolean;
    /** User-facing explanation when `canMutate` is false; `null` otherwise. */
    blockedReason: string | null;
};

export function useSessionValidity(): SessionValidity {
    const status = useSessionStore(state => state.status);

    const isAuthenticated = isAuthenticatedStatus(status);
    const isValidated = isSessionValidated(status);

    return {
        status,
        isAuthenticated,
        isValidated,
        isOffline: isAuthenticated && !isValidated,
        canMutate: isValidated,
        blockedReason: isValidated
            ? null
            : 'You are offline. Reconnect to make changes.',
    };
}

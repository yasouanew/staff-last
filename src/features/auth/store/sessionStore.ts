import { create } from 'zustand';

import { setUnauthorizedHandler } from '../../../api/client';
import { clearToken, isTokenExpired, loadToken } from '../../../api/tokenStore';
import { SECURE_KEYS, STORAGE_KEYS } from '../../../config/storageKeys';
import { useNotificationInboxStore } from '../../notifications/store';
import { useOutboxStore } from '../../../services/outbox/outboxStore';
import { usePushStatusStore } from '../../../services/push/pushStatusStore';
import type { AppError } from '../../../types/appError';
import { clearSecureStorage, getSecureItem, setSecureItem } from '../../../utils/secureStorage';
import { clearAppStorage, getItem, removeItem } from '../../../utils/storage';
import { authApi } from '../api';
import type { AuthUser, LogoutPayload } from '../types';

/**
 * Session state.
 *
 * This is the single source of truth for "is the user signed in, and who are
 * they". It lives in Zustand rather than React context because non-React code
 * (the axios 401 handler, the FCM token refresh listener, background notification
 * handling) must be able to read and clear the session without a React tree.
 *
 * The token itself is **not** kept here — it is owned by `api/tokenStore` so the
 * request interceptor can read it synchronously. This store mirrors only the
 * derived session facts and keeps the two in lockstep.
 *
 * ## Why the status is a six-value machine, not a boolean
 *
 * Restoring a cached user before `GET /auth/me` completes is necessary for offline
 * use, but it means "signed in" is not one condition — it is a *trust level*:
 *
 * | Status | Meaning | UI consequence |
 * |---|---|---|
 * | `booting` | Cold start; the restore has not settled. | Branded splash (via `AppBootGate`). |
 * | `authenticated-validating` | A cached user is shown while `/auth/me` is in flight. | App shell, but **sensitive writes are blocked** until validation. |
 * | `authenticated-online` | `/auth/me` succeeded. The session is server-confirmed. | Full app; all operations permitted. |
 * | `authenticated-offline` | `/auth/me` failed for a non-auth reason; cached user retained. | App shell + an explicit offline banner; sensitive writes blocked. |
 * | `unauthenticated` | No token, or the token was rejected (401). | Auth stack. |
 * | `session-error` | A token exists but no cached user and validation failed. | Dedicated error screen with Retry / Sign out. |
 *
 * The trust boundary the brief calls out is enforced by
 * [`requireValidatedSession`](src/features/auth/store/sessionStore.ts:1): only
 * `authenticated-online` counts as validated, so a stale cached user (changed
 * permissions, disabled account, revoked token, altered company access) can never
 * authorise a state-changing operation.
 *
 * Deliberately excluded from this store: server data (profile, permissions
 * freshness). `GET /auth/me` is owned by TanStack Query — see `hooks/useSession`.
 */

export type SessionStatus =
    /** Cold start; `restoreSession` has not settled. Drives the splash gate. */
    | 'booting'
    /** A cached user is rendered while `/auth/me` is in flight. Not yet validated. */
    | 'authenticated-validating'
    /** `/auth/me` succeeded. The only fully trusted, validated state. */
    | 'authenticated-online'
    /** `/auth/me` failed for a non-auth reason; the cached user is shown. */
    | 'authenticated-offline'
    /** No token, or the token was rejected. */
    | 'unauthenticated'
    /** A token exists but the session could not be established (no cache + failure). */
    | 'session-error';

/** Every status in which a user is present and the app shell should render. */
const AUTHENTICATED_STATUSES: readonly SessionStatus[] = [
    'authenticated-validating',
    'authenticated-online',
    'authenticated-offline',
];

/** True when the app should show the authenticated shell for this status. */
export function isAuthenticatedStatus(status: SessionStatus): boolean {
    return AUTHENTICATED_STATUSES.includes(status);
}

/**
 * True only when the session has been confirmed by the server.
 *
 * Sensitive operations must require this rather than mere presence of a user, so a
 * cached record can never authorise a write.
 */
export function isSessionValidated(status: SessionStatus): boolean {
    return status === 'authenticated-online';
}

type SessionState = {
    /** See the state-machine table in the module docblock. */
    status: SessionStatus;
    user: AuthUser | null;
    /** Populated when the restore or the last validation failed. */
    restoreError: AppError | null;
    /** ISO timestamp of the last successful `/auth/me`. `null` until validated. */
    lastValidatedAt: string | null;

    /** Swaps the session in after a successful login (already server-confirmed). */
    setSession: (user: AuthUser) => Promise<void>;
    /** Replaces the cached user after a successful `/auth/me`; marks online. */
    setUser: (user: AuthUser) => Promise<void>;
    /** Records a failed revalidation while keeping the cached user (online → offline). */
    markOffline: (error: AppError) => void;
    /** Clears everything locally. Does not call the API — see `signOut`. */
    clearSession: () => Promise<void>;
    /**
     * Restores a persisted session on cold start.
     *
     * The token is treated as a hint, not as proof of authentication: it must be
     * validated with `GET /auth/me`, because the account may have been deactivated
     * (`account.active`) or the token revoked server-side.
     */
    restoreSession: () => Promise<void>;
    /** Revokes the current token server-side, then clears locally regardless. */
    signOut: (payload?: LogoutPayload) => Promise<void>;
    /** Revokes every token for the user, then clears locally regardless. */
    signOutEverywhere: () => Promise<void>;
};

/**
 * One-time migration of the cached user from plaintext AsyncStorage to encrypted
 * storage, mirroring the token migration in [`tokenStore`](src/api/tokenStore.ts:1).
 *
 * The cached user contains PII (name, email, phone), so it is moved out of the
 * unencrypted store on first read after upgrading. A failed write leaves the plaintext
 * copy in place and retries on the next launch rather than dropping the cache.
 */
async function migrateLegacyUser(): Promise<AuthUser | null> {
    const legacy = await getItem<AuthUser>(STORAGE_KEYS.authUser);

    if (legacy === null) {
        return null;
    }

    const persisted = await setSecureItem(SECURE_KEYS.authUser, legacy);

    if (persisted) {
        await removeItem(STORAGE_KEYS.authUser);
    }

    return legacy;
}

export const useSessionStore = create<SessionState>((set, get) => ({
    status: 'booting',
    user: null,
    restoreError: null,
    lastValidatedAt: null,

    setSession: async (user) => {
        // A login response *is* server validation: the credentials were accepted and
        // the canonical user was returned in the same round trip.
        set({ status: 'authenticated-online', user, restoreError: null, lastValidatedAt: new Date().toISOString() });
        await setSecureItem(SECURE_KEYS.authUser, user);
    },

    setUser: async (user) => {
        // Only meaningful while a session exists; a late `/auth/me` response must not
        // resurrect a session that was signed out in the meantime.
        if (!isAuthenticatedStatus(get().status)) {
            return;
        }
        set({ status: 'authenticated-online', user, restoreError: null, lastValidatedAt: new Date().toISOString() });
        await setSecureItem(SECURE_KEYS.authUser, user);
    },

    markOffline: (error) => {
        // Only downgrade a currently-validated session. During `authenticated-validating`
        // the restore owns the transition, and downgrading `unauthenticated` would be
        // meaningless (there is no cached user to show).
        if (get().status !== 'authenticated-online') {
            return;
        }
        set({ status: 'authenticated-offline', restoreError: error });
    },

    clearSession: async () => {
        set({ status: 'unauthenticated', user: null, restoreError: null, lastValidatedAt: null });

        // The notification inbox is dropped *in memory* as well as on disk. Clearing
        // only storage would leave the previous user's shift changes readable in the
        // store until the process is killed, and devices are shared in this domain.
        await useNotificationInboxStore.getState().reset();

        // The outbox is emptied unconditionally. Sign-out always clears the local
        // session immediately (the mutation policy's logout rule), and a queued write
        // must not be replayed under a different user's session.
        await useOutboxStore.getState().clear();

        // Push status is per-user; the next sign-in re-derives it.
        usePushStatusStore.getState().reset();

        // Credentials live in the Keychain/Keystore; `clearSecureStorage` removes the
        // cached user (and any residual token) so a shared device cannot restore the
        // previous user's PII. `clearToken` also removes the legacy plaintext entry.
        await clearToken();
        await clearSecureStorage();
        await clearAppStorage();
    },

    restoreSession: async () => {
        const persistedToken = await loadToken();

        if (persistedToken === null) {
            set({ status: 'unauthenticated', user: null, restoreError: null, lastValidatedAt: null });
            return;
        }

        /**
         * Session recovery: a token past its advisory expiry is discarded before any
         * request is attempted, so an obviously-dead session never paints the app shell
         * and is then torn down on the first 401. `isTokenExpired` returns `false` when
         * expiry is unknown, leaving the server 401 handler as the backstop.
         */
        if (isTokenExpired(persistedToken)) {
            await get().clearSession();
            return;
        }

        // Show the cached user immediately so the UI has something to render while
        // `/auth/me` revalidates. It is replaced below in all branches. Read from
        // encrypted storage first, falling back to a one-time legacy migration.
        const cachedUser = (await getSecureItem<AuthUser>(SECURE_KEYS.authUser)) ?? (await migrateLegacyUser());

        if (cachedUser) {
            // Explicitly *not* online yet: the cached record may be stale and must not
            // authorise writes until `/auth/me` confirms it.
            set({ status: 'authenticated-validating', user: cachedUser, restoreError: null });
        }

        try {
            const user = await authApi.me();
            await get().setSession(user);
        } catch (error) {
            const appError = error as AppError;

            // A 401 means the token is dead — the only correct response is to sign out.
            // Anything else (offline, 500, timeout) must NOT destroy a valid session:
            // fall back to the cached user so the app stays usable offline.
            if (appError?.kind === 'unauthorized') {
                await get().clearSession();
                return;
            }

            if (cachedUser) {
                // Cached user is retained, but the session is explicitly offline and
                // unvalidated — not indistinguishable from a synced session.
                set({ status: 'authenticated-offline', restoreError: appError ?? null });
                return;
            }

            // A token exists but there is nothing to render and the server could not
            // confirm it. This is a distinct state, not "authenticated with no user".
            set({ status: 'session-error', user: null, restoreError: appError ?? null });
        }
    },

    signOut: async (payload) => {
        try {
            await authApi.logout(payload);
        } catch {
            // The local session must be cleared even if revoking the token fails —
            // otherwise a user cannot sign out while offline.
        }
        await get().clearSession();
    },

    signOutEverywhere: async () => {
        try {
            await authApi.logoutAll();
        } catch {
            // Same reasoning as `signOut`.
        }
        await get().clearSession();
    },
}));

/**
 * Asserts that the session has been server-validated before a state-changing call.
 *
 * Reads the store non-reactively so it can be called from a TanStack Query
 * `mutationFn` (which runs outside React). Throws an `AppError` of kind `network`
 * — retryable, no HTTP status — so existing error surfaces (and `isRetryable`) treat
 * it exactly like a connectivity failure, which is what it is.
 *
 * This is the enforcement point for the brief's requirement that sensitive
 * operations require a validated session: a cached user from `authenticated-offline`
 * or `authenticated-validating` is deliberately insufficient.
 */
export function requireValidatedSession(): void {
    if (isSessionValidated(useSessionStore.getState().status)) {
        return;
    }

    throw {
        kind: 'network',
        message: 'You are offline. Reconnect to make changes — this action was not saved.',
    } satisfies AppError;
}

/**
 * Non-React accessors for the axios 401 handler and the push service.
 * Screens should use the `useSessionStore` hook instead.
 */
export const sessionActions = {
    getState: () => useSessionStore.getState(),
    clearSession: () => useSessionStore.getState().clearSession(),
    setSession: (user: AuthUser) => useSessionStore.getState().setSession(user),
    setUser: (user: AuthUser) => useSessionStore.getState().setUser(user),
    markOffline: (error: AppError) => useSessionStore.getState().markOffline(error),
};

/**
 * Wire the 401 handler.
 *
 * The API client invokes this when any request is rejected with a 401, which is the
 * authoritative "the token is dead" signal. The client already collapses a burst of
 * concurrent 401s into a single call (see
 * [`UNAUTHORIZED_COOLDOWN_MS`](src/api/client.ts:1)), so this handler does not need to
 * debounce: it simply clears the session once and lets the navigator fall back to the
 * Auth stack.
 *
 * Registered here rather than imported by the client so the dependency direction stays
 * one-way (`store → api`); the client must never import application state.
 */
setUnauthorizedHandler(() => {
    void useSessionStore.getState().clearSession();
});

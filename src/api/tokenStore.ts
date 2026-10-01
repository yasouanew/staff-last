import { SECURE_KEYS, STORAGE_KEYS } from '../config/storageKeys';
import { env } from '../config/env';
import { getSecureItem, removeSecureItem, setSecureItem } from '../utils/secureStorage';
import { getItem, removeItem } from '../utils/storage';

/**
 * Sanctum personal access token storage.
 *
 * Kept deliberately separate from the Zustand session store so the axios
 * interceptors can read the token **without** importing application state. This
 * avoids a circular dependency (`store → api → store`) and guarantees the token is
 * available on the very first request after a cold start, before React has
 * rendered anything.
 *
 * ## Where the token lives
 *
 * The token is **never** written to AsyncStorage. It is held in a module-level
 * variable (so request-time reads are synchronous) and persisted to the iOS
 * Keychain / Android Keystore via [`secureStorage`](src/utils/secureStorage.ts:1).
 * AsyncStorage previously held the plaintext bearer token, which exposed it to
 * rooted devices, device backups and debugging bridges; see
 * [`docs/secure-token-storage.md`](docs/secure-token-storage.md:1).
 *
 * ## Migration
 *
 * [`loadToken`](src/api/tokenStore.ts:1) transparently upgrades an install that
 * still has the legacy plaintext AsyncStorage entry: it reads the old record, writes
 * it to secure storage, and deletes the plaintext copy. This is the only remaining
 * reader of `STORAGE_KEYS.authToken`.
 *
 * ## Expiry and rotation
 *
 * Sanctum computes expiry server-side (`config('sanctum.expiration')`) and the login
 * response does not include it, so [`saveToken`](src/api/tokenStore.ts:1) derives an
 * advisory `expiresAt` from `env.auth.tokenTtlSeconds` when the backend omits one.
 * The derived value is a client-side bound used to re-authenticate proactively; the
 * server 401 remains the authority. Rotation is handled by
 * [`rotateToken`](src/api/tokenStore.ts:1), which atomically replaces the access
 * token (and, when supplied, the refresh token) after a refresh exchange.
 */

export type StoredToken = {
    /** Raw Sanctum plain-text token (`"1|abc..."`). */
    token: string;
    /** Always `"Bearer"` for Sanctum, stored so the header is not hardcoded. */
    tokenType: string;
    /**
     * ISO timestamp after which the token is considered invalid.
     *
     * `null` means "unknown" (the backend returned no expiry and derivation is
     * disabled via `AUTH_TOKEN_TTL_SECONDS=0`), in which case the app relies purely
     * on server 401s. When non-null it may be server-supplied or client-derived — the
     * field does not record which, because both are advisory and both are enforced
     * the same way by [`isTokenExpired`](src/api/tokenStore.ts:1).
     */
    expiresAt: string | null;
    /**
     * Refresh token, when the backend issues one (short-lived access tokens).
     *
     * `null` under the current Sanctum setup, which has no refresh endpoint. It is
     * carried in the stored shape so enabling refresh later is a backend-only change.
     */
    refreshToken: string | null;
    /** ISO timestamp the token was issued/persisted. Basis for rotation bookkeeping. */
    issuedAt: string;
};

let currentToken: StoredToken | null = null;

/** Synchronous read for the request interceptor. */
export function getToken(): StoredToken | null {
    return currentToken;
}

/** True when a token is present. Used by session restore, not for authorization. */
export function hasToken(): boolean {
    return currentToken !== null;
}

/**
 * Normalises a value read from storage (secure or legacy) into a `StoredToken`.
 *
 * The stored payload is untrusted: it may predate the current shape (no `refreshToken`
 * or `issuedAt`) or be corrupt. Missing optional fields are backfilled rather than
 * rejecting the token, because rejecting a valid token strands the user on login.
 */
function normalizeStoredToken(value: unknown): StoredToken | null {
    if (value === null || typeof value !== 'object') {
        return null;
    }

    const candidate = value as Partial<StoredToken> & { expiresAt?: unknown; refreshToken?: unknown };

    if (typeof candidate.token !== 'string' || candidate.token.length === 0) {
        return null;
    }

    return {
        token: candidate.token,
        tokenType: typeof candidate.tokenType === 'string' && candidate.tokenType.length > 0 ? candidate.tokenType : 'Bearer',
        expiresAt: typeof candidate.expiresAt === 'string' ? candidate.expiresAt : null,
        refreshToken: typeof candidate.refreshToken === 'string' ? candidate.refreshToken : null,
        issuedAt: typeof candidate.issuedAt === 'string' ? candidate.issuedAt : new Date().toISOString(),
    };
}

/**
 * Reads the legacy plaintext token from AsyncStorage, if present, and migrates it to
 * secure storage. Returns the migrated token (also left in memory) or `null`.
 *
 * The plaintext entry is deleted on a successful migration so the exposed copy does
 * not linger. If secure storage rejects the write, the plaintext entry is left in
 * place: keeping the user signed in with a less-safe store is preferable to signing
 * them out, and the next launch retries the migration.
 */
async function migrateLegacyToken(): Promise<StoredToken | null> {
    const legacy = normalizeStoredToken(await getItem<unknown>(STORAGE_KEYS.authToken));

    if (legacy === null) {
        return null;
    }

    const persisted = await setSecureItem(SECURE_KEYS.authToken, legacy);

    if (persisted) {
        await removeItem(STORAGE_KEYS.authToken);
    }

    currentToken = legacy;

    return legacy;
}

/**
 * Restores the persisted token into memory. Call once during app bootstrap.
 *
 * Order: secure store first (the current location), then a one-time legacy migration.
 * Returns `null` when nothing is stored, in which case the caller treats the user as
 * signed out.
 */
export async function loadToken(): Promise<StoredToken | null> {
    const stored = normalizeStoredToken(await getSecureItem<unknown>(SECURE_KEYS.authToken));

    if (stored !== null) {
        currentToken = stored;

        return stored;
    }

    return migrateLegacyToken();
}

/** Convenience wrapper: restores then reports whether a token is now in memory. */
export async function restoreToken(): Promise<boolean> {
    return (await loadToken()) !== null;
}

export type SaveTokenInput = {
    token: string;
    tokenType?: string;
    /** Server-supplied expiry, when the backend returns one. */
    expiresAt?: string | null;
    refreshToken?: string | null;
    /**
     * Seconds until expiry, when the backend returns a TTL rather than a timestamp.
     * Takes precedence over `env.auth.tokenTtlSeconds`.
     */
    expiresInSeconds?: number | null;
};

/**
 * Derives an advisory expiry timestamp.
 *
 * Priority: an explicit `expiresAt` → an explicit `expiresInSeconds` → the configured
 * `env.auth.tokenTtlSeconds`. A non-positive/absent TTL yields `null` ("unknown"),
 * which disables client-side expiry checks rather than inventing one.
 */
function resolveExpiry(input: SaveTokenInput): string | null {
    if (typeof input.expiresAt === 'string' && input.expiresAt.length > 0) {
        return input.expiresAt;
    }

    const ttlSeconds =
        typeof input.expiresInSeconds === 'number' && input.expiresInSeconds > 0
            ? input.expiresInSeconds
            : env.auth.tokenTtlSeconds;

    if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
        return null;
    }

    return new Date(Date.now() + ttlSeconds * 1000).toISOString();
}

/** Persists a token issued by `POST /auth/login`. */
export async function saveToken(input: SaveTokenInput): Promise<void> {
    const stored: StoredToken = {
        token: input.token,
        tokenType: input.tokenType || 'Bearer',
        expiresAt: resolveExpiry(input),
        refreshToken: input.refreshToken ?? null,
        issuedAt: new Date().toISOString(),
    };

    currentToken = stored;

    await setSecureItem(SECURE_KEYS.authToken, stored);
}

/**
 * Replaces the current token after a refresh exchange (rotation).
 *
 * Distinct from [`saveToken`](src/api/tokenStore.ts:1) so the intent is explicit at
 * the call site and so `issuedAt` is refreshed for rotation bookkeeping. The old
 * token is overwritten in the same key — there is no window where two access tokens
 * are simultaneously live on the device.
 */
export async function rotateToken(input: SaveTokenInput): Promise<void> {
    await saveToken(input);
}

/**
 * Clears the token from memory and from both storage locations (sign-out,
 * logout-all, 401).
 *
 * The legacy AsyncStorage entry is removed too, so a device that never completed the
 * migration does not retain a plaintext token after sign-out.
 */
export async function clearToken(): Promise<void> {
    currentToken = null;

    await Promise.all([removeSecureItem(SECURE_KEYS.authToken), removeItem(STORAGE_KEYS.authToken)]);
}

/**
 * True when the in-memory token is past its advisory expiry.
 *
 * Returns `false` when there is no token or the expiry is unknown — absence of a
 * bound is not evidence of expiry, and the server 401 handler is the backstop. The
 * `tokenExpirySkewSeconds` allowance prevents a fast device clock from discarding a
 * token the server still accepts.
 */
export function isTokenExpired(token: StoredToken | null = currentToken): boolean {
    if (token === null || token.expiresAt === null) {
        return false;
    }

    const expiresAtMs = Date.parse(token.expiresAt);

    if (!Number.isFinite(expiresAtMs)) {
        return false;
    }

    return Date.now() > expiresAtMs + env.auth.tokenExpirySkewSeconds * 1000;
}

/** Milliseconds until the advisory expiry, or `null` when unknown. Negative when past. */
export function msUntilExpiry(token: StoredToken | null = currentToken): number | null {
    if (token === null || token.expiresAt === null) {
        return null;
    }

    const expiresAtMs = Date.parse(token.expiresAt);

    return Number.isFinite(expiresAtMs) ? expiresAtMs - Date.now() : null;
}

/**
 * Builds the `Authorization` header value. Returns `null` when there is no token so
 * the interceptor can skip the header entirely on public endpoints.
 */
export function buildAuthorizationHeader(): string | null {
    if (currentToken === null) {
        return null;
    }

    return `${currentToken.tokenType || 'Bearer'} ${currentToken.token}`;
}

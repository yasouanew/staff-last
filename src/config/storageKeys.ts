/**
 * Single source of truth for persisted key names.
 *
 * Keys are namespaced and versioned so a future breaking change to a persisted
 * payload shape can be rolled out by bumping the suffix instead of crashing on
 * stale data.
 *
 * Two namespaces exist, and the distinction is a security boundary:
 *
 * - [`STORAGE_KEYS`](src/config/storageKeys.ts:1) — **AsyncStorage**. Non-sensitive
 *   preferences and cached presentation data only. Never credentials.
 * - [`SECURE_KEYS`](src/config/storageKeys.ts:1) — **Keychain / Keystore**, via
 *   [`secureStorage`](src/utils/secureStorage.ts:1). Authentication material and PII.
 */
export const STORAGE_KEYS = {
    /**
     * LEGACY plaintext token location.
     *
     * No longer written. Retained solely so [`tokenStore.loadToken`](src/api/tokenStore.ts:1)
     * can migrate an install that predates encrypted storage and then delete this
     * entry. Remove once the migration window has passed.
     */
    authToken: '@staffsaas/auth.token.v1',
    /**
     * LEGACY plaintext user cache.
     *
     * Same migration story as `authToken`: read once, re-persisted to secure
     * storage, then deleted.
     */
    authUser: '@staffsaas/auth.user.v1',
    /** Device-local preferences (theme, push opt-in). */
    preferences: '@staffsaas/preferences.v1',
    /** Last FCM token registered with the backend, used to unregister on logout. */
    fcmToken: '@staffsaas/fcm.token.v1',
    /**
     * Durable outbox of writes that could not reach the server.
     *
     * Persisted (not just in memory) so a queued write survives a process death and
     * is retried on the next launch. See
     * [`docs/mutation-policy.md`](docs/mutation-policy.md:1).
     */
    outbox: '@staffsaas/outbox.v1',
    /**
     * Locally persisted notification inbox (`PersistedInbox`), written by the push
     * handlers so notifications survive app restarts and remain readable offline.
     */
    notificationInbox: '@staffsaas/notifications.inbox.v1',
} as const;

/**
 * Keys for encrypted credential storage (iOS Keychain / Android Keystore).
 *
 * These are **not** AsyncStorage keys — they are logical names mapped to distinct
 * Keychain services by [`secureStorage`](src/utils/secureStorage.ts:1). Anything that
 * authenticates the user, or that contains personal data, belongs here.
 */
export const SECURE_KEYS = {
    /**
     * Sanctum bearer token plus its rotation metadata
     * (`{ token, tokenType, expiresAt, refreshToken, issuedAt }`).
     */
    authToken: 'auth.token.v1',
    /**
     * Cached `UserResource` from `auth/me`, used to render the shell instantly on a
     * cold start while `/auth/me` revalidates. Contains PII (name, email, phone), so
     * it is treated as a credential.
     */
    authUser: 'auth.user.v1',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
export type SecureKey = (typeof SECURE_KEYS)[keyof typeof SECURE_KEYS];

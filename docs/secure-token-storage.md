# Secure authentication token storage

## Summary

The Sanctum bearer token and the cached user record are persisted to **platform-native
encrypted storage** — the iOS Keychain and the Android Keystore-backed store — via the
maintained [`react-native-keychain`](https://github.com/oblador/react-native-keychain)
library. They are **never** written to AsyncStorage.

AsyncStorage is an unencrypted key/value file. On a rooted/jailbroken device, in a
device backup, or through a debugging bridge, anything in it is readable in plaintext.
A bearer token read from there grants API access as the signed-in employee until it is
revoked or expires.

## What lives where

| Data | Store | Rationale |
|---|---|---|
| Sanctum bearer token + rotation metadata | **Keychain / Keystore** | Authorises every request; highest-value secret. |
| Cached `UserResource` (name, email, phone) | **Keychain / Keystore** | Contains PII; a shared device must not leak it. |
| Theme, push opt-in, roster view preference | AsyncStorage | Non-sensitive presentation preferences. |
| Notification inbox cache | AsyncStorage | Presentation data; contains no credentials. |
| Last registered FCM token | AsyncStorage | Push routing label, not an API credential. |

The boundary is enforced in code: [`SECURE_KEYS`](../src/config/storageKeys.ts:1) are
only ever read/written through [`secureStorage`](../src/utils/secureStorage.ts:1);
[`STORAGE_KEYS`](../src/config/storageKeys.ts:1) are only ever read/written through
[`utils/storage`](../src/utils/storage.ts:1).

## How the token is stored

[`src/api/tokenStore.ts`](../src/api/tokenStore.ts:1) holds the token in a module-level
variable so the axios request interceptor can read it **synchronously** (no `await` in
the hot path, and no circular import between the session store and the API client). The
in-memory copy is mirrored to encrypted storage so it survives a cold start.

The persisted shape is:

```ts
type StoredToken = {
    token: string;             // raw Sanctum plaintext token, e.g. "1|abc..."
    tokenType: string;         // "Bearer"
    expiresAt: string | null;  // ISO timestamp, or null when unknown
    refreshToken: string | null;
    issuedAt: string;          // ISO timestamp the token was issued/persisted
};
```

### Hardened write options

Every write uses:

- **iOS** `ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY` — the item is excluded from
  iCloud Keychain and device backups. A bearer token must not be restorable onto a
  second device.
- **Android** `STORAGE_TYPE.AES_GCM_NO_AUTH` with `SECURITY_LEVEL.SECURE_SOFTWARE` —
  the AES key is held in the Keystore, separate from the ciphertext. No per-read
  biometric gate is set, because the token is read on cold start and in headless push
  launches where a biometric prompt is impossible.

## Expiry

Sanctum computes expiry server-side (`config('sanctum.expiration')`, default 1440
minutes) and **does not return it** in the login response. The client therefore cannot
know the true expiry, and previously had no expiry at all — a restored token was trusted
until the server returned a 401.

Two mitigations are in place:

1. **Advisory expiry derivation.** When the backend returns no `expires_at`/`expires_in`,
   [`saveToken`](../src/api/tokenStore.ts:1) derives `expiresAt` from
   `AUTH_TOKEN_TTL_SECONDS` (default 24h, mirroring Sanctum's shipped default). Setting
   it to `0` disables derivation and leaves `expiresAt: null` ("unknown").
2. **Clock-skew allowance.** A token is not treated as expired until
   `AUTH_TOKEN_EXPIRY_SKEW_SECONDS` (default 60s) after its computed expiry, so a device
   clock running slightly fast cannot discard a token the server still accepts.

`isTokenExpired()` returns `false` when expiry is unknown — absence of a bound is not
evidence of expiry. The server 401 handler remains the ultimate authority.

## Session recovery on cold start

[`restoreSession`](../src/features/auth/store/sessionStore.ts:1) runs at boot:

1. `loadToken()` restores the token from encrypted storage (with a one-time legacy
   migration, below).
2. If the token is past its advisory expiry, the session is cleared **before any request
   is attempted** — an obviously-dead session never paints the app shell and is then torn
   down on the first 401.
3. The cached user is shown immediately so the UI renders while `GET /auth/me`
   revalidates.
4. On `/auth/me`:
   - **401** → the token is dead; the session is cleared.
   - **Any other error** (offline, 500, timeout) → the cached user is kept, so the app
     stays usable offline. A valid session is never destroyed by a transient failure.

## Rotation

`rotateToken()` replaces the current access token after a refresh exchange. The old
token is overwritten in the same key, so there is never a window with two live access
tokens on the device. `refreshToken` is carried in the stored shape and is `null` under
the current backend.

**Refresh-token rotation is not yet active** because the backend does not issue refresh
tokens. When it does, the only client change required is for `useLogin` to forward
`refresh_token`/`expires_in` from the login response (the types and the persistence path
already support them) and for a refresh call to invoke `rotateToken()`.

## Revocation

- **Sign-out** (`POST /auth/logout`) revokes the current token server-side; local state
  is cleared regardless of whether the network call succeeds, so a user can always sign
  out while offline.
- **Sign-out everywhere** (`POST /auth/logout-all`) revokes every token for the user.
- `clearSession()` calls `clearToken()` (removes the token and the legacy plaintext
  entry) and `clearSecureStorage()` (removes the cached user), so a shared device cannot
  restore the previous user's PII.
- A **401** from any endpoint invokes the registered unauthorized handler, which clears
  the session and lets the navigator fall back to the Auth stack.

## Migration from plaintext storage

An install that predates this change has a plaintext token at
`@staffsaas/auth.token.v1` and a plaintext user at `@staffsaas/auth.user.v1`.

On the first launch after upgrade:

1. `loadToken()` finds no secure entry, reads the legacy plaintext token, writes it to
   encrypted storage, and **deletes the plaintext copy**.
2. `restoreSession()` reads the cached user from encrypted storage; if absent, it
   migrates the legacy plaintext user and deletes the plaintext copy.

If the secure write fails, the plaintext entry is left in place and the migration is
retried on the next launch — keeping the user signed in with a less-safe store is
preferable to signing them out. The legacy `STORAGE_KEYS.authToken`/`authUser` entries
can be removed once the migration window has passed.

## Failure behaviour

- **Secure storage unavailable** (rare, e.g. a broken emulator): `useLogin` probes with
  `isSecureStorageAvailable()` and logs a warning. The session works in memory but does
  not persist across restarts. Writes report `false` rather than throwing.
- **Corrupt/undecryptable payload**: the entry is reset so it cannot wedge every launch,
  and the user is treated as signed out.
- Nothing in [`secureStorage`](../src/utils/secureStorage.ts:1) throws; the app never
  crashes on a storage failure.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `AUTH_TOKEN_TTL_SECONDS` | `86400` | Advisory access-token lifetime used to derive `expiresAt` when the backend returns none. `0` disables derivation. |
| `AUTH_TOKEN_EXPIRY_SKEW_SECONDS` | `60` | Clock-skew allowance before a computed expiry is enforced. |

## Verification

- [`src/utils/__tests__/secureStorage.test.ts`](../src/utils/__tests__/secureStorage.test.ts:1)
  — round trip, service namespacing, hardened options, corrupt-payload handling,
  availability probe.
- [`src/api/__tests__/tokenStore.test.ts`](../src/api/__tests__/tokenStore.test.ts:1) —
  encrypted-only persistence, expiry derivation/enforcement, rotation, cold-start
  restore, legacy migration, sign-out clearing both stores.

## Related

- [`docs/push-notification-setup.md`](push-notification-setup.md)
- [`docs/offline-notification-inbox.md`](offline-notification-inbox.md)

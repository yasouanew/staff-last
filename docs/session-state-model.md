# Session state model

## Why "signed in" is not a boolean

The app restores a cached user from encrypted storage before `GET /auth/me` completes,
so the shell can paint instantly and stay usable offline. That is necessary — but it
means a rendered session is not the same as a *trusted* session. Treating the two as
one creates a trust boundary:

- the cached user may be **stale** (name, email, permissions);
- **permissions** may have been revoked since the cache was written;
- **company access** may have changed (trial expired, subscription cancelled);
- the account may have been **disabled**;
- the **token** may have been revoked.

Each of those is only detectable by asking the server. The state machine below makes
the distinction explicit so that a cached session can never authorise a sensitive
operation, and so that offline mode is visible to the user rather than being
indistinguishable from a fully synchronised session.

## The six states

[`SessionStatus`](../src/features/auth/store/sessionStore.ts:1) is defined in
[`sessionStore.ts`](../src/features/auth/store/sessionStore.ts:1):

| Status | Set when | Shell | Sensitive writes |
|---|---|---|---|
| `booting` | Cold start, before `restoreSession` settles. | Splash (`AppBootGate`) | Blocked |
| `authenticated-validating` | A cached user is shown while `GET /auth/me` is in flight. | App | **Blocked** |
| `authenticated-online` | `GET /auth/me` succeeded, or a login response was received. | App | **Allowed** |
| `authenticated-offline` | `GET /auth/me` failed for a non-auth reason; cached user retained. | App + offline banner | **Blocked** |
| `unauthenticated` | No token, or a 401 cleared the session. | Auth stack | Blocked |
| `session-error` | A token exists, there is no cache, and validation failed. | `SessionErrorView` | Blocked |

`authenticated-online` is the **only** validated state.

### Transition diagram

```
                 ┌────────────┐
                 │  booting   │
                 └─────┬──────┘
      no token /     │         │ token + cache
      expired token  │         ▼
                     │  ┌──────────────────────────┐
                     │  │ authenticated-validating │
                     │  └───────┬─────────┬────────┘
                     │   200    │         │ non-401 failure
                     │          ▼         ▼
                     │  ┌──────────────┐  ┌──────────────────────┐
                     │  │authenticated-│  │ authenticated-offline│
                     │  │   online     │◄─┤ (markOffline / focus │
                     │  └──────┬───────┘  │  refetch failure)    │
                     │         │          └──────────┬───────────┘
                     │  401 /  │                     │ 401
                     │  signOut │                     │
                     ▼          ▼                     ▼
                ┌──────────────────────────────────────────┐
                │             unauthenticated              │
                └──────────────────────────────────────────┘

  token + NO cache + validation failure ──▶ session-error ──(Retry)──▶ …
```

## Enforcing the trust boundary

Two halves, and both are required:

1. **UI half — [`useSessionValidity`](../src/features/auth/hooks/useSessionValidity.ts:1).**
   Exposes `canMutate` and `blockedReason`. Screens disable a state-changing control
   when `canMutate` is false, so an offline user is told *why* rather than tapping a
   button that silently fails. Example:
   [`CreateLeaveRequestScreen`](../src/features/leave/screens/CreateLeaveRequestScreen.tsx:1).

2. **Enforcement half — [`requireValidatedSession`](../src/features/auth/store/sessionStore.ts:1).**
   Called inside every sensitive `mutationFn`. It throws an `AppError` of kind
   `network` (retryable, no HTTP status) when the session is not `authenticated-online`,
   so existing error surfaces treat it exactly like a connectivity failure. This half
   cannot be bypassed by a screen that forgets to disable its button.

### Which operations are gated

Sensitive (state-changing) mutations call `requireValidatedSession()`:

| Operation | File |
|---|---|
| Create leave request | [`useCreateLeaveRequest`](../src/features/leave/hooks/useCreateLeaveRequest.ts:1) |
| Sync weekly availability | [`useSyncWeeklyAvailability`](../src/features/availability/hooks/useSyncWeeklyAvailability.ts:1) |
| Update profile | [`useUpdateProfile`](../src/features/profile/hooks/useUpdateProfile.ts:1) |
| Update password | [`useUpdatePassword`](../src/features/profile/hooks/useUpdatePassword.ts:1) |
| Resend verification email | [`useResendVerification`](../src/features/profile/hooks/useResendVerification.ts:1) |

Deliberately **not** gated:

- **Reads** — roster, shifts, leave list, notifications. These are safe to serve from
  cache and are the whole point of offline mode.
- **Mark-notification-read** — an idempotent local-first write that is explicitly
  designed to work offline and reconcile later.
- **Push device registration** — a non-sensitive background concern; it uses
  `isAuthenticatedStatus` (any `authenticated-*`), not the stricter validated check.

## Offline mode is explicit in the UI

[`SessionOfflineBanner`](../src/components/SessionOfflineBanner/SessionOfflineBanner.tsx:1)
renders across the app shell whenever the session is authenticated but unvalidated
(`validating` or `offline`). It states the consequence — "Offline — showing saved data.
Reconnect to make changes." — and self-hides when the session is validated or signed
out. It is mounted once, at the root in
[`RootNavigator`](../src/navigation/RootNavigator.tsx:1).

The banner is informational, not an error: it carries no retry button, because
revalidation is owned by [`useSession`](../src/features/auth/hooks/useSession.ts:1) and
happens automatically on refetch/focus.

## How validation happens

[`useSession`](../src/features/auth/hooks/useSession.ts:1) owns `GET /auth/me`:

- **Enabled** for any `authenticated-*` status (not just `online`), so a session that
  started offline can recover.
- On **success**, `setUser` promotes the session to `authenticated-online` and records
  `lastValidatedAt`.
- On a **non-401 failure**, `markOffline` downgrades `online → offline`. It never
  downgrades `validating` (the restore owns that transition) or `unauthenticated`.
- A **401** is left to the axios interceptor, which clears the session.

## Session recovery on cold start

[`restoreSession`](../src/features/auth/store/sessionStore.ts:1) runs once at boot:

1. `loadToken()` — no token ⇒ `unauthenticated`; an expired advisory token ⇒
   `clearSession()`.
2. With a cached user, set `authenticated-validating` and render.
3. `GET /auth/me`:
   - success ⇒ `authenticated-online`;
   - 401 ⇒ `clearSession()` ⇒ `unauthenticated`;
   - other failure + cache ⇒ `authenticated-offline`;
   - other failure + no cache ⇒ `session-error`.

## Testing

- [`sessionStore.test.ts`](../src/features/auth/store/__tests__/sessionStore.test.ts:1) —
  every transition above, plus `requireValidatedSession` permitting only `online`.
- [`useCreateLeaveRequest.test.tsx`](../src/features/leave/hooks/__tests__/useCreateLeaveRequest.test.tsx:1) —
  the real mutation refuses to call the API while offline/validating.

## Related

- [`docs/secure-token-storage.md`](secure-token-storage.md) — token storage, expiry,
  rotation and revocation.

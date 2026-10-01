# Push notification reliability

## The problem

Push failures are deliberately non-fatal — a broken push pipeline must never block login
— but the cost of that tolerance is that the user has no idea notifications are not
working. This document covers the reliability and UX layer that makes the state legible
and recoverable.

## Two independent facts

Permission and registration fail separately and have **different remedies**, so they are
tracked separately in [`pushStatusStore`](../src/services/push/pushStatusStore.ts:1):

| Fact | Values | Remedy |
|---|---|---|
| **OS permission** | `granted` / `denied` / `not-determined` / `unsupported` | Only the OS settings screen can grant it. |
| **Backend registration** | `registered` / `pending` / `failed` / `unregistered` | Retry, or wait for connectivity. |

`isPushHealthy` is true only when permission is `granted` **and** registration is
`registered`.

## Settings UX

[`PreferencesScreen`](../src/features/settings/screens/PreferencesScreen.tsx:1) renders:

- **Device permission** status and **Registration** status as labelled rows.
- An explanation when something needs attention (`describePermission`), including the
  platform-specific "turn notifications on in Settings" copy when denied.
- **Open device settings** — shown only when permission is denied, because that is the
  only remedy. A button that pretends the app can grant it would be worse than none.
- **Retry registration** — shown when push is enabled but not healthy and permission is
  not the blocker.

## Retry on foreground and connectivity restore

[`usePushStatus`](../src/services/push/usePushStatus.ts:1) is mounted once at the root. It
refreshes OS permission on mount and on every foreground, and retries registration
whenever the app returns to the foreground with a validated session — the moment
connectivity has most likely returned. It also reacts to the login transition
(`authenticated-online`). `registerDevice` short-circuits when there is nothing to do, so
the foreground retry is cheap.

## Invalid-token removal

When the backend rejects the token, retrying it would loop forever. The policy
([`handleRegistrationFailure`](../src/services/push/pushService.ts:1)) is:

| Backend response | Action |
|---|---|
| `404` / `410`, or `422` on the token field | **Delete the local FCM token** (via `deleteToken`) so a fresh one is minted next attempt; report `failed`. |
| Connectivity / 5xx | Queue in the [outbox](../src/services/outbox/outboxStore.ts:1); report `pending`. |
| Any other 4xx | Report `failed` — never silently dropped. |

Detection lives in [`isInvalidTokenError`](../src/services/push/pushStatus.ts:1).

## Unregister semantics (the local-token question)

The previous code deleted the stored token and the local FCM token in a `finally` block
regardless of whether the server call succeeded. That conflated two different things.
The corrected policy:

1. **Server call succeeds** → clear the stored token (the server no longer knows it).
2. **Server returns `404`/`410`** → already removed; clear the stored token. Not a
   failure.
3. **Connectivity failure** → **retain** the stored token and enqueue a
   `push.unregister` in the outbox, carrying the old token in its payload. Deleting it
   here would strand a server-side registration the backend still believes is active,
   and would leave nothing to retry with.
4. **Other failure** → logged; the stored token is retained.

**The local FCM token is always deleted, and that is intentional.** On a shared device
the *local* token is what would receive the previous user's notifications, so it must be
discarded on sign-out regardless of whether the backend was told. Because the queued
`push.unregister` carries the token string, the server cleanup still completes later.

A deferred unregister whose token the server no longer knows is treated as **success** by
the [sync runner](../src/services/outbox/syncOutbox.ts:1), not dead-lettered.

## Related

- [`docs/mutation-policy.md`](mutation-policy.md) — the outbox that makes deferred
  unregister durable.
- [`docs/offline-notification-inbox.md`](offline-notification-inbox.md) — the local inbox.
- [`docs/push-notification-setup.md`](push-notification-setup.md) — native configuration.

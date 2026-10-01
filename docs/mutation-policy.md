# Mutation policy

## The rule

**A write is only reported as done once it has actually left the device — or it is
visibly queued.**

Several operations in this app run against a cached session. Without an explicit
policy, a tap while offline could update the local UI and imply success even though the
server never received the write. This document defines, per operation, exactly what
happens offline, and the machinery that enforces it.

## Per-operation policy

| Operation | Offline behaviour | Rationale |
|---|---|---|
| **Mark notification read** | **Durable outbox** | The read is a local-first fact the user has already acted on; it must never be lost. The write is queued and retried until the server accepts it. |
| **Submit leave request** | **Blocked** (button disabled + explicit reason) | A leave request has approval consequences and a server-computed `total_days`; silently queueing it would let a user believe a request was submitted when it was not. It requires a validated session. |
| **Edit profile** | **Blocked** | Name/email changes have no conflict handling and reset `email_verified_at` server-side; queueing without a merge strategy would be unsafe. Requires a validated session. |
| **Change availability** | **Queued with timestamp** | A whole-week replacement is idempotent and last-write-wins, so queueing is safe. The payload carries `clientUpdatedAt` for ordering. The UI shows an explicit "saved on this device" state. |
| **Push registration** | **Retry on connectivity** | Non-essential and idempotent (the backend upserts on `token`), so a connectivity failure is queued and replayed. A 4xx is dropped. |
| **Logout** | **Always clear the local session immediately** | A user must be able to sign out offline. The server token is revoked on a best-effort basis; local state is cleared regardless, and the outbox is emptied so nothing replays under another user. |

The blocking half is implemented by [`requireValidatedSession`](../src/features/auth/store/sessionStore.ts:1)
(see [`docs/session-state-model.md`](session-state-model.md)); the queueing half by the
outbox below.

## The durable outbox

[`src/services/outbox/`](../src/services/outbox/outboxStore.ts:1) is a single persisted
queue of writes that could not reach the server.

| Concern | Implementation |
|---|---|
| **Durability** | Persisted to AsyncStorage (`@staffsaas/outbox.v1`) on every mutation, so a queued write survives a process death and is replayed on the next launch. |
| **Deduplication** | Each entry has a stable id `${kind}:${naturalKey}` (e.g. `notification.read:<uuid>`, `availability.sync:<employeeId>`). Re-enqueuing replaces the existing entry, so a repeated read or a second availability save does not stack. |
| **Retries** | Retryable failures get exponential backoff (`backoffFor`), from 5s up to a 15-minute cap. |
| **Dead-letter** | A non-retryable failure (4xx a retry cannot fix) — or exceeding `MAX_AUTO_ATTEMPTS` (5) — sets `status: 'failed'` and stops automatic retries. |
| **Conflict / ordering** | Entries replay oldest-first; a flush is single-flight. A 401 aborts the flush. Availability entries carry `clientUpdatedAt`. |
| **Shared devices** | The queue is stamped with the owning `userId`; a queue belonging to another user is discarded on hydrate, and `clearSession` empties it on sign-out. |
| **Capacity** | Capped at `OUTBOX_MAX_ENTRIES` (200), dropping the oldest on overflow. |

### Files

| File | Role |
|---|---|
| [`outboxStore.ts`](../src/services/outbox/outboxStore.ts:1) | The persisted Zustand queue: enqueue, dedupe, backoff, dead-letter, hydrate, clear. |
| [`outboxHandlers.ts`](../src/services/outbox/outboxHandlers.ts:1) | One replay function per operation kind. Adding a queued operation = a kind + a handler + an `enqueue` call. |
| [`syncOutbox.ts`](../src/services/outbox/syncOutbox.ts:1) | The single-flight flush runner and its preconditions/failure handling. |
| [`useOutboxSync.ts`](../src/services/outbox/useOutboxSync.ts:1) | Lifecycle binding: hydrate on session, flush on `authenticated-online`. |
| [`OutboxStatusBanner.tsx`](../src/services/outbox/OutboxStatusBanner.tsx:1) | The user-visible pending/failed surface. |

### When a flush happens

[`useOutboxSync`](../src/services/outbox/useOutboxSync.ts:1) is mounted once in
[`App.tsx`](../App.tsx:1). It flushes whenever the session reaches
`authenticated-online` — the same trust level the interactive mutations require. A flush
is a write, so it never runs against an offline or unvalidated session; the queue simply
waits. After a non-empty flush it invalidates the availability and notification queries,
and skips invalidation when nothing was sent.

## User-visible failure status

[`OutboxStatusBanner`](../src/services/outbox/OutboxStatusBanner.tsx:1) renders across
the app shell (mounted in [`RootNavigator`](../src/navigation/RootNavigator.tsx:1)) and
self-hides when the queue is empty:

- **Pending** — "N change(s) waiting to sync." / "Syncing N change(s)…" while a flush
  runs.
- **Failed** — "N change(s) couldn't be saved." with a **Retry** that re-arms the
  dead-lettered entries and flushes immediately.

This is the only place a queued write becomes a user-actionable failure, and it is what
makes "a production app must not silently imply a write succeeded" true in practice.

## Testing

- [`outboxStore.test.ts`](../src/services/outbox/__tests__/outboxStore.test.ts:1) —
  persistence, dedupe, backoff, dead-letter, cross-user isolation, selectors.
- [`syncOutbox.test.ts`](../src/services/outbox/__tests__/syncOutbox.test.ts:1) —
  the validated-session precondition, retry vs dead-letter, 401 halt, single-flight.

## Related

- [`docs/session-state-model.md`](session-state-model.md) — the validated-session gate.
- [`docs/offline-notification-inbox.md`](offline-notification-inbox.md) — the local-first inbox.

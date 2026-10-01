# Offline notification inbox

Previously there was **no offline inbox**. FCM was transport only: a push arrived, the
app invalidated a React Query key, and everything the user saw came from the network.
Offline, the notification screen showed whatever happened to be in the query cache — and
a notification delivered while the app was closed was lost as *content* the moment the
tray entry was dismissed.

This document describes the local persistence layer that fixes that.

## Architecture

```
                      ┌──────────────────────────────────────────┐
   FCM delivery       │  pushService.ts                          │
   ─────────────────► │   • onMessage (foreground)               │
                      │   • onNotificationOpenedApp (tap)        │
                      │   • getInitialNotification (cold start)  │
                      │   • setBackgroundMessageHandler (headless)│
                      └───────────────────┬──────────────────────┘
                                          │ receivePush(data, id)
                                          ▼
                      ┌──────────────────────────────────────────┐
   AsyncStorage ◄──── │  notificationInboxStore (Zustand)        │ ◄── markRead / markAllRead
   @staffsaas/        │   items: InboxItem[]                     │     (written locally FIRST,
   notifications.     │   hydrated / userId / synced             │      server write is best-effort)
   inbox.v1           └───────────────────┬──────────────────────┘
                                          │ hydrate + merge
                                          ▼
                      ┌──────────────────────────────────────────┐
   GET /notifications │  useInbox()  — local-first query         │
   ─────────────────► │   renders store, reconciles from server  │
                      └───────────────────┬──────────────────────┘
                                          ▼
                      NotificationsScreen  +  AppTabs badge (useLocalUnreadCount)
```

The network is a **reconciler**, not the render source.

## Files

| File | Role |
| --- | --- |
| [`src/features/notifications/utils/inboxMerge.ts`](src/features/notifications/utils/inboxMerge.ts:1) | Pure merge/normalisation logic. No React, no AsyncStorage, no Firebase — fully unit-testable. |
| [`src/features/notifications/store/notificationInboxStore.ts`](src/features/notifications/store/notificationInboxStore.ts:1) | Zustand store owning the in-memory list plus AsyncStorage persistence. |
| [`src/features/notifications/hooks/useInbox.ts`](src/features/notifications/hooks/useInbox.ts:1) | The screen-facing hook: hydrate, then merge server pages. |
| [`src/features/notifications/hooks/useLocalUnreadCount.ts`](src/features/notifications/hooks/useLocalUnreadCount.ts:1) | Badge count derived from the store, `null` until hydrated. |
| [`src/services/push/pushService.ts`](src/services/push/pushService.ts:1) | All four FCM delivery paths now persist before handing off. |

## The two device-local fields

The API shape [`AppNotification`](src/features/notifications/types/index.ts:12) is extended
with two fields the server knows nothing about:

```ts
export type InboxItem = AppNotification & {
    server_id: string | null;   // backend uuid, once known
    pending: boolean;           // true = materialised from a push, not yet confirmed
};
```

`pending` rows render a small "Queued" label. They are the rows that exist **only**
because a push arrived — if the server never confirms them, the user still sees them.

## Identity matching — the subtle part

A push payload carries the *business* key (`type`, `shift_id`, `roster_id`), **not** the
`notifications` table uuid. A server page carries the uuid. So the same real-world event
arrives under two different ids.

[`isSameNotification`](src/features/notifications/utils/inboxMerge.ts:1) correlates them:

1. match on `id` / `server_id` when either side knows the other's id;
2. otherwise require the same `type` **and** identical `data` keys/values.

A redelivered FCM message therefore refreshes one row instead of stacking duplicates,
and a later `GET /notifications` collapses the pending row into its server twin.

> **Guard:** rows that both carry a `server_id` are compared on that id alone. Two
> genuinely different notifications can share `type` + `data`, and treating them as one
> would silently delete a notification. This was a real bug caught by
> [`inboxMerge.test.ts`](src/features/notifications/utils/__tests__/inboxMerge.test.ts:1).

## Conflict resolution

| Situation | Result | Why |
| --- | --- | --- |
| Local `read_at` set, server says unread | **Local read wins** | The user read it; the write may simply not have landed yet. Reverting would flip a notification back to bold. |
| Local unread, server says read | **Server read wins** | Read on another device. |
| Server page arrives | Pending push-only rows are **retained** | They have not been confirmed yet; discarding them loses content. |
| Different `userId` on disk | **Inbox discarded** | Devices are shared in this domain; showing a previous user's shift changes would be a leak. |

## Capacity

[`INBOX_MAX_ITEMS = 200`](src/features/notifications/utils/inboxMerge.ts:17). The whole
inbox is one JSON blob in AsyncStorage, so it is capped to keep reads cheap. Newest-first,
stable tiebreak on id.

## Read actions are local-first

[`useNotificationActions`](src/features/notifications/hooks/useNotificationActions.ts:1)
writes the local store **before** awaiting the request:

- Connectivity failures are swallowed with a log — the read stands, and the server finds
  out on the next sync.
- A 4xx (403/404) is **not** swallowed; the local read state is wrong and the mutation
  surfaces to the caller.

This is the one place where the previous "server owns `read_at`, no optimistic updates"
rule is deliberately relaxed, and only for the directions described in the table above.

## Wire format emitted by the backend

The handlers read `title`, `body` and `type` out of the FCM data bag, which the backend
already sends via [`FcmMessage`](../staff-sass-last17/app/Notifications/Messages/FcmMessage.php:1):

```json
{
  "type": "shift.assigned",
  "shift_id": "42",
  "title": "Shift assigned",
  "body": "You have a shift on Monday"
}
```

`title`/`body` are stripped from the stored `data` bag (they are rendered as fields), so
the bag retains only business keys — which is exactly what identity matching compares.

## Testing

```bash
npx jest src/features/notifications
```

20 tests / 2 suites:

- `inboxMerge` — deserialisation of hostile payloads, merge/precedence rules, identity
  collision guard, capacity cap, idempotent read marking, unread counting.
- `notificationInboxStore` — hydrate, cross-user discard, merge + persist round-trip,
  push receipt, reset.

AsyncStorage has no native module under Jest, so
[`jest/async-storage.mock.js`](jest/async-storage.mock.js:1) provides a real in-memory
store (not stubs) and is wired in
[`jest.config.js`](jest.config.js:31). The persistence round-trip is therefore genuinely
exercised.

## Manual verification checklist

| Scenario | Expected |
| --- | --- |
| Server unreachable, list opened | Rows render; "Showing notifications stored on this device" banner; **no** error screen |
| Never-synced device, no rows | `ErrorView` with retry (the only honest error case) |
| Notification tapped while offline | Row marked read immediately; not flipped back after the next sync |
| Push received with app killed, tray entry dismissed | Row is present on next launch, marked "Queued" |
| Sign out, then sign in as another user | Inbox is empty; no rows from the previous user |
| Badge with no connectivity | Still shows the correct unread count |

## Known limitations

1. **Outbound writes now have a durable queue.** A read performed offline is written
   locally *and* enqueued in the durable outbox
   ([`src/services/outbox/`](src/services/outbox/outboxStore.ts:1)), which retries it
   until the server accepts it — see [`docs/mutation-policy.md`](mutation-policy.md). The
   remaining caveat is propagation, not durability: a read on device A does not appear on
   device B until B syncs *and* A's queued write has reached the server.
2. **Single page.** The store mirrors the 30-row first page the screen requests, capped
   at 200 items. There is no local pagination.
3. **`pending` rows are dated from the push event**, not from a server timestamp, so a
   long-offline device may order a pending row slightly differently than the server
   would. This resolves on the first successful sync.

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
   ─────────────────► │   • onMessage (foreground)      → persist │
                      │   • setBackgroundMessageHandler → persist │
                      │   • onNotificationOpenedApp (tap) → route │
                      │   • getInitialNotification (cold) → route │
                      └───────────────────┬──────────────────────┘
                                          │ receivePush(data, id)
                                          ▼
                      ┌──────────────────────────────────────────┐
   AsyncStorage ◄──── │  notificationInboxStore (Zustand)        │ ◄── markRead / markAllRead
   @staffsaas/        │   items: InboxItem[]                     │     (written locally FIRST,
   notifications.     │   loaded / hydrated / userId / synced /  │      server write is best-effort)
   inbox.v1           │   watermark                              │
                      └───────────────────┬──────────────────────┘
                                          │ hydrate + merge
                                          ▼
                      ┌──────────────────────────────────────────┐
   GET /notifications │  useInbox()  — local-first query         │
   ─────────────────► │   renders store, reconciles from server  │
                      └───────────────────┬──────────────────────┘
                                          ▼
                      NotificationsScreen  +  AppTabs badge (useLocalUnreadCount)

   Reconnect          ┌──────────────────────────────────────────┐
   (NetInfo)          │  syncNotifications()  — cursor sync      │
   ─────────────────► │   GET /notifications?since=<watermark>   │
                      └──────────────────────────────────────────┘

   Tap (any state)    ┌──────────────────────────────────────────┐
   ─────────────────► │  usePushNotifications.onNotificationOpened│
                      │   syncNotifications() + navigate         │
                      │   (never inserts a row)                  │
                      └──────────────────────────────────────────┘
```

**Only the two *delivery* paths persist.** A tap routes and reconciles; it never writes a
row. See [Duplicate prevention](#duplicate-prevention) below.

The network is a **reconciler**, not the render source. On a reconnect the
[connectivity coordinator](connectivity-recovery.md) runs this reconciliation as step 4 of
its recovery pipeline, so a notification the device never received by push is still
recovered from the server.

## Files

| File | Role |
| --- | --- |
| [`src/features/notifications/utils/inboxMerge.ts`](src/features/notifications/utils/inboxMerge.ts:1) | Pure merge/normalisation logic. No React, no AsyncStorage, no Firebase — fully unit-testable. |
| [`src/features/notifications/store/notificationInboxStore.ts`](src/features/notifications/store/notificationInboxStore.ts:1) | Zustand store owning the in-memory list plus AsyncStorage persistence. |
| [`src/features/notifications/hooks/useInbox.ts`](src/features/notifications/hooks/useInbox.ts:1) | The screen-facing hook: hydrate, then merge server pages. |
| [`src/features/notifications/hooks/useLocalUnreadCount.ts`](src/features/notifications/hooks/useLocalUnreadCount.ts:1) | Badge count derived from the store, `null` until hydrated. |
| [`src/services/push/pushService.ts`](src/services/push/pushService.ts:1) | All four FCM delivery paths now persist before handing off. |

## The device-local fields

The API shape [`AppNotification`](src/features/notifications/types/index.ts:12) is extended
with three fields the server knows nothing about:

```ts
export type InboxItem = AppNotification & {
    server_id: string | null;       // backend uuid, once known
    notification_id: string | null; // canonical backend id (see below)
    pending: boolean;               // true = materialised from a push, not yet confirmed
};
```

`pending` rows render a small "Queued" label. They are the rows that exist **only**
because a push arrived — if the server never confirms them, the user still sees them.
A row created from a payload that already carries `notification_id` is **not** pending:
the server already owns it.

## Identity matching — the subtle part

The backend `notifications` record is the **single source of truth**. The FCM payload
carries its id as `notification_id`, and a server row carries the same value as its `id`.
That shared value is the canonical local identity.

[`isSameNotification`](src/features/notifications/utils/inboxMerge.ts:1) correlates rows
in this order:

1. **`notification_id`** — identical on the push payload and the server row, so it is the
   only match guaranteed stable across delivery paths;
2. `id` / `server_id` when either side knows the other's id;
3. otherwise (the current backend payload, which has no `notification_id`) require the
   same `type` **and** a **subset** match on the business `data`.

### Why the business match is a *subset*, not equality

The FCM payload carries only the routing keys:

```json
{ "type": "shift.assigned", "shift_id": "42" }
```

The server row's `data` is the full `toArray()` bag — a **strict superset**:

```json
{ "type": "shift.assigned", "shift_id": 42, "date": "2026-09-14",
  "start_time": "09:00", "end_time": "17:00", "title": "New shift assigned",
  "body": "You have been assigned a shift on 14 Sep 2026…" }
```

The original check required **identical key counts**, so the two never matched: the push
row survived and the server row was added beside it — **two rows for one event**. Matching
the smaller bag against the larger one is correct by construction: the push payload is
always a subset of the server data, and two different events of the same type still differ
on their business id (`shift_id`/`roster_id`/`leave_request_id`).

The `type` key is compared separately and then **excluded** from the `data` comparison: a
push-materialised row keeps `type` inside `data` (the backend puts it there so a data-only
message is self-describing), whereas a server row carries `type` as a first-class field and
omits it from `data`.

A redelivered FCM message therefore refreshes one row instead of stacking duplicates,
and a later `GET /notifications` collapses the pending row into its server twin.

> **Self-healing:** duplicates already persisted on disk from before this fix are
> collapsed automatically on the next successful sync — the push row matches its server
> twin and is dropped. No manual cache clear is required; opening the inbox (or a
> reconnect) is enough.

> **Guard:** rows that both carry a `server_id` are compared on that id alone. Two
> genuinely different notifications can share `type` + `data`, and treating them as one
> would silently delete a notification. This was a real bug caught by
> [`inboxMerge.test.ts`](src/features/notifications/utils/__tests__/inboxMerge.test.ts:1).

## Duplicate prevention

The original design derived local identity from the FCM `messageId`, which is assigned
**per delivery**. The background copy and the tap copy of one event therefore carried
different ids and materialised two rows; a later server sync could not always collapse
them because the business-key fallback is fragile. Three changes remove the possibility:

1. **Canonical identity.** [`localIdForMessage`](src/services/push/pushService.ts:1) keys
   on `notification_id` first. The FCM `messageId` is never used while a business key is
   present, so two deliveries of one event resolve to the same row.
2. **Taps do not persist.** `onNotificationOpenedApp` and `getInitialNotification` only
   *route*; the row comes from the server sync the tap triggers
   ([`usePushNotifications`](src/services/push/usePushNotifications.ts:1)). A tap can no
   longer create an independent record.
3. **Hydrate before write.** Every mutating store action calls `ensureLoaded` first, so a
   push delivered to a freshly-launched headless process merges into the persisted inbox
   instead of overwriting it with a one-row list.

`upsertItem` is idempotent on the canonical id and preserves a local read when the same
notification is redelivered, so repeated FCM delivery cannot resurrect a read row either.

## Conflict resolution

| Situation | Result | Why |
| --- | --- | --- |
| Local `read_at` set, server says unread | **Local read wins** | The user read it; the write may simply not have landed yet. Reverting would flip a notification back to bold. |
| Local unread, server says read | **Server read wins** | Read on another device. |
| Server page arrives | Pending push-only rows are **retained** | They have not been confirmed yet; discarding them loses content. |
| Server page contains the push row's twin | Push row is **dropped**, server row adopted | The server is the source of truth; keeping both is the duplicate defect. |
| A pending push arrives for a server-confirmed row | **Server row wins** | A push must never downgrade a confirmed row back to `pending`. |
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
sends via [`FcmMessage`](../staff-sass-last17/app/Notifications/Messages/FcmMessage.php:1):

```json
{
  "type": "shift.assigned",
  "shift_id": "42",
  "title": "Shift assigned",
  "body": "You have a shift on Monday"
}
```

`title`/`body` are stripped from the stored `data` bag (they are rendered as fields), so
the bag retains only business keys — which is what the identity fallback compares.

> **Current backend payload has no `notification_id`.** The client therefore relies on the
> `type` + business-key **subset** match to collapse a push row into its server twin. This
> is correct for every current notification class, because each carries a distinct business
> id (`shift_id`/`roster_id`/`leave_request_id`).
>
> **Recommended backend improvement:** add `notification_id` (the `notifications` table
> id) to the FCM data bag. It makes identity exact rather than inferred, and removes the
> only case the subset match cannot separate — two genuinely different notifications that
> share `type` and the same business id.

## Testing

```bash
npx jest src/features/notifications
```

- `inboxMerge` — deserialisation of hostile payloads, merge/precedence rules, canonical
  `notification_id` identity, idempotent redelivery, identity collision guard, capacity
  cap, idempotent read marking, unread counting.
- `notificationInboxStore` — hydrate, cross-user discard, merge + persist round-trip,
  push receipt, headless-write hydration guard, idempotent receipt, reset.
- `pushBackground` / `pushForeground` — the delivery paths persist; the tap paths route
  without inserting a row; repeated delivery of one `notification_id` yields one row.

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
| **App swiped/terminated, tap the push** | **Exactly one** row for the event |
| **Device offline → online, tap the push** | **Exactly one** row for the event |
| **Repeated FCM delivery of one event** | **Exactly one** row; a read row stays read |
| **Tap a push, then open the inbox** | The tap syncs the server; no second row is inserted |

## Known limitations

1. **Outbound writes now have a durable queue.** A read performed offline is written
   locally *and* enqueued in the durable outbox
   ([`src/services/outbox/`](src/services/outbox/outboxStore.ts:1)), which retries it
   until the server accepts it — see [`docs/mutation-policy.md`](mutation-policy.md). The
   remaining caveat is propagation, not durability: a read on device A does not appear on
   device B until B syncs *and* A's queued write has reached the server.
2. **Single page.** The store mirrors the 30-row first page the screen requests, capped
   at 200 items. There is no local pagination. The reconnect sync requests up to 50 rows
   after the watermark, which is a gap fetch rather than pagination.
3. **`pending` rows are dated from the push event**, not from a server timestamp, so a
   long-offline device may order a pending row slightly differently than the server
   would. This resolves on the first successful sync.
4. **The `since` cursor is a client-side contract.** The backend must honour
   `GET /notifications?since=<iso>` by returning only rows created after that instant. If
   it ignores the parameter, the sync still works — it simply re-fetches the first page and
   the merge deduplicates — but it loses the efficiency of a gap fetch.
5. **`notification_id` is required in the FCM payload.** It is the canonical identity. A
   payload without it still works for a single event (business-key fallback) but cannot be
   distinguished from a different notification that shares `type` + `data`.

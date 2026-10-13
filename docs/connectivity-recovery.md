# Connectivity recovery

## The problem

The app previously retried only when `AppState` became `active`. That misses the common
case of a device that **stays in the foreground** while the network drops and comes back —
a lift, a tunnel, flaky factory-floor Wi-Fi. Nothing re-registered the push token, flushed
the outbox, or reconciled the inbox, because no foreground event ever fired.

This document describes the connectivity coordinator that closes that gap.

## Architecture

```
   NetInfo (OS)                 ┌────────────────────────────────────────────┐
   ────────────►  offline→online│  connectivityCoordinator                    │
                    edge        │   • debounce (connection must be stable)    │
                                │   • single-flight with re-arm               │
                                └───────────────────┬────────────────────────┘
                                                    │ runRecoveryPipeline()
                                                    ▼
                                ┌────────────────────────────────────────────┐
                                │  1. refresh session   (GET /auth/me)        │
                                │  2. flush durable outbox                    │
                                │  3. register/refresh FCM token              │
                                │  4. reconcile notification inbox (cursor)   │
                                └───────────────────┬────────────────────────┘
                                                    │ onRecovered(result)
                                                    ▼
                                React Query invalidation (notifications,
                                availability, shifts, rosters, leave)
```

## Why an ordered pipeline

Each step depends on the one before it:

1. **Refresh the session** — a reconnect is the moment a stale cached user can be
   revalidated. Until `/auth/me` succeeds the session is `authenticated-offline`, and the
   outbox flush (a write) refuses to run against an unvalidated session.
2. **Flush the durable outbox** — queued writes (mark-read, availability, deferred push
   registration) are replayed now that a validated connection exists.
3. **Register/refresh the FCM token** — a token that failed to register while offline is
   retried; the backend upserts, so this is idempotent.
4. **Reconcile the notification inbox** — fetch the server rows created while the device
   was offline, using the inbox watermark as a cursor, and merge them into the local inbox.

Cache invalidation is the caller's job, because it needs the React Query client, which the
pipeline deliberately does not import.

## Failure isolation

Every step is individually guarded. A failure in one step is logged and the pipeline
continues: a failed session refresh must not prevent the inbox from reconciling, and a
failed inbox sync must not leave the outbox unflushed. `runRecoveryPipeline` never throws.

## Debounce and single-flight

NetInfo emits a burst of states while a connection settles (Wi-Fi associating, then DHCP,
then reachability). Running the pipeline on the first `isConnected: true` would fire
against a half-up network and fail. The transition is therefore debounced by
[`RECOVERY_DEBOUNCE_MS`](../src/services/connectivity/connectivityCoordinator.ts:1)
(1.5 s).

Only one recovery runs at a time. If another offline → online edge occurs while a run is
in flight, a follow-up run is scheduled rather than dropped, so a flapping connection still
converges.

## The notification cursor

The inbox store keeps a `watermark` — the newest server `created_at` it has seen. The
reconnect sync requests `GET /notifications?since=<watermark>`, so a device that was
offline for a week fetches only the gap. On a first-ever sync the watermark is `null` and
the request omits the cursor, which the backend treats as "from the beginning".

Rows that arrived by push while the app was running were materialised locally with a
`push:` id and `pending: true`. [`mergeServerPage`](../src/features/notifications/utils/inboxMerge.ts:1)
matches them to their server twin on `type` + business `data` and adopts the server row, so
a notification that was both pushed and later fetched does not appear twice.

## Push is transport, not durable state

The server's notification table is the system of record. A device that was offline (or
force-stopped) while the backend emitted an event never received the FCM message, so the
only way the inbox can become correct again is to ask the server what it missed. That is
what step 4 does.

If the requirement is specifically to show a notification **at the moment the device
reconnects**, that decision cannot be made reliably by the mobile client alone. The correct
model is a backend job/event: persist the business event, record delivery status per
device, and send FCM when the device is reachable/registered. The client's reconnect sync
remains the fallback for missed pushes.

## Files

| File | Role |
| --- | --- |
| [`src/services/connectivity/connectivityCoordinator.ts`](../src/services/connectivity/connectivityCoordinator.ts:1) | NetInfo subscription, debounce, single-flight. |
| [`src/services/connectivity/recoveryPipeline.ts`](../src/services/connectivity/recoveryPipeline.ts:1) | The ordered, failure-isolated pipeline. |
| [`src/services/connectivity/connectivityStore.ts`](../src/services/connectivity/connectivityStore.ts:1) | Observable `isOnline` / `isRecovering` state. |
| [`src/services/connectivity/useConnectivity.ts`](../src/services/connectivity/useConnectivity.ts:1) | Root hook: starts the coordinator, invalidates queries. |
| [`src/features/notifications/sync/syncNotifications.ts`](../src/features/notifications/sync/syncNotifications.ts:1) | Cursor-based server reconciliation. |

## Testing

```bash
npx jest src/services/connectivity src/features/notifications/sync
```

- `recoveryPipeline` — step ordering and failure isolation.
- `connectivityCoordinator` — offline → online edge triggers recovery once, debounced;
  no transition means no recovery; a flap cancels the pending run; stop() detaches.
- `syncNotifications` — cursor omitted on first sync, gap requested afterwards, push row
  deduplicated against its server twin, failure swallowed.

NetInfo has no native module under Jest, so
[`jest/netinfo.mock.js`](../jest/netinfo.mock.js:1) provides a controllable listener and is
wired in [`jest.config.js`](../jest.config.js:1).

## Manual verification checklist

| Scenario | Expected |
| --- | --- |
| Airplane mode on, then off while the app stays open | After ~1.5 s the outbox flushes, the token re-registers, and the inbox reconciles |
| Notification created while offline | Appears in the inbox after reconnect, without a push |
| Notification both pushed and later fetched | One row, not two |
| Connection flaps on/off rapidly | Recovery runs once per settled online period, not per flap |
| Reconnect while signed out | No recovery work; nothing is sent |

## Related

- [`docs/push-reliability.md`](push-reliability.md) — the three delivery paths.
- [`docs/offline-notification-inbox.md`](offline-notification-inbox.md) — the local inbox.
- [`docs/mutation-policy.md`](mutation-policy.md) — the durable outbox.

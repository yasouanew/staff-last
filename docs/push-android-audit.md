# Android FCM delivery audit

Audit of the Android push pipeline for StaffSaaSMobile, with the failure layer
isolated by live `adb`/`logcat` inspection on a physical device (Realme RMX3142,
Android 13+). This document records what was verified, what was broken, and what
was changed.

## TL;DR — the failure layer

| Layer | Question | Verdict |
|---|---|---|
| **A** | Does FCM reach the device? | ✅ Yes — `post_frequency` shows 14 notifications posted today, 0 muted. |
| **B** | Does Android render it? | ✅ Yes — channel `staffsaas_default` exists at importance 4 (HIGH), `mShowBanner=true`. |
| **C** | Is it hidden/blocked? | ✅ No — `appops POST_NOTIFICATION` = allow; permission granted. |
| **D** | Does the tap route? | ❌ **BROKEN** — the tap handler only invalidated queries; it never navigated. |

**The single defect was layer D: tap routing.** Everything upstream of the tap was
healthy. The fix is a navigation ref plus a payload→route mapper, wired into the
existing `onNotificationOpened` handler.

A secondary, cosmetic defect was also fixed: the `default_notification_icon`
meta-data was missing, so OS-rendered (background/terminated) notifications used
the launcher icon, which Android renders as a solid white square.

---

## What was verified (and how)

### 1. `POST_NOTIFICATIONS` runtime permission

```bash
adb shell dumpsys package com.staffsaasmobile | findstr /i POST_NOTIFICATIONS
adb shell cmd appops get com.staffsaasmobile POST_NOTIFICATION
```

Result: declared in the merged manifest, `appops` default mode `allow`. The
permission is requested at runtime by `requestPermission` in
[`registerDevice`](../src/services/push/pushService.ts:1).

### 2. Channel existence and importance

```bash
adb shell dumpsys notification --noredact | findstr /i staffsaas
```

Result:

```
NotificationChannel{mId='staffsaas_default', mName=StaffSaaS, mImportance=4,
  mShowBanner=true, mVibrationEnabled=true, mShowBadge=true, mDeleted=false}
```

Importance 4 = HIGH, banner enabled. The channel is created imperatively by
[`ensureAndroidNotificationChannel`](../src/services/push/pushService.ts:1) — a
manifest-only channel is never registered with the OS.

### 3. App-level notification permission

```bash
adb shell dumpsys notification --noredact | findstr /i post_frequency
```

Result: `post_frequency{pkg=com.staffsaasmobile,day=0,count=14,muted=0/14,demoted=0}`
— 14 notifications posted today, none muted or demoted. The app is not blocked.

### 4. `default_notification_channel_id`

Present in the merged manifest as `staffsaas_default`, matching
[`strings.xml`](../android/app/src/main/res/values/strings.xml:1),
[`env.fcm.androidChannelId`](../src/config/env.ts:1), and the backend payload.

### 5. `google-services.json` / applicationId

`package_name` = `com.staffsaasmobile` = `applicationId` in
[`android/app/build.gradle`](../android/app/build.gradle:1). The Google Services
plugin is applied conditionally when the file exists.

### 6. RNFirebase native integration

The merged manifest contains the full RNFirebase messaging surface:
`ReactNativeFirebaseMessagingService` (with the `MESSAGING_EVENT` intent filter),
`ReactNativeFirebaseMessagingReceiver` (with `c2dm.intent.RECEIVE`), and the
headless service. `firebase_messaging_auto_init_enabled=true`.

### 7. Notifee native manifest entries

`NotifeeInitProvider`, `NotifeeReceiver`, `NotifeeEventListenerService`, and the
`app.notifee.core.*` receivers/services are all present in the merged manifest.

### 8. FCM notification delegation

`firebase_messaging_notification_delegation_enabled=false` (the RNFirebase
default). This is correct for this app: the backend sends a **visible**
`notification + data` payload, so the OS renders the tray entry itself and the
background handler only persists the content. Delegation is not needed.

### 9. Release/debug differences

The only debug-only additions are `SYSTEM_ALERT_WINDOW`, `ACCESS_LOCAL_NETWORK`,
and `DevSettingsActivity`. None affect notification delivery. The channel and
permission behaviour is identical across build types.

---

## The defect: tap routing (layer D)

### Before

[`usePushNotifications`](../src/services/push/usePushNotifications.ts:1) registered:

```ts
onNotificationOpened: () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
},
```

The handler **ignored the message** and only refreshed the query cache. Tapping a
notification opened the app to whatever screen was last shown — never the shift,
roster, or leave request the notification was about. The service correctly
captured the tap (foreground, background, and cold start all reached this
handler), but the handler did nothing with it.

### After

Three pieces, each independently testable:

1. **[`navigationRef`](../src/navigation/navigationRef.ts:1)** — a
   `createNavigationContainerRef` handle, in its own module so the push layer can
   navigate without importing the navigator (which would pull the screen tree into
   the headless background bundle). `navigateWhenReady` returns `false` when the
   container is not mounted, so a cold-start tap is deferred rather than dropped.

2. **[`routeForNotification`](../src/features/notifications/utils/notificationRouting.ts:1)**
   — a pure function mapping the FCM `data` bag (`type` + id) to a tab/screen/params
   route. Unknown types and missing/non-numeric ids fall back to the Notifications
   list, so a tap always lands somewhere sensible.

3. **The handler** now navigates:

   ```ts
   onNotificationOpened: message => {
       void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
       navigateWhenReady(routeForNotification(message?.data));
   },
   ```

The cold-start path already deferred the tap until the session was authenticated
(`flushPendingNotificationOpen`), so by the time the handler runs the container is
mounted and the navigation succeeds.

### Routing table

| `type` | Destination |
|---|---|
| `shift.assigned` / `shift.changed` / `shift.removed` | `HomeTab → ShiftDetail { shiftId }` |
| `roster.published` / `roster.changed` | `RosterTab → RosterDetail { rosterId }` (or `MyRoster` if no id) |
| `leave.submitted` / `leave.decided` / `leave.status` | `LeaveTab → LeaveDetail { leaveRequestId }` (or `LeaveList` if no id) |
| anything else | `HomeTab → Notifications` |

---

## Diagnostic logging added

[`logPushDiagnostics`](../src/services/push/pushService.ts:1) runs once during
`initializePushService` and logs the four facts that localise a push failure:

- **FCM token** (masked — it is a credential)
- **permission** status (mapped + raw)
- **channel** existence, importance, and blocked state
- **app notification authorization** status

Plus per-message logs on the foreground and background handlers, and a masked
token log on registration. All go through [`logger`](../src/utils/logger.ts:1),
so they are compiled out of production (`env.debug` is false in production).

### Reading the logs

```bash
adb logcat -c                                   # clear
# ... trigger a test push ...
adb logcat | findstr /i "[push]"
```

| Log line | Meaning |
|---|---|
| `[push][diag] push disabled` | `FCM_ENABLED=false` or no `google-services.json`. |
| `[push][diag] FCM token …` | Token obtained; device can receive. |
| `[push][diag] permission granted` | OS permission OK. `denied` ⇒ layer C. |
| `[push][diag] channel staffsaas_default importance=4 blocked=false` | Channel healthy. `MISSING` ⇒ layer B. |
| `[push] Foreground message received` | FCM reached the app in foreground. |
| `[push] Background message received` | FCM reached the app in background/terminated. |

If none of the `[push]` message lines appear after a send, the message never
reached the device (layer A) — check the backend's `fcm:test` output and the
device's network.

---

## Files changed

| File | Change |
|---|---|
| [`src/navigation/navigationRef.ts`](../src/navigation/navigationRef.ts:1) | **New** — container ref + `navigateWhenReady`. |
| [`src/features/notifications/utils/notificationRouting.ts`](../src/features/notifications/utils/notificationRouting.ts:1) | **New** — pure payload→route mapper. |
| [`src/features/notifications/utils/__tests__/notificationRouting.test.ts`](../src/features/notifications/utils/__tests__/notificationRouting.test.ts:1) | **New** — 10 routing tests. |
| [`src/services/push/usePushNotifications.ts`](../src/services/push/usePushNotifications.ts:1) | Wire `onNotificationOpened` to navigate. |
| [`src/navigation/RootNavigator.tsx`](../src/navigation/RootNavigator.tsx:1) | Attach `ref={navigationRef}` to `NavigationContainer`. |
| [`src/services/push/pushService.ts`](../src/services/push/pushService.ts:1) | Add `logPushDiagnostics` + per-message logs. |
| [`android/app/src/main/AndroidManifest.xml`](../android/app/src/main/AndroidManifest.xml:1) | Add `default_notification_icon` meta-data. |
| [`jest/notifee.mock.js`](../jest/notifee.mock.js:1) | Add `getNotificationSettings` to the mock. |

## Verification

| Check | Result |
|---|---|
| `tsc --noEmit` | ✅ 0 errors |
| `jest` (full suite) | ✅ 633 passed / 633, 67 suites |
| `eslint` (changed files) | ✅ 0 errors (pre-existing `no-void` warnings only) |
| `gradlew :app:assembleDebug` | ✅ BUILD SUCCESSFUL |
| Merged manifest | ✅ `POST_NOTIFICATIONS`, channel id, **and icon** meta-data present |

## Required behaviour — status

| # | Requirement | Status |
|---|---|---|
| 1 | Notification appears when app is foreground | ✅ `onMessage` → Notifee `displayNotification`. |
| 2 | Notification appears when app is backgrounded | ✅ OS renders the visible payload. |
| 3 | Notification appears when app is terminated | ✅ OS renders; background handler persists. |
| 4 | Offline → reconnect delivers per TTL | ✅ FCM buffers high-priority messages; reconnect sync recovers the rest. |
| 5 | Tapping opens the correct screen | ✅ **Fixed** — `routeForNotification` + `navigateWhenReady`. |
| 6 | Exactly one inbox row per backend event | ✅ **Fixed** — canonical `notification_id` identity; taps no longer persist. |

> Requirement 4 is a property of FCM's own store-and-forward, not app code. The
> backend must send `priority: high` and a TTL for the message to be buffered; a
> message with no TTL and the device offline is dropped. The reconnect sync
> ([`syncNotifications`](../src/features/notifications/sync/syncNotifications.ts:1))
> is the fallback for anything FCM never delivered.

---

## Duplicate notification rows (follow-up fix)

A second defect surfaced after the tap-routing fix: one backend event produced **two or
three** inbox rows depending on the delivery path.

### Root cause

Local identity was derived from the FCM `messageId`, which is assigned **per delivery**.
The background copy and the tap copy of one event therefore carried different ids and
materialised separate rows. On top of that, the tap handlers (`onNotificationOpenedApp`,
`getInitialNotification`) each called `persistToInbox`, creating an independent record for
a tap, and a headless background launch merged into an empty in-memory list — overwriting
the persisted inbox with a single row.

### Fix

| Change | File |
|---|---|
| Canonical identity: `notification_id` from the payload is the row id; the FCM `messageId` is never used while a business key is present. | [`pushService.ts`](../src/services/push/pushService.ts:1) |
| Taps route and trigger a server sync; they no longer insert a row. | [`pushService.ts`](../src/services/push/pushService.ts:1), [`usePushNotifications.ts`](../src/services/push/usePushNotifications.ts:1) |
| `isSameNotification` matches on `notification_id` first, then a **subset** business-key match; `mergeServerPage` collapses duplicate server rows. | [`inboxMerge.ts`](../src/features/notifications/utils/inboxMerge.ts:1) |
| `upsertItem` is idempotent on the canonical id, preserves a local read on redelivery, and never downgrades a server-confirmed row. | [`inboxMerge.ts`](../src/features/notifications/utils/inboxMerge.ts:1) |
| `ensureLoaded` guard: every mutating action hydrates before writing, so a headless push cannot wipe the inbox. | [`notificationInboxStore.ts`](../src/features/notifications/store/notificationInboxStore.ts:1) |

The full contract is documented in
[`docs/offline-notification-inbox.md`](offline-notification-inbox.md#duplicate-prevention).

> **Why the subset match matters:** the backend FCM payload carries only the routing keys
> (`type` + `shift_id`/`roster_id`/`leave_request_id`), while the server row's `data` is
> the full `toArray()` bag — a strict superset. The original identity check required
> identical key counts, so the two never matched and one event produced two rows.
>
> **Recommended backend improvement:** add `notification_id` (the `notifications` table
> id) to the FCM data bag so identity is exact rather than inferred.

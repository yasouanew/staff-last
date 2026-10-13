# Online Push Notifications — Setup & Handover

This document covers the **online** (FCM transport) push notification path:
backend → Firebase Cloud Messaging → mobile device.

> **There is now a local offline inbox.** A push is persisted into a device-local
> inbox so its content survives a dismissed tray entry and is readable with no
> network. The server's `notifications` table remains the system of record, and a
> reconnect sync reconciles the two. See
> [`docs/offline-notification-inbox.md`](offline-notification-inbox.md) and
> [`docs/connectivity-recovery.md`](connectivity-recovery.md).

---

## The five steps

| # | Step | Status |
|---|------|--------|
| 1 | Audit the backend FCM sending stack | ✅ Done |
| 2 | Agree on the Android notification channel id | ✅ Done |
| 3 | Fix the APNs / FCM v1 payload for iOS | ✅ Done |
| 4 | Add test tooling for physical-device verification | ✅ Done |
| 5 | Re-validate mobile + document iOS pod install / APNs console | ✅ Done (iOS steps are macOS-only, see below) |

---

## Step 1 — Backend FCM stack (audit result)

**Package:** `kreait/laravel-firebase` ^7.2 (wraps `kreait/firebase-php` 7.x).

**Components:**

| File | Role |
|------|------|
| [`config/firebase.php`](../config/firebase.php) | Firebase project + FCM defaults |
| [`app/Notifications/Channels/FcmChannel.php`](../app/Notifications/Channels/FcmChannel.php) | Resolves tokens, builds payloads, sends |
| [`app/Notifications/Messages/FcmMessage.php`](../app/Notifications/Messages/FcmMessage.php) | Title/body/data value object |
| [`app/Services/DeviceTokenService.php`](../app/Services/DeviceTokenService.php) | Register/unregister tokens |
| [`app/Http/Controllers/Api/DeviceTokenController.php`](../app/Http/Controllers/Api/DeviceTokenController.php) | `POST`/`DELETE /api/v1/device-tokens` |

**Notifications that push** (all implement `toFcm()`):

- `ShiftAssignedNotification`
- `RosterPublishedNotification`
- `RosterChangeNotification`
- `LeaveRequestSubmittedNotification`
- `LeaveRequestStatusNotification`

**What was wrong:** `FcmChannel` sent a bare `notification + data` message with
no `AndroidConfig` and no `ApnsConfig`. This is the single most common cause of
"push works on iOS but not Android (or arrives silently)" in React Native apps.

---

## Step 2 — Android notification channel id

On **Android 8.0+**, a notification posted to a channel that does not exist is
routed to the FCM SDK's own `fcm_fallback_notification_channel`, which has
default importance — no heads-up banner, no sound. The notification is not lost,
it just looks broken.

The channel id must be identical in **four** places. All four now read
`staffsaas_default`:

| # | Location | Value |
|---|----------|-------|
| 1 | Mobile `.env` → `FCM_ANDROID_CHANNEL_ID` | `staffsaas_default` |
| 2 | Mobile `android/app/src/main/res/values/strings.xml` → `default_notification_channel_id` | `staffsaas_default` |
| 3 | Mobile `src/config/env.ts` fallback | `staffsaas_default` |
| 4 | Backend `.env` → `FIREBASE_ANDROID_CHANNEL_ID` | `staffsaas_default` |

**Why all four are needed:**

- **#2** is the *manifest* default — it tells the SDK which channel to use when
  the message does not name one.
- **#1/#3** is the *runtime* channel the app actually **creates** via Notifee in
  [`ensureAndroidNotificationChannel()`](src/services/push/pushService.ts:88).
  A channel only exists once the app creates it. The manifest alone never
  registers a channel.
- **#4** is the *payload* — `AndroidConfig.notification.channel_id`, sent per
  message. An explicit payload value **overrides** the manifest default, so if
  these disagree, Android receives a channel id that may not exist.

> Changing the channel id after release creates a *new* channel. Android users
> who customised the old channel's importance will need to re-customise the new
> one. Pick the id once and treat it as permanent.

Backend config lives in [`config/firebase.php`](../config/firebase.php) under the
`fcm` key and is env-driven, so it can be changed without a code deploy.

---

## Step 3 — iOS / APNs payload

The backend now sends a full `ApnsConfig`:

```json
{
  "headers": { "apns-priority": "10" },
  "payload": {
    "aps": {
      "alert": { "title": "...", "body": "..." },
      "sound": "default",
      "content-available": 1,
      "thread-id": "roster.published",
      "interruption-level": "time-sensitive"
    }
  }
}
```

| Field | Why it matters |
|-------|----------------|
| `apns-priority: 10` | Delivers immediately. Default `5` lets iOS defer to save power. |
| explicit `alert` dictionary | Guarantees the visible banner. Without it iOS may treat the push as silent. |
| `content-available: 1` | Wakes the app so React Query can refresh its cache. |
| `thread-id` | Groups related alerts (e.g. all roster updates) in Notification Centre. Defaults to the notification `type`. |
| `interruption-level` | `time-sensitive` lets shift/roster changes break through Focus modes. |

> `time-sensitive` degrades gracefully — if the iOS target lacks the Time
> Sensitive Notifications capability, iOS ignores the key rather than dropping
> the notification.

All values are overridable via `FIREBASE_APNS_*` env vars. The complete payload
is asserted by [`tests/Unit/Services/FcmChannelPayloadTest.php`](../tests/Unit/Services/FcmChannelPayloadTest.php)
so a refactor cannot silently remove these keys again.

---

## Step 4 — Device test tooling

A new artisan command exists:

```bash
# Push to every active token of a user
php artisan fcm:test 12
php artisan fcm:test user@example.com

# Restrict to one platform
php artisan fcm:test 12 --platform=android

# Bypass the database entirely
php artisan fcm:test --token="<fcm-registration-token>"

# Inspect without sending
php artisan fcm:test 12 --dry-run

# Custom copy
php artisan fcm:test 12 --title="Test" --body="Hello"
```

It reuses the real `FcmChannel`, so the payload is byte-for-byte identical to
production. When no token matches it prints the most recent registered tokens to
help diagnose targeting.

---

## Step 5 — Remaining manual work

Everything below requires a **macOS machine**, the **Firebase console**, or the
**Apple Developer portal**. None of it can be automated from Windows.

### 5a. iOS pods (macOS required)

```bash
cd ios && pod install
```

Open `ios/StaffSaaSMobile.xcworkspace` (**not** `.xcodeproj`) afterwards.

### 5b. Apple Developer portal

1. Create an **APNs Authentication Key** (.p8) under *Keys*.
2. Note the **Key ID** and your **Team ID**.
3. Upload the key to Firebase: *Project settings → Cloud Messaging → APNs
   Authentication Key*.

The `.p8` key is preferred over a `.p12` certificate because it never expires
and works for both sandbox and production.

### 5c. Xcode capabilities

Confirm both are enabled on the app target (the project file already declares
them, Xcode should match):

- **Push Notifications**
- **Background Modes → Remote notifications**

### 5d. Physical device test

Push notifications **do not work on the iOS Simulator**. A real iPhone is
required, paired with an `aps-environment: development` provisioning profile.

```bash
# find your token
#   add a log of the FCM token from getToken(), or
#   check the device_tokens table after logging in

php artisan fcm:test --token="<your-token>"
```

Expected results:

| Platform | Expected |
|----------|----------|
| Android (foreground) | Heads-up banner, sound, grouped under "StaffSaaS" |
| Android (background) | Banner in notification shade, tapping opens the app |
| Android (app killed) | Banner appears, tap cold-starts the app |
| iOS (foreground) | Banner only if `setForegroundNotificationPresentationOptions` allows it |
| iOS (background/killed) | Banner in Notification Centre |

### 5e. Production checklist

- [ ] Move the service account JSON out of the repo root into secret storage.
      It is currently untracked by git, but a stray `git add .` would commit it.
- [ ] Set `FIREBASE_CREDENTIALS` to an absolute path or a secret-mounted path in
      production.
- [ ] Run `php artisan config:cache` after setting env vars.
- [ ] Ensure a queue worker is running — all five push notifications implement
      `ShouldQueue`, so nothing is sent without one.
- [ ] Change the Android channel id **only** if you accept that existing users
      lose their per-channel customisations.

---

## Offline behaviour

- FCM is a **transport only**. The system of record is the backend `notifications`
  table, read via `GET /api/v1/notifications`.
- When a push arrives, the app **persists the payload into a device-local inbox**
  (AsyncStorage) *and* invalidates React Query caches. The inbox is what the
  notification screen renders, so it works with no network.
- A push that arrives while the device is offline is buffered by FCM (up to 4
  weeks for a high-priority message with a TTL) and delivered on reconnect. A
  message with no TTL and the device offline is dropped.
- A notification the device never received by push is recovered by the reconnect
  sync, which fetches `GET /notifications?since=<watermark>` and merges the gap
  into the local inbox.

See [`docs/offline-notification-inbox.md`](offline-notification-inbox.md) for the
inbox and [`docs/connectivity-recovery.md`](connectivity-recovery.md) for the
reconnect pipeline.

---

## Native prerequisites verification

These are the platform-level requirements that must hold for a push to be
delivered at all. They are **independent of the app code** and each fails
silently, so verify them separately when push "does not work".

| # | Prerequisite | How to verify | Failure symptom |
|---|--------------|---------------|-----------------|
| 1 | **Firebase config present** | `android/app/google-services.json` and `ios/StaffSaaSMobile/GoogleService-Info.plist` exist, and `FCM_ENABLED=true` in the build's `.env`. | `env.fcm.enabled` is false; every push entry point short-circuits. |
| 2 | **Android notification channel registered** | The app calls `ensureAndroidNotificationChannel()` on init; the id matches `FCM_ANDROID_CHANNEL_ID` and the backend's `FIREBASE_ANDROID_CHANNEL_ID`. | Android 8+ routes to the fallback channel: no heads-up banner, no sound. |
| 3 | **Android 13+ runtime permission** | `POST_NOTIFICATIONS` is in the merged manifest **and** the user granted it. | Notifications are silently dropped; `hasPermission` reports `denied`. |
| 4 | **iOS Push Notifications capability** | Xcode → target → Signing & Capabilities → *Push Notifications* is present. | No APNs registration; `getToken()` never resolves. |
| 5 | **iOS Background Modes → Remote notifications** | Same screen → *Background Modes* → *Remote notifications* checked. | Data-only messages never wake the app. |
| 6 | **APNs key uploaded to Firebase** | Firebase console → Project settings → Cloud Messaging → APNs Authentication Key. | iOS delivery fails while Android works. |
| 7 | **Backend payload has platform blocks** | `FcmChannel` sends `AndroidConfig.notification.channel_id` and a full `ApnsConfig` (see Step 3). | Android silent / iOS silent, depending on which block is missing. |
| 8 | **Queue worker running** | All five push notifications implement `ShouldQueue`. | Nothing is ever sent; no error is surfaced. |

> **Force-stopped apps do not run JavaScript.** Android and iOS may deliver a
> visible notification without invoking the background handler. The durable record
> is the server's notification table, and the reconnect sync is the fallback — do
> not treat the background handler as guaranteed to run.

---

## Verification performed

| Check | Result |
|-------|--------|
| Backend FCM payload runtime inspection | ✅ `channel_id: staffsaas_default`, `priority: high`, `apns-priority: 10` |
| Firebase credential resolution | ✅ Resolves to `staff-scheduling-277c9` service account |
| Backend unit tests (payload) | ✅ 8 passed, 12 assertions |
| Backend full suite | ✅ No new failures (pre-existing failures confirmed identical on stashed baseline) |
| Mobile Jest | ✅ 192 passed / 192, 25 suites |
| Mobile ESLint | ✅ 0 errors |
| Android `assembleDebug` | ✅ BUILD SUCCESSFUL |
| Merged manifest | ✅ `POST_NOTIFICATIONS`, channel metadata, `MESSAGING_EVENT` service present |

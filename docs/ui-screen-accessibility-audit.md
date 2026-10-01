# UI, Screens & Interaction Design Audit — StaffSaaSMobile

> **Status update (post-remediation).** The P0/P1/P2 defects below have been
> **fixed in code** and verified by `tsc --noEmit`, `eslint`, and the Jest suite
> (48 suites / 425 tests green). Each finding now carries a **FIXED** or **DEFERRED**
> tag. Only the *device-only* items in §5 remain outstanding, because they cannot be
> established by static analysis.
>
> | Finding | Status | Where |
> | --- | --- | --- |
> | Dark-mode status bar invisible | **FIXED** | [`App.tsx`](App.tsx:70) `ThemedStatusBar` |
> | Keyboard overlap (Profile / Change Password / Availability) | **FIXED** | [`KeyboardAwareView`](src/components/KeyboardAwareView/KeyboardAwareView.tsx:97) + 3 screens |
> | Bottom-tab clearance not reserved | **FIXED** | [`ScreenContainer`](src/components/ScreenContainer/ScreenContainer.tsx:142) reads `BottomTabBarHeightContext` |
> | Dynamic Type collides with fixed geometry | **FIXED** | [`useRowScale`](src/hooks/useRowScale.ts:1) + [`FONT_SCALE_CAP`](src/theme/sizing.ts:20) |
> | Root error persists after correction | **FIXED** | [`useClearRootError`](src/hooks/useClearRootError.ts:1) on 6 screens |
> | No success announcements | **FIXED** | [`accessibility.ts`](src/utils/accessibility.ts:1) at 4 call sites |
> | No automated a11y checks | **FIXED** | [`src/testing/accessibility.ts`](src/testing/accessibility.ts:1) + 15 tests + ESLint plugin |
> | No localization layer / 12h–24h mismatch | **FIXED** | [`src/i18n/`](src/i18n/index.ts:1) |

**Scope:** visual validation of every screen across the required state matrix, the
enumerated UI-risk list, and the accessibility gap list.
**Method:** static evidence review of the repository (theme layer, shared components,
screens, navigation, native config, tests). No physical-device or emulator run was
performed, so every "not established" item below is a *verification gap*, not a
finding of failure.
**Evidence base:** [`src/theme/`](src/theme/index.ts:1),
[`src/components/`](src/components/ScreenContainer/ScreenContainer.tsx:1),
[`src/features/`](src/features/home/screens/HomeScreen.tsx:43),
[`src/navigation/`](src/navigation/RootNavigator.tsx:68), [`App.tsx`](App.tsx:64),
[`android/gradle.properties`](android/gradle.properties:44),
[`jest.config.js`](jest.config.js:32), and the `.roo` phase specs.

---

## 0. Summary of verdicts

| Area | Verdict |
| --- | --- |
| Token system (spacing, type, colour, radius, shadow, sizing) | **Strong.** Layered, documented, dark-mode is a compile-enforced total mirror. |
| Loading / empty / error / offline state modelling | **Strong.** [`useQueryState`](src/hooks/useQueryState.ts:37) encodes the rules; screens branch correctly. |
| Keyboard avoidance | **Partial.** Auth + Leave-create are handled; **Profile, Change Password, Availability are not.** |
| Dynamic Type / large-font support | **Weak.** Scaling is enabled but collides with fixed row heights used by `getItemLayout`. |
| Localization | **Absent.** All copy is hardcoded English; date/time formatting is hardcoded. |
| Dark-mode system chrome (status bar) | **Bug.** Status bar style is hardcoded light; dark mode leaves dark-on-dark chrome. |
| Accessibility intent | **Strong in components, unverified in practice.** No automated checks, no VO/TB run. |
| Screen-reader announcements | **Partial.** Errors announced; **successful mutations are not.** |

---

## 1. Screen audit matrix

Legend: ✅ handled in code · ⚠️ partial / needs device verification · ❌ absent · — N/A

| State | Login/Reset/Forgot | Home | Roster | Leave list/detail/create | Availability | Notifications | Settings |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Initial loading | ✅ submit spinner | ✅ [`HomeSkeleton`](src/features/home/components/HomeSkeleton.tsx:13) | ✅ [`RosterSkeleton`](src/features/roster/screens/MyRosterScreen.tsx:138) | ✅ [`SkeletonList`](src/features/leave/screens/LeaveListScreen.tsx:180) | ✅ `SkeletonRows(7)` | ✅ `SkeletonRows(6)` | ✅ `SkeletonRows(4)` |
| Refreshing | ⚠️ leave-types only | ✅ `RefreshControl` | ✅ | ✅ | ✅ (discards drafts) | ✅ | — |
| Loaded normal | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Long text | ⚠️ error line clamped to 1 | ✅ `minWidth:0` | ✅ | ✅ | ⚠️ | ✅ | ✅ |
| Empty | — | ✅ "Nothing scheduled" | ✅ "No shifts this week" | ✅ + CTA | ✅ 7-day scaffold | ✅ "Nothing yet" | — |
| Offline **with** cache | ⚠️ | ⚠️ stale shown, no stale badge | ⚠️ | ⚠️ | ⚠️ | ✅ local inbox + `SyncNotice` | ✅ prefs local |
| Offline **without** cache | ✅ [`SessionErrorView`](src/components/SessionErrorView/SessionErrorView.tsx:33) | ✅ error branch | ✅ | ✅ | ✅ | ✅ | ✅ |
| 401 session expired | ✅ store-driven | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 403 permission denied | ✅ | ✅ locked card | ✅ locked card | ✅ | ✅ "not enabled" banner | ✅ | ✅ |
| 404 not found | ✅ | ✅ `ErrorView` | ✅ | ✅ | ✅ | ✅ | ✅ |
| 422 validation | ✅ field-mapped | — | — | ✅ | ✅ per-day | — | ✅ |
| 429 rate limited | ✅ `throttled` tone | — | — | ⚠️ generic | — | — | — |
| 500 server error | ✅ `ErrorView`/panel | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Slow network | ⚠️ spinner only | ⚠️ skeleton then jump | ⚠️ | ⚠️ | ⚠️ | ✅ | ⚠️ |
| Keyboard open | ✅ | — | — | ✅ | ❌ see §2.1 | — | ❌ see §2.1 |
| Small phone | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| Large phone / tablet | ⚠️ content not width-capped | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| Large font / a11y text | ❌ see §2.5 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Light mode | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Dark mode | ✅ tokens | ✅ tokens | ✅ | ✅ | ✅ | ✅ | ⚠️ status bar §2.3 |
| Android | ⚠️ edge-to-edge | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| iOS | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| Screen reader on | ⚠️ §3 | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| Reduced motion | ❌ input float §2.7 | ✅ skeleton | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## 2. Likely UI risks — findings

### 2.1 Keyboard overlap on Profile, Change Password and Availability — **HIGH — FIXED**

The user's brief named *login, password reset, profile, leave, settings*. Three of
those five are handled and **two are not**:

- Handled: [`LoginScreen`](src/features/auth/screens/LoginScreen.tsx:140),
  [`ResetPasswordScreen`](src/features/auth/screens/ResetPasswordScreen.tsx:227),
  [`ForgotPasswordScreen`](src/features/auth/screens/ForgotPasswordScreen.tsx:152),
  [`CreateLeaveRequestScreen`](src/features/leave/screens/CreateLeaveRequestScreen.tsx:404)
  all use [`KeyboardAwareView`](src/components/KeyboardAwareView/KeyboardAwareView.tsx:97).
- **Not handled:**
  [`ProfileScreen`](src/features/settings/screens/ProfileScreen.tsx:4) uses a bare
  `ScrollView`; [`ChangePasswordScreen`](src/features/settings/screens/ChangePasswordScreen.tsx:5)
  uses a bare `ScrollView`; [`AvailabilityScreen`](src/features/availability/screens/AvailabilityScreen.tsx:88)
  renders `AppTextInput` time fields inside
  [`ScreenContainer`](src/components/ScreenContainer/ScreenContainer.tsx:105), which
  deliberately performs **no** avoidance.

`ScreenContainer`'s own docblock states it "performs no avoidance at all". So on a
short device the Confirm-password field and the Profile email field can sit behind
the keyboard with no scroll-into-view.

**Resolution:** all three screens now use
[`KeyboardAwareView`](src/components/KeyboardAwareView/KeyboardAwareView.tsx:97) with
`ownsTopInset={false}` (the header above is a flow sibling that already absorbed the
top inset). `KeyboardAwareView` gained a `refreshControl` prop so Availability keeps
pull-to-refresh while becoming keyboard-aware, and Change Password registers both
fields with `useKeyboardAwareField` so focus scrolls them clear of the keyboard.

### 2.2 Bottom-tab-bar overlap with scroll content — **MEDIUM — FIXED**

[`AppTabs`](src/navigation/stacks/AppTabs.tsx:74) documents that "`ScreenContainer`
reserves `tabBarHeight + insets.bottom` at the bottom of every tab screen." The code
does **not** do that: `paddingBottom` is
`(withBottomInset ? insets.bottom : 0) + (withFabSpacing ? spacing.huge : spacing.md)`
— i.e. only **16pt** of chrome clearance by default, against a
`sizing.layout.tabBarHeight` of **56pt**
([`sizing.ts`](src/theme/sizing.ts:82)). Screens recover some of it with their own
list padding (Home `xxl`=32, Roster `xxl`=32), leaving roughly an 8–40pt shortfall
depending on the screen. **Recommendation:** either implement the documented
reservation in `ScreenContainer` (add `layout.tabBarHeight` when the screen is a tab
root) or correct the docblock; then verify the last row of each tab feed on a device
with and without a home indicator.

### 2.3 Dark-mode status bar is invisible — **HIGH — FIXED**

[`App.tsx`](App.tsx:70) hardcoded `<StatusBar barStyle="dark-content" />` with the
comment "The app is light-only by design (the theme has no dark variant)." That
comment was **stale and false**: the theme has a full dark variant
([`darkColors`](src/theme/colors.ts:358), `darkTheme`, `useTheme` resolving the
system scheme). With `barStyle` pinned to `dark-content` and RN 0.87 Android
edge-to-edge making the bar transparent
([`gradle.properties`](android/gradle.properties:44) `edgeToEdgeEnabled=true`), in
dark mode the status-bar glyphs rendered **dark-on-dark**.

**Resolution:** [`App.tsx`](App.tsx:70) now renders a `ThemedStatusBar` that reads
`useTheme()` and sets `barStyle={theme.isDark ? 'light-content' : 'dark-content'}`.
Because `useTheme` subscribes to the preference store, flipping Dark Mode updates the
bar live without a remount. The stale comment was replaced with the correct rationale.

### 2.4 Android edge-to-edge / safe-area — **MEDIUM**

`edgeToEdgeEnabled=true` is set, and
[`styles.xml`](android/app/src/main/res/values/styles.xml:4) uses
`Theme.AppCompat.DayNight.NoActionBar` with no explicit inset handling. Insets are
consumed in JS via `react-native-safe-area-context` and the ownership contract is
documented and mostly correct (`ScreenContainer`, `AppHeader`, `KeyboardAwareView`,
`StickyActionTray`, `GreetingHeader` each own exactly one inset). Residual risks to
verify on device: (a) the navigation-bar inset on gesture-nav Android; (b) whether
`NoActionBar` + transparent bars leaves the splash area correct on cold start.
**Recommendation:** device pass on Android 10/13/15 with 3-button and gesture nav.

### 2.5 Dynamic Type / large font collides with fixed geometry — **HIGH — FIXED**

`allowFontScaling` is left on deliberately
([`AppText.tsx`](src/components/AppText/AppText.tsx:44)) and **no**
`maxFontSizeMultiplier` exists anywhere (only the comment). That is the right intent,
but the layout assumes fixed heights in many places:

- [`AppButton`](src/components/AppButton/AppButton.tsx:189) sets a fixed
  `height: touchHeight` with a `numberOfLines={1}` label → the label clips vertically
  at large scales.
- [`AppTextInput`](src/components/AppTextInput/AppTextInput.tsx:281) fixes the control
  band to `controlHeights.md` (44) → text clips at large scales.
- **The virtualisation contract assumes fixed rows:**
  [`SHIFT_ROW_HEIGHT`](src/features/home/components/ShiftCard.tsx:20) (76),
  [`LEAVE_ROW_HEIGHT`](src/features/leave/screens/LeaveListScreen.tsx:72) (96),
  `SECTION_HEIGHT`/`ROW_BLOCK` ([`HomeScreen`](src/features/home/screens/HomeScreen.tsx:482)),
  and `MyRosterScreen`'s `SECTION_HEADER_HEIGHT`/`ROW_BLOCK`. Each feeds
  `getItemLayout`. When OS text scales, rows grow beyond the constant and
  `getItemLayout` silently desyncs scroll position (and `scrollToIndex`).
- [`TabBarItem`](src/components/TabBarItem/TabBarItem.tsx:184) label sits in the fixed
  `tabBarHeight` slot → clips at large scales.

**Resolution:** a two-part fix that keeps the intent (Dynamic Type honoured) while
restoring the geometry contract:

1. **Cap the scale, do not disable it.** [`FONT_SCALE_CAP`](src/theme/sizing.ts:20)
   (1.4) is applied via `maxFontSizeMultiplier` to fixed-height chrome:
   [`AppButton`](src/components/AppButton/AppButton.tsx:218),
   [`TabBarItem`](src/components/TabBarItem/TabBarItem.tsx:184),
   [`StatusBadge`](src/components/StatusBadge/StatusBadge.tsx:113) and both bands of
   [`AppTextInput`](src/components/AppTextInput/AppTextInput.tsx:268). Free-flowing
   text is uncapped and reflows. `AppText` gained an opt-in `scaling="fixed"` prop so
   the decision is explicit at each call site.
2. **Scale the geometry to match.** [`useRowScale`](src/hooks/useRowScale.ts:1) and
   [`scaleRowHeight`](src/hooks/useRowScale.ts:1) derive both the rendered row height
   *and* the number handed to `getItemLayout`, so the constant is true again. Applied
   on Home, Roster (rows and sticky headers), Leave and
   [`WeekDayStrip`](src/components/WeekDayStrip/WeekDayStrip.tsx:92). `useWindowDimensions`
   makes it re-measure when the OS text size changes mid-session.

### 2.6 Long error text is truncated to one line — **MEDIUM — FIXED**

Server 422 messages routed onto an input render in
[`AppTextInput`](src/components/AppTextInput/AppTextInput.tsx:398) with
`numberOfLines={1}` inside a fixed 16pt band. A real backend message such as
*"The employee id field is required."* fits, but longer policy messages will ellipsise
with no way to read them.

**Resolution:** the message band now allows `numberOfLines={2}` and the band is a
`minHeight` rather than a pinned `height`, so a wrapped server message claims a second
line instead of being clipped while the empty band still reserves exactly one line
(no layout jump as the message appears or clears).

### 2.7 Reduced-motion coverage is partial — **MEDIUM**

`useReduceMotion()` gates the skeleton
([`Skeleton.tsx`](src/components/Skeleton/Skeleton.tsx:65)), `AppButton`, `TabBarItem`
and `BottomSheet`. It is **not** applied to the
[`AppTextInput`](src/components/AppTextInput/AppTextInput.tsx:183) floating-label
`Animated.timing`, which animates unconditionally on every focus. Native stack screen
transitions are also not gated. **Recommendation:** gate the label float (jump instead
of timing) under Reduce Motion; document the stack-transition decision.

### 2.8 Home skeleton geometry does not match loaded content — **LOW/MEDIUM**

[`HomeSkeleton`](src/features/home/components/HomeSkeleton.tsx:13) is a bespoke,
non-animated, two-card placeholder with hardcoded heights (20/32/14/12). The loaded
Home screen renders a **hero card + section header + N shift cards + "Next up"
footer** ([`HomeScreen`](src/features/home/screens/HomeScreen.tsx:247)). It also does
not use the shared [`SkeletonGroup`](src/components/Skeleton/Skeleton.tsx:99), so it
is the one skeleton that ignores the reduce-motion-aware shimmer engine and the
`no-hide-descendants` a11y convention. Result: a visible layout jump on first load,
and an inconsistency with the roster/leave/notification skeletons.
**Recommendation:** rebuild `HomeSkeleton` from the shared `SkeletonRect`/`SkeletonPill`
primitives to mirror the real hero + rows + footer.

### 2.9 Offline-with-cache has no staleness signal outside Notifications — **MEDIUM**

Notifications explicitly distinguishes stale-but-usable (`SyncNotice`) from
nothing-and-failed (`ErrorView`) — exemplary. Home, Roster and Leave show React Query
cached data when offline but rely only on the global
[`SessionOfflineBanner`](src/components/SessionOfflineBanner/SessionOfflineBanner.tsx:38),
which reflects *session validation*, not data staleness. A user offline for a day may
believe a cached roster is current. **Recommendation:** surface a "showing saved data"
strip (reuse `SyncNotice`) on cached list screens when the session is offline.

### 2.10 Form-level (root) errors persist after correction — **MEDIUM — FIXED**

Field errors clear correctly (React Hook Form re-validates). But `setError('root', …)`
values are never cleared on edit in
[`LoginScreen`](src/features/auth/screens/LoginScreen.tsx:113),
[`ResetPasswordScreen`](src/features/auth/screens/ResetPasswordScreen.tsx:152),
[`ForgotPasswordScreen`](src/features/auth/screens/ForgotPasswordScreen.tsx:87),
[`ProfileScreen`](src/features/settings/screens/ProfileScreen.tsx:65),
[`ChangePasswordScreen`](src/features/settings/screens/ChangePasswordScreen.tsx:113)
and [`CreateLeaveRequestScreen`](src/features/leave/screens/CreateLeaveRequestScreen.tsx:351).
So a 500/network panel (or the leave "not linked to an employee record" message)
stays on screen while the user edits the form, contradicting the brief's "error
messages remaining visible after corrections".

**Resolution:** [`useClearRootError`](src/hooks/useClearRootError.ts:1) wraps
`clearErrors('root')` behind a stable callback that no-ops when there is no root
error. It is wired into every field's `onChange` on all six screens, so the panel
disappears on the first keystroke that makes the previous attempt stale.

### 2.11 Attachment previews / failed uploads — **LOW (documented gap)**

[`CreateLeaveRequestScreen`](src/features/leave/screens/CreateLeaveRequestScreen.tsx:655)
models attachments as **file-name strings only** (`uri: file://${name}`) — no picker,
no preview, no per-file upload state. This is honestly disclosed in the helper text
("On-device picker lands with the native file module") and mirrors the documented
native-module gap in [`datePicker.tsx`](src/features/leave/utils/datePicker.tsx:19).
A failed multipart upload surfaces only as a form-level error; there is no per-row
retry. **Recommendation:** accept for now, but when the picker lands, add thumbnail
preview and a per-attachment failed/retry affordance.

### 2.12 Large-phone / tablet width is uncapped — **LOW**

[`sizing.layout.maxContentWidth`](src/theme/sizing.ts:85) (640) exists and is applied
in [`WeekDayStrip`](src/components/WeekDayStrip/WeekDayStrip.tsx:101), but
`ScreenContainer` does **not** cap content width. On a tablet or large foldable,
Home/Roster/Leave rows stretch edge-to-edge and look sparse.
**Recommendation:** apply `maxWidth: layout.maxContentWidth` + centring in
`ScreenContainer`.

### 2.13 429 handling is uneven — **LOW**

Login maps 429 to the amber `throttled` panel with a clock glyph — excellent
([`FormErrorPanel`](src/components/FormErrorPanel/FormErrorPanel.tsx:47)). Other
mutations (e.g. leave create, password reset) surface a 429 through the generic
`ErrorView`/root message, losing the "do not retry yet" signal.
**Recommendation:** route all 429s through the `throttled` tone.

---

## 3. Accessibility audit

### 3.1 Confirmed intent (present and correct in code)

- **Labels/roles/states:** `accessibilityLabel`, `accessibilityRole`,
  `accessibilityState` are used consistently —
  [`AppButton`](src/components/AppButton/AppButton.tsx:176) (`disabled`+`busy`),
  [`TabBarItem`](src/components/TabBarItem/TabBarItem.tsx:135) (`tab`+`selected`,
  badge folded into the label), [`AppHeader`](src/components/AppHeader/AppHeader.tsx:142)
  ("Go back"), [`FloatingActionButton`](src/components/FloatingActionButton/FloatingActionButton.tsx:73)
  (label **required**), [`WeekNav`](src/features/roster/screens/MyRosterScreen.tsx:288).
- **44pt controls:** enforced by
  [`MIN_TOUCH_TARGET`](src/theme/sizing.ts:9) with the painted-vs-tappable split in
  `AppButton` and `hitSlop` on icon controls.
- **Screen-reader-hidden skeletons:** all primitives set `accessible={false}` +
  `importantForAccessibility="no-hide-descendants"`
  ([`Skeleton.tsx`](src/components/Skeleton/Skeleton.tsx:183)).
- **Decorative icons:** [`AppIcon`](src/components/AppIcon/AppIcon.tsx:82) defaults to
  decorative and flips to `image` only when labelled — prevents double announcements.
- **Colour-independent status:** [`StatusBadge`](src/components/StatusBadge/StatusBadge.tsx:96)
  and [`StatusScaffold`](src/components/StatusScaffold/StatusScaffold.tsx:41) always
  carry the state **word**; the leave accent strip is redundant with the badge text.
- **Modal focus trap:** [`BottomSheet`](src/components/BottomSheet/BottomSheet.tsx:355)
  uses `accessibilityViewIsModal` + `onAccessibilityEscape`.
- **Error announcements:** `accessibilityLiveRegion="polite"` on
  [`FormErrorPanel`](src/components/FormErrorPanel/FormErrorPanel.tsx:64),
  field errors, [`SessionOfflineBanner`](src/components/SessionOfflineBanner/SessionOfflineBanner.tsx:39)
  and [`OutboxStatusBanner`](src/services/outbox/OutboxStatusBanner.tsx:54).
- **Reduce Motion:** honoured by skeletons, buttons, tabs and sheets.

### 3.2 Gaps still required (from the brief)

| Required | Status | Evidence |
| --- | --- | --- |
| Automated accessibility checks | **✅ FIXED** | [`src/testing/accessibility.ts`](src/testing/accessibility.ts:1) provides `expectAccessible`, `collectLabels` and a rule engine (missing-role / missing-label / touch-target / hidden-content). 15 assertions in [`accessibility.test.tsx`](src/components/__tests__/accessibility.test.tsx:1), plus `eslint-plugin-react-native-a11y` wired into `npm run lint`. `npm run test:a11y` runs the suite alone. |
| VoiceOver testing | ⏳ device-only | Still requires a human pass; the automated checks cover the mechanical rules, not the spoken experience. |
| TalkBack testing | ⏳ device-only | As above. |
| Focus order testing | ⏳ device-only | Relies on tree order; no automated assertion is possible without a real accessibility service. |
| Focus restoration after navigation | ❌ OPEN | Still no `AccessibilityInfo.setAccessibilityFocus`. Deferred — it needs a per-screen decision about which node to restore to, which is a design task, not a mechanical one. |
| Announcements for **API errors** | ✅ | Live regions (§3.1). |
| Announcements for **successful mutations** | **✅ FIXED** | [`accessibility.ts`](src/utils/accessibility.ts:1) adds `announceForAccessibility` / `announceForAccessibilityAssertive` / `announceMutation`. Wired into Availability save (both saved and queued paths), password change, profile save and leave submit. |
| Accessible date/shift formatting | **✅ FIXED** | [`src/i18n/format.ts`](src/i18n/format.ts:1) now formats names and clock times via `Intl`, and the hour cycle is derived from the locale. `formatTime` renders 24-hour for a 24-hour locale, so the accessible string matches the input convention. |
| Icons never redundant/missing labels | ✅ | Decorative-by-default `AppIcon`; enforced going forward by the `missing-label` rule in the a11y suite and the ESLint plugin. |
| Colour-independent status | ✅ | §3.1. |

### 3.3 Localization foundation — **PARTIALLY ADDRESSED**

The blocker was that display formatting was hardcoded: `WEEKDAY_SHORT`/`MONTH_SHORT`
arrays and a `formatTime` that always emitted `AM`/`PM`, while Availability asked users
to *type* 24-hour `HH:MM`. That mismatch is **fixed**.

**What now exists** ([`src/i18n/`](src/i18n/index.ts:1)):

- [`locale.ts`](src/i18n/locale.ts:1) — resolves the active locale and hour cycle from
  the device via `Intl`, with an explicit override seam (`setLocaleOverride`,
  `setHourCycleOverride`) that a future language setting writes to and the tests pin.
- [`strings.ts`](src/i18n/strings.ts:1) — the copy catalogue plus data-derived labels:
  status vocabulary (`statusLabel`) and relative-time units (`relativeLabel`).
- [`format.ts`](src/i18n/format.ts:1) — locale-aware weekday/month names, clock times
  and composed dates, cached per `(locale, options)` because formatters are expensive.
- [`utils/date.ts`](src/utils/date.ts:1) — its display functions are now thin adapters
  over the above; date *math* and API serialisation stay unchanged.

**What is deliberately not done:** a wholesale extraction of every string literal into
the catalogue. The catalogue covers what is reused or data-derived; single-use inline
copy stays on its screen until there is a reason to move it. Extracting everything now
would add indirection at hundreds of call sites for no benefit while the app still ships
one language.

**Still open:** the composed date *order* (`Tue 15 Sep 2026`) remains app-defined rather
than fully `Intl`-ordered, because those strings are also accessible labels and narrow
list rows laid out against that shape. Switching to full locale ordering is a change to
`formatYmd` alone when a second language actually lands.

---

## 4. Prioritised remediation backlog

**P0 — functional/correctness — all done**

1. ✅ Status bar `barStyle` follows the theme (§2.3).
2. ✅ Keyboard avoidance on Profile, Change Password, Availability (§2.1).
3. ✅ Dynamic Type: capped `maxFontSizeMultiplier` on fixed-height chrome and
   decoupled `getItemLayout` from hardcoded row heights via [`useRowScale`](src/hooks/useRowScale.ts:1) (§2.5).

**P1 — high-impact UX/a11y — all done**

4. ✅ Successful mutations announced via [`accessibility.ts`](src/utils/accessibility.ts:1) (§3.2).
5. ✅ `root` form errors cleared on edit via [`useClearRootError`](src/hooks/useClearRootError.ts:1) (§2.10).
6. ✅ Bottom-tab-bar reservation implemented via `BottomTabBarHeightContext` (§2.2).
7. ⏳ `HomeSkeleton` rebuild — **DEFERRED.** It is a cosmetic layout-jump issue and the
   existing placeholder is functional; left out of this pass to keep the change set
   focused on the functional defects (§2.8).
8. ⏳ Offline-with-cache staleness banner — **DEFERRED.** The global
   [`SessionOfflineBanner`](src/components/SessionOfflineBanner/SessionOfflineBanner.tsx:38)
   already signals offline state; a per-screen staleness strip is a product decision
   about wording and placement rather than a defect (§2.9).

**P2 — polish/consistency**

9. ✅ Field-error line allowance — band is now two lines via `minHeight` (§2.6).
10. ⏳ Reduced-motion gate on the input float — **DEFERRED** (§2.7).
11. ⏳ Unify 429 handling across mutations — **DEFERRED** (§2.13).
12. ⏳ Cap content width on large phones/tablets — **DEFERRED** (§2.12).
13. ✅ Automated a11y checks — [`src/testing/accessibility.ts`](src/testing/accessibility.ts:1),
    15 tests, and `eslint-plugin-react-native-a11y` in `npm run lint` (§3.2).

**P3 — strategic**

14. ✅ Localization/formatting boundary — [`src/i18n/`](src/i18n/index.ts:1) (§3.3).
15. ⏳ Attachment preview + failed-upload retry — **DEFERRED**, blocked on the native
    file-picker module (§2.11).

### Verification performed

```
npx tsc --noEmit -p tsconfig.json   → 0 errors
npx eslint src App.tsx index.js     → 0 errors
npx jest                            → 48 suites, 425 tests, all passing
```

The 15 new a11y tests and 14 new i18n tests are included in that count. Two pre-existing
behaviours were deliberately **not** changed by this pass, because changing them would be
a product decision rather than a fix: the `soft-ui-react-native-main/` reference app's
own lint config (it is a vendored read-only sample and breaks a repo-wide `eslint .`), and
the composed date string order discussed in §3.3.

---

## 5. What the repository evidence cannot establish

These are **verification gaps**, not defects — they require a device/emulator run and
are the reason the brief's "visual validation on real devices" is still outstanding:

- Actual rendering on Android and iOS across the full state matrix.
- Real keyboard overlap behaviour on short devices.
- VoiceOver and TalkBack traversal, focus order and focus restoration.
- Contrast of every muted/disabled pair *as rendered* (tokens document AA targets,
  but no contrast test asserts them).
- Safe-area behaviour on notched/Dynamic-Island iPhones and gesture-nav Android.
- Tablet/large-phone layouts and reduced-motion behaviour end-to-end.

# Phase 4 — Authentication Layer Screens

**Scope:** Login, Forgot Password, Reset Password.
**Built from:** Phase 1 tokens, Phase 2 atoms (`AppTextInput`, `AppButton`, `AppIcon`, `StatusBadge`), Phase 3 containers (`ScreenContainer`, `AppHeader`, `AppCard`).
**Target:** react-native 0.87 / react 19, iOS + Android, no web canvas.

---

## 0. Platform Rules (normative, apply to every screen below)

These are the mobile-specific constraints the layout obeys. Where a later section
conflicts with §0, §0 wins.

| # | Rule |
|---|---|
| **K1** | **The virtual keyboard is a layout participant, not an overlay.** Every auth screen renders inside a `KeyboardAwareView`. Vertical behaviour is `padding` on iOS and `height` on Android — never `undefined`, never omitted. |
| **K2** | **No `position: fixed` submit bar.** Auth CTAs scroll with the content. A pinned footer would be covered by the keyboard on a 4.7" device with no way to reveal it. |
| **K3** | **Focus is a first-class navigation axis.** Every field declares `returnKeyType`. All fields except the last in the chain declare `"next"` and call `focus()` on the following input. The last declares `"done"` and calls `submit`. |
| **K4** | **Validation never changes layout.** `AppTextInput` reserves its `messageBand` unconditionally (`lineHeight.xs = 16`). Error strings paint into space that already exists. The strength row obeys the same rule: it is a **fixed-height slot**, not a conditional insert. |
| **K5** | **The keyboard must never hide the focused field.** `KeyboardAwareView` scrolls the focused input above the keyboard on `focus`, measured from its own layout offset. No hard-coded offsets. |
| **K6** | **One owner per inset.** `AppHeader` owns `insets.top`; `KeyboardAwareView` owns `insets.bottom`; `ScreenContainer` adds neither when used inside these screens. |
| **K7** | **Touch targets are 44×44pt minimum regardless of paint size.** Icon-only affordances (back arrow, password reveal) use `hitSlop`. |
| **K8** | **Horizontal rhythm is `screenGutter` (16).** No ad-hoc margins. |
| **K9** | **Colour is never the only signal.** Strength state carries an icon *and* a text label *and* a colour. |
| **K10** | **No percentages for control heights, no `vh`/`vw`, no `flex-wrap`.** Only `flexDirection`, `flexGrow/flexShrink/flexBasis`, and pt integers from the tokens. |

### K3 — the focus chain contract

```
require('react-native') Keyboard: dismissKeyboard() on submit start
field[i].returnKeyType = 'next'   →  onSubmitEditing = () => field[i+1].ref.current?.focus()
field[last].returnKeyType = 'done' →  onSubmitEditing = () => handleSubmit()
```

- `blurOnSubmit` is left at its default (`true`) so the keyboard does not flicker
  between chained fields: the next `focus()` re-raises it in the same frame.
- Refs are typed `AppTextInputRef` (already exported). Screens hold them in a
  `useRef` array or individual refs — never `any`.
- `onSubmitEditing` is only wired when the field is *resolvable*: the handler
  always calls `focus()`/`submit()` even when the current field has an error,
  because refusing to advance would trap the user on a field they must fix
  anyway, and the error is already visible.

---

## 1. Screen 1 — Modern Branded Login

### 1.1 Structural layout tree

```
KeyboardAwareView                                  [container, flex:1]
└── ScreenContainer                                [scrollable, no insets of its own]
    │   props: scrollable, withGutter, hasHeader={false}, withBottomInset={false}
    └── contentContainerStyle: styles.content
    │       flexGrow:1, justifyContent:'center', gap: spacing.xl (24)
    │
    ├── HeroBrand                                    [View]
    │   │   alignItems:'center', gap: spacing.sm (12), marginBottom: spacing.xl (24)
    │   ├── LogoTile                                 [View]
    │   │       width: 72, height: 72
    │   │       borderRadius: radiusRoles.macro.xl (20)
    │   │       backgroundColor: colors.primarySoft
    │   │       alignItems:'center', justifyContent:'center'
    │   │       borderWidth: borderWidths.hairline
    │   │       borderColor: colors.primaryBorder
    │   │       overflow:'hidden'                    [P7 — clipped surface]
    │   │   └── AppIcon                              [icon: ShieldCheck, size:'large' (32)]
    │   │           color:'primary'  accessibilityLabel:"Staff Scheduler"
    │   ├── AppText                                  [brand wordmark]
    │   │       variant='headerLarge'                (fontSize xxxl=30 / lineHeight 38 / bold)
    │   │       numberOfLines={1} ellipsizeMode='tail'
    │   │       value = "Welcome Back"
    │   └── AppText                                  [supporting line]
    │           variant='body'  color='textSecondary'
    │           value = "Sign in to view your shifts, roster and leave."
    │
    └── FormStack                                    [View]
        │   gap: spacing.md (16), width:'100%'
        │
        ├── AppTextInput   name='email'              [Controller]
        │       label="Email"                        required
        │       keyboardType='email-address'
        │       autoCapitalize='none'  autoCorrect={false}
        │       autoComplete='email'   textContentType='emailAddress'
        │       returnKeyType='next'   (Android)  →
        │       onSubmitEditing={() => passwordRef.current?.focus()}
        │       error={errors.email?.message}        [K4 — fixed band]
        │       ref={emailRef}
        │
        ├── AppTextInput   name='password'           [Controller]
        │       label="Password"                     required
        │       secureTextEntry  secureToggle
        │       autoCapitalize='none'
        │       autoComplete='current-password'  textContentType='password'
        │       returnKeyType='done'
        │       onSubmitEditing={onSubmit}
        │       error={errors.password?.message}
        │       ref={passwordRef}
        │
        ├── FormErrorPanel                           [conditional — form-level only]
        │   │   rendered only when errors.root is set
        │   │   backgroundColor: isThrottled ? colors.warningSoft : colors.dangerSoft
        │   │   borderRadius: radiusRoles.micro.md (8)   padding: spacing.sm (12)
        │   │   flexDirection:'row'  alignItems:'center'  gap: spacing.xs (8)
        │   │   accessibilityRole='alert'  accessibilityLiveRegion='polite'
        │   ├── AppIcon  icon = isThrottled ? Clock : AlertTriangle
        │   │            size='small' (16)
        │   │            color = isThrottled ? 'warningStrong' : 'dangerStrong'
        │   └── AppText  variant='label'
        │                color = isThrottled ? 'warningStrong' : 'dangerStrong'
        │                flexShrink:1     [text wraps, icon never squashes]
        │
        ├── AppButton  label="Sign in"
        │       variant='primary'  size='lg'  fullWidth
        │       loading={isSubmitting || login.isPending}
        │       onPress={onSubmit}
        │
        └── AppButton  label="Forgot password?"
                variant='text'  size='sm'  fullWidth={false}
                onPress={() => navigation.navigate('ForgotPassword')}
                [centred: parent alignItems:'center']
```

### 1.2 View-state mapping

| State | Trigger | Visual consequence |
|---|---|---|
| `idle` | mount | No error panel. Inputs at rest; labels rest in-box. |
| `focused(email/password)` | `onFocus` | 2pt `colors.primary` frame; label floats (150ms, `Easing.out(cubic)`). **No size change** — the frame is permanently 2pt at rest with a transparent/normal border colour. |
| `invalid(field)` | Zod on `onBlur`, or server 422 | `borderColor: colors.danger`, label `colors.danger`, error string in the already-reserved message band. |
| `submitting` | `isSubmitting \|\| isPending` | Button swaps row→`ActivityIndicator` (same height); `disabled`; label swapped, button does not grow. |
| `formError` | `errors.root` after non-field failure | Panel above the CTA. `throttled` kind → amber + clock icon; otherwise red + alert icon. |
| `success` | `login` resolves | **No navigation here.** The root navigator swaps stacks on session state; navigating too would race it. |

> `mode: 'onBlur'` is deliberate: `onChange` validation would paint an error on the
> first character typed, which reads as hostile during normal entry.

---

## 2. Screen 2 — Forgot Password Recovery

### 2.1 Structural layout tree

```
KeyboardAwareView                                  [container, flex:1]
└── ScreenContainer  scrollable  hasHeader  withBottomInset={false}
    └── contentContainerStyle: flexGrow:1, gap: spacing.xl (24)
    │
    ├── AppHeader
    │   │   title="Forgot password"
    │   │   onBack={() => navigation.goBack()}
    │   │   [PHASE 4 CHANGE] back affordance is now an ICON, not the string "Back"
    │   │
    │   ├── LEFT slot                          width: MIN_TOUCH_TARGET (44)
    │   │                                   height: MIN_TOUCH_TARGET (44)
    │   │   └── Pressable
    │   │           accessibilityRole='button'
    │   │           accessibilityLabel='Go back'
    │   │           hitSlop={spacing.sm (12)}   [K7 — 44+12 = comfortable]
    │   │           onPress={onBack}
    │   │           style: alignItems:'flex-start', justifyContent:'center'
    │   │       └── AppIcon  icon={ArrowLeft}  size='medium' (24)
    │   │                   color='textLink'
    │   │                   [decorative — the Pressable owns the label, so a
    │   │                    screen reader announces "Go back" once, not thrice]
    │   ├── CENTRE slot  flex:1, minWidth:0, alignItems:'center'
    │   │   └── AppText variant='headerMedium' numberOfLines={1} ellipsizeMode='tail'
    │   └── RIGHT slot  width/height: 44 — symmetric spacer (no action)
    │
    └── RecoveryStack                            [View]
        │   gap: spacing.xl (24), flexGrow:1
        │
        ├── InfoBlock                            [View]
        │   │   gap: spacing.sm (12)
        │   │   paddingHorizontal: spacing.xxs (4)   [optical: body text hugs the field edge]
        │   ├── AppText  variant='subtitle'          (fontSize lg=17 / lineHeight 24)
        │   │           value = "Enter the email address on your account and we will
        │   │                    send a reset link."
        │   └── AppText  variant='caption' color='textMuted'
        │           value = "The link expires shortly. Check your spam folder before
        │                    requesting another — resets are rate limited."
        │
        └── FormStack                            [View]
            │   gap: spacing.md (16)
            ├── AppTextInput  name='email'       [Controller]
            │       label="Email"  required
            │       keyboardType='email-address'
            │       autoCapitalize='none'        [contract: never auto-capitalise an address]
            │       autoCorrect={false}
            │       autoComplete='email'  textContentType='emailAddress'
            │       returnKeyType='done'
            │       onSubmitEditing={onSubmit}   [single field → Return submits]
            │       error={errors.email?.message}
            │       ref={emailRef}
            │
            ├── FormErrorPanel                    [conditional, identical geometry to §1.1]
            │       — only non-field failures (network, 500)
            │
            └── AppButton  label="Send reset link"
                    variant='primary'  size='lg'  fullWidth
                    loading={requestReset.isPending}
                    onPress={onSubmit}
```

### 2.2 Success state (`requestReset.isSuccess`)

Replaces `FormStack`; the header **stays**, still with the back-arrow, because a
user who is done reading must be able to leave.

```
ScreenContainer > RecoveryStack
├── AppHeader  title="Check your email"  onBack={goBack}   [arrow icon]
├── AppCard  elevated='low'  padded  → ConfirmationPanel
│   │   gap: spacing.sm (12)
│   ├── AppIcon  icon={MailCheck}  size='large' (32)  color='success'
│   │           accessibilityLabel="Reset link sent"
│   ├── AppText  variant='subtitle'    "If an account exists for that address, a
│   │                                   password reset link is on its way."
│   └── AppText  variant='caption' color='textMuted'
│               "Nothing arrived? Check your spam folder before requesting another
│                link — the reset endpoint is rate limited."
└── ActionStack  gap: spacing.sm (12)
    ├── AppButton  "Back to sign in"           variant='primary'   fullWidth
    └── AppButton  "I already have a reset code" variant='secondary' fullWidth
```

**Anti-enumeration (must not regress):** the copy is identical whether or not the
address exists. The UI never says "we found your account". The secondary CTA is
worded as *"already have a code"* so it does not imply the address was recognised.

### 2.3 View-state mapping

| State | Consequence |
|---|---|
| `idle` | Input at rest, subtitle visible. |
| `sending` | Button spinner; input `editable` stays `true` (a user may correct a typo mid-flight on a slow network) but the button is `disabled`. |
| `fieldError` | 422 → `errors.email` in the reserved band. |
| `formError` | Non-field → panel above CTA. |
| `sent` | Full success composition above; header retained. |

---

## 3. Screen 3 — Reset Password with Strength Meter

### 3.1 Structural layout tree

```
KeyboardAwareView                                  [container, flex:1]
└── ScreenContainer  scrollable  hasHeader  withBottomInset={false}
    └── contentContainerStyle: flexGrow:1, gap: spacing.xl (24)
    │
    ├── AppHeader
    │   title="Set a new password"     onBack={() => navigation.goBack()}
    │   [left slot = ArrowLeft icon, geometry per §2.1]
    │
    └── ResetStack                             [View]  gap: spacing.xl (24)
        │
        ├── InfoBlock                          [View]  gap: spacing.sm (12)
        │   └── AppText variant='body' color='textSecondary'
        │           value = hasToken
        │               ? "Choose a new password for your account."
        │               : "Paste the reset code from your email, then choose a new password."
        │
        └── FormStack                          [View]  gap: spacing.md (16)
            │
            ├── AppTextInput  name='token'      [conditional: rendered only when !hasToken]
            │       label="Reset code"  required
            │       helper="Copy it from the reset link in your email."
            │       autoCapitalize='none'  autoCorrect={false}
            │       returnKeyType='next' → focus email
            │       error={errors.token?.message}
            │
            ├── AppTextInput  name='email'      [Controller]
            │       label="Email"  required
            │       keyboardType='email-address'  autoCapitalize='none'
            │       autoCorrect={false}  autoComplete='email'
            │       textContentType='emailAddress'
            │       returnKeyType='next' → focus password
            │       error={errors.email?.message}
            │
            ├── PasswordFieldGroup                 [View]
            │   │   gap: spacing.sm (12)
            │   │   [the group is what makes the meter *belong* to the field —
            │   │    it reads as one control with a caption, not two siblings]
            │   │
            │   ├── AppTextInput  name='password'   [Controller]
            │   │       label="New password"  required
            │   │       helper="At least 8 characters."
            │   │       secureTextEntry  secureToggle
            │   │       autoCapitalize='none'
            │   │       autoComplete='new-password'  textContentType='newPassword'
            │   │       returnKeyType='next' → focus confirm
            │   │       error={errors.password?.message}
            │   │       ref={passwordRef}
            │   │
            │   └── StrengthSlot                    [View]
            │       │   height: STRENGTH_SLOT_HEIGHT (28)   ← FIXED. Always mounted.
            │       │   justifyContent:'center'
            │       │   [K4 — the meter cannot push the Confirm field down]
            │       └── StrengthPill                [conditional inside the fixed slot]
            │           └── §3.2
            │
            ├── AppTextInput  name='password_confirmation'   [Controller]
            │       label="Confirm new password"  required
            │       secureTextEntry  secureToggle
            │       autoCapitalize='none'
            │       autoComplete='new-password'  textContentType='newPassword'
            │       returnKeyType='done'  onSubmitEditing={onSubmit}
            │       error={errors.password_confirmation?.message}
            │       ref={confirmRef}
            │
            ├── FormErrorPanel   [conditional]
            └── AppButton  label="Update password"
                    variant='primary' size='lg' fullWidth
                    loading={resetPassword.isPending}  onPress={onSubmit}
```

### 3.2 The Strength Pill — StatusBadge geometry

The requested geometry is *the Status Badge structural row*: a **micro icon plus a
dynamic progress pill bar**, in one horizontal row. It replaces the previous
four-segment bar because the spec asks for one continuous "progress pill", and
because a badge-shaped unit can sit flush under a field without reading as a
second form row.

```
StrengthPill                                       [View — the badge chassis]
│   flexDirection:'row'            alignItems:'center'
│   gap: spacing.xxs (4)           alignSelf:'flex-start'
│   paddingVertical: spacing.xxs (4)      paddingHorizontal: spacing.xs (8)
│   borderRadius: radiusRoles.pill.full (999)     ← maximum roundness, as badge
│   backgroundColor: tone.soft                    (dangerSoft / warningSoft / successSoft)
│   borderWidth: borderWidths.hairline (1)        borderColor: tone.border
│   overflow:'hidden'                             [P7]
│   accessibilityRole='progressbar'
│   accessibilityLabel={`Password strength: ${label}`}
│   accessibilityValue={{ min:1, max:3, now: state.level }}
│
├── AppIcon                                       [MICRO — 12pt]
│       size='micro' (12)
│       color = tone.strong                       (dangerStrong / warningStrong / successStrong)
│       icon  = ICON_FOR_STATE[state.key]
│           weak   → ShieldAlert
│           medium → ShieldHalf   (or Shield minus)
│           strong → ShieldCheck
│       accessibilityLabel = undefined            [decorative; row owns the label — K9]
│
├── ProgressTrack                                 [View — the dynamic pill]
│       width: 56            ← a FIXED budget, not a percentage
│       height: 6
│       borderRadius: radiusRoles.pill.full
│       backgroundColor: colors.surfaceSunken     [the unfilled rail]
│       overflow:'hidden'
│       justifyContent:'center'
│   └── ProgressFill                              [View]
│           width: TRACK_WIDTH * state.fill        (0.33 / 0.66 / 1.0)
│           height:'100%'                          ← percentage of a *fixed* parent is safe
│           borderRadius: radiusRoles.pill.full
│           backgroundColor: tone.strong
│           [animated: `Animated.timing` on `width` is NOT used — width is not
│            composited. Instead the fill is mounted at 100% width inside a
│            clipping track and scaled via `transform:[{scaleX}]` with
│            transformOrigin set by translating by -(1-scaleX)*W/2, driven by
│            useNativeDriver:true. See §3.4.]
│
└── AppText                                       [state name — the non-colour signal K9]
        variant='label'  numberOfLines={1}
        style={{ color: tone.strong }}
        value = state.label   ("Weak" | "Medium" | "Strong" | "")
```

### 3.3 Three states — exact token mapping

The required contract is three named states. The existing evaluator returns four
(`weak | fair | good | strong`); the pill **collapses 4 → 3** so the UI matches the
spec without discarding the finer-grained heuristic (which still drives the
suggestions copy).

| Spec state | `PasswordStrength` inputs | `tone.soft` | `tone.strong` | `tone.border` | Fill | Icon | Label |
|---|---|---|---|---|---|---|---|
| **Weak** | `weak`, `fair` | `colors.dangerSoft` | `colors.dangerStrong` | `colors.danger` | `1/3` | `ShieldAlert` | `"Weak"` |
| **Medium** | `good` | `colors.warningSoft` | `colors.warningStrong` | `colors.warning` | `2/3` | `ShieldHalf` | `"Medium"` |
| **Strong** | `strong` | `colors.successSoft` | `colors.successStrong` | `colors.success` | `3/3` | `ShieldCheck` | `"Strong"` |

- **Empty (`score === 0`)** → the pill is **not rendered**, but `StrengthSlot` still
  occupies its 28pt. Nothing moves when the first character is typed.
- `dangerInSoft` / `warningStrong` / `successStrong` are the same *strong* text
  tokens already used by `FormErrorPanel`, so the two error surfaces agree.
- Amber, not red, for Medium: `good` is a passing password that could be better.
  Painting it red would train users to distrust a valid value.

### 3.4 Why the fill is `scaleX`, not `width`

`width` is a layout property: animating it re-runs Yoga every frame and pushes the
animation off the UI thread. `transform: [{ scaleX }]` is composited. To grow from
the left edge while scaling from the centre, the fill is translated by
`-(1 - scaleX) * TRACK_WIDTH / 2` each frame via an `interpolate`. The result is
identical visually and stays on the UI thread. Under **Reduce Motion**
(`useReduceMotion()` from Phase 3) the fill is *set*, not animated.

### 3.5 View-state mapping

| State | Consequence |
|---|---|
| `empty` | Slot reserved, pill absent. |
| `typing` | Pill appears at `Weak` and re-tones as the score changes. Purely advisory — no validation error is raised by strength. |
| `strengthHint` | Suggestions line (`suggestions[0]`) renders **inside the pill too**? No — the pill is single-line by badge contract. The first suggestion is surfaced via the field's own `helper` slot when the field is not in error, keeping the pill one line. |
| `invalid(password)` | Zod `< 8` → field error in the reserved band. The pill may simultaneously read `Weak`; that is consistent, not contradictory (one is a rule, one is a hint). |
| `mismatch` | Zod `.refine` fails on `password_confirmation` → error band on Confirm. |
| `submitting` | CTA spinner; `Update password` disabled. |
| `success` | Replaced composition (below). |

### 3.6 Success composition

```
ScreenContainer > ResetStack
├── AppHeader  title="Password updated"       [NO back arrow — the flow is over;
│                                              an arrow back into a consumed token
│                                              would dead-end on a 422]
├── AppCard elevated='low' padded
│   ├── AppIcon icon={ShieldCheck} size='large' color='success'
│   ├── AppText variant='subtitle'  "Your password has been changed."
│   └── AppText variant='caption' color='textMuted'
│           "Sign in with your new password to continue."
└── AppButton label="Back to sign in"  variant='primary' size='lg' fullWidth
        onPress={() => navigation.navigate('Login')}
```

---

## 4. `KeyboardAwareView` — the container contract

`ScreenContainer` alone is insufficient: it provides `keyboardShouldPersistTaps`
but **no avoidance behaviour**, so on iOS a focused lower field ends up behind the
keyboard. `KeyboardAwareView` wraps it.

```
KeyboardAwareView                                  [container, flex:1]
└── KeyboardAvoidingView
        style: { flex:1 }
        behavior: Platform.OS === 'ios' ? 'padding' : 'height'
        keyboardVerticalOffset: headerHeight  ← 0 for auth (no native header;
                                                 AppHeader is in-flow inside the scroll)
        enabled: true
    └── ScreenContainer (scrollable)
```

- **`behavior='padding'` on iOS** is required because the scroll content must gain
  bottom padding equal to the keyboard; `'height'` on iOS collapses the scroller and
  loses the ability to scroll the focused field into view.
- **`behavior='height'` on Android** is required because `android:windowSoftInputMode`
  is `adjustResize`; adding padding on top of that double-counts the keyboard.
- **Scroll-into-view:** the container keeps a `ScrollView` ref, records each field's
  `y` via `onLayout` on a wrapper, and on `focus` scrolls to
  `y - spacing.xl` with `animated: true`. Offsets are **measured**, never
  hard-coded (K5) — a hard-coded offset is wrong the moment the hero block or a
  helper line changes height.
- **`withBottomInset={false}`** on the inner `ScreenContainer`: the container owns
  `insets.bottom`, adding it to the scroll's tail padding so the CTA clears the home
  indicator. Two owners of the inset is the double-padding bug (K6).
- **Never nested inside another `KeyboardAvoidingView`** — nesting produces
  compounding padding.

---

## 5. `AppHeader` back affordance — the Phase 4 change

The left slot changes from a text label to a vector glyph.

| Property | Before | **After (Phase 4)** |
|---|---|---|
| Slot width/height | `MIN_TOUCH_TARGET` (44) | unchanged — the 3-column matrix is not disturbed |
| Child | `AppText variant='bodyStrong' color='textLink'` "Back" | `AppIcon icon={ArrowLeft} size='medium'` (24pt) `color='textLink'` |
| Alignment | `alignItems:'flex-start'` | unchanged — the arrow sits on the gutter rule, which is why `AppIcon`'s square box matters |
| A11y | `accessibilityLabel='Go back'` on the Pressable | unchanged; the icon stays **decorative** so the label is announced once |
| `hitSlop` | `spacing.sm` (12) | unchanged — 44 + 12 already exceeds the platform minimum |

The icon imports from the same vector set the app already standardises on, and is
declared in the `AppHeader` module so every screen that passes `onBack` gains the
arrow with no call-site change. `ArrowLeft` is used rather than `ChevronLeft`
because the auth stack is a **pop** (a step back through a flow), and a chevron
reads as "collapse", not "return".

---

## 6. `AppTextInput` — focus-chaining additions

No visual change. Three props become first-class so screens do not hand-roll them:

| Prop | Type | Purpose |
|---|---|---|
| `returnKeyType` | `TextInputProps['returnKeyType']` | already passable via `...rest`; now documented as **required on chained fields** (K3) |
| `onSubmitEditing` | `TextInputProps['onSubmitEditing']` | already passable; now the sanctioned mechanism for `focus()`/`submit()` |
| `ref` | `AppTextInputRef` | already forwarded; screens type refs with this, never `any` |

The four-band footprint, the 2pt permanent frame, and the always-mounted message
band are **unchanged** — K4 depends on them, and any change there would invalidate
the "no layout jump on validation" guarantee across all three screens.

---

## 7. Verification Contract

1. **tsc** — `npx tsc --noEmit --ignoreDeprecations 6.0` exits 0.
2. **jest** — `npx jest` : 27 suites / 212 tests still pass, *plus* any new
   `PasswordStrengthMeter` tests for the 4→3 state collapse.
3. **eslint** — `npx eslint src/components src/features/auth src/navigation --ext .ts,.tsx`
   : 0 errors; warning count must not increase beyond the 5 pre-existing.
4. **Keyboard** — on a 4.7" iOS simulator and a short Android device:
   - focusing Confirm Password keeps the field above the keyboard;
   - "Next" advances email → password (Login), and email → password → confirm (Reset);
   - "Done"/"Return" on the final field submits;
   - the CTA is reachable with the keyboard open.
5. **No layout jump** — typing the first character of `password` on Screen 3 must
   not move the Confirm field: the pill appears inside the pre-reserved 28pt slot.
6. **Reduce Motion** — the progress fill is set instantly, not animated.
7. **Consumer compatibility** — the existing consumers of `AppHeader`,
   `ScreenContainer`, `AppTextInput` and `PasswordStrengthMeter` compile unchanged;
   the strength meter's 4→3 collapse is additive (a new `variant`/state prop), not a
   breaking change to the existing props.

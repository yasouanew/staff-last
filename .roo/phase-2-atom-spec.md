# Phase 2 — Base UI Atom Components: Architectural Specification

> **Phase 7 addendum.** The design-system refactor added four token groups to the
> theme surface — `gradients`, `motion`, `haptics` and `darkElevation` — and
> extended `colors` with `glassSurface`, `glassBorder`, `hairline` and
> `overlay`. Atoms may now consume those in addition to the surfaces in §0.1.
> See §0.3.

Status: **Normative**. Every rule below is written against the Phase 1 token
contracts and is enforced by the implementations in
[`src/components/`](src/components/index.ts:1).

Scope: the four atoms that every other surface in the app composes from —
**Button**, **Text Input**, **Status Pill Badge**, **Icon**.

---

## 0. Global constraints

These apply to all four atoms and are non-negotiable.

| # | Constraint | Rationale |
|---|-----------|-----------|
| G1 | **No raw HTML and no web CSS.** No `div`/`span`, no CSS variables, no `rem`, no `%`-only sizing for control chrome, no raw `box-shadow` strings. | The app is React Native (iOS + Android). Web idioms do not exist in the renderer. |
| G2 | **No literal visual values inside an atom.** Colours come from `theme.colors`, spacing from `theme.spacing`, radii from `theme.radius`, type from `theme.typography`, control geometry from `theme.sizing`. | One place to re-tune the whole system; a hard-coded `#1B5FA8` or `18` is a defect. |
| G3 | **All geometry is point-based integers (pt / dp).** | Pins iOS and Android to identical pixel math; sub-pixel rounding differs per platform otherwise. |
| G4 | **No layout shift during state changes.** A state transition may change colour, opacity or transform — never the element's measured box. | Prevents the "everything under the field jumps" bug class. |
| G5 | **Text never truncates or clips inside an atom.** Fixed-height chrome carries `numberOfLines={1}` *and* a guaranteed-fit size floor; wrapping chrome uses an explicit `lineHeight`. | A clipped status word or a wrapped button label is a correctness bug, not a cosmetic one. |
| G6 | **Colour is never the only signal.** Every semantic atom also carries a text label; every state also carries an `accessibilityState`. | Colour-blind users and screen readers. |
| G7 | **Interactive atoms expose `accessibilityRole`.** Button → `button`; icon button → `button` with a required label; badge → `text`. | VoiceOver / TalkBack correctness. |
| G8 | **Theme, never a prop, decides light vs dark.** Atoms read `useTheme()`; they must not accept a `dark` prop. | A single source of truth for appearance. |

### 0.1 Token surfaces an atom may consume

```text
theme.colors.<semantic>          → string  (hex)
theme.spacing.<key>              → number  (pt, 8pt grid)
theme.radius.<role>              → number  (pt)
theme.typography.variants.<name> → TextStyle
theme.sizing.controlHeights.<sz> → number  (pt)
theme.sizing.iconSizes.<sz>      → number  (pt)
theme.sizing.borderWidths.<k>    → number  (pt)
```

### 0.2 Icon size presets (contract for atom #4)

| Preset | pt | Bounding box | Used by |
|--------|----|--------------|---------|
| `micro` | 12 | 12 × 12 | Inline suffix glyph, badge leading dot, dense metadata |
| `small` | 16 | 16 × 16 | Buttons, list rows, text inputs, tab bar |
| `medium` | 24 | 24 × 24 | Primary actions, headers, toolbar |
| `large` | 32 | 32 × 32 | Empty states, hero/illustrative slots |

`theme.sizing.iconSizes` gains the `micro: 12` step; its existing
`xs`/`sm`/`md`/`lg`/`xl`/`xxl` steps are retained (see §4) so no existing
consumer breaks.

### 0.3 Phase 7 token surfaces (normative)

The design-system refactor added four token groups and extended `colors`. They are
assembled in [`src/theme/theme.ts`](src/theme/theme.ts:1) and reachable through
[`useTheme`](src/theme/useTheme.ts:36) exactly like the Phase 1 groups, so an atom
still satisfies G2 by reading them rather than hard-coding.

```text
theme.colors.glassSurface         → string  (translucent; pairs with BlurView)
theme.colors.glassBorder          → string  (lit top edge on a glass surface)
theme.colors.hairline             → string  (0.5/1pt separator in LIGHT mode)
theme.colors.overlay              → string  (scrim behind a modal/sheet)
theme.colors.<semantic>Soft       → string  (success/warning/danger/info washes)
theme.darkElevation.ring          → string  (border colour that replaces a
                                              shadow in DARK mode)
theme.componentRadius.<role>      → number  (card, sheet, chip, input, hero, …)
theme.gradients.<preset>          → { colors, start, end }
theme.motion.{duration,easing,springs,pressScale}
theme.haptics.<semantic>          → HapticTrigger
```

**Dark-elevation rule (normative).** A shadow is not visible on a dark surface,
so any element that separates itself with `theme.shadows.*` in light mode MUST
switch to `theme.darkElevation.ring` as its border colour when `theme.isDark` is
true. `AppCard`, `AppHeader`, `AppTabBar`, the roster `DayDivider` and the leave
card all follow this rule; a new card that does not is a defect.

**Radius-role rule (normative).** Atoms and screens read `componentRadius.<role>`
rather than a raw step from `radius`, so a card, a sheet and a list row can never
drift to different corners. `componentRadius.card` is the single source for every
resting card radius, including feature cards that are not `AppCard` (e.g. the
leave list row).

**Reduce-motion rule (normative).** Every animated atom reads
[`useReduceMotion`](src/components/Skeleton/Skeleton.tsx:65) and, when it is true,
sets the animated value to its end state instead of springing or timing to it. The
component still appears and disappears — it simply stops travelling. This applies
to `AppButton`, `AppCard`, `TabBarItem`, `BottomSheet` and `PasswordStrengthMeter`.

### 0.4 Phase 7 component additions

| Component | File | Contract |
|-----------|------|----------|
| `BottomSheet` | [`src/components/BottomSheet/`](src/components/BottomSheet/BottomSheet.tsx:1) | Swipe-to-dismiss sheet with a blurred scrim. Replaces `Alert.alert` for destructive confirmation. Dismissal is judged on distance **or** release velocity via the exported pure `shouldDismissSheet`, so the rule is unit-tested. |
| `SkeletonDetail` | [`src/components/Skeleton/SkeletonScreen.tsx`](src/components/Skeleton/SkeletonScreen.tsx:105) | Detail-screen placeholder (hero block + field matrix). Complements `SkeletonList`, `SkeletonRows` and `SkeletonHeader`. |
| `SkeletonList` / `SkeletonRows` | [`src/components/Skeleton/SkeletonScreen.tsx`](src/components/Skeleton/SkeletonScreen.tsx:52) | Card-shaped and row-shaped list placeholders. |

**Content-loading rule (normative).** A content fetch renders a skeleton, never a
spinner. `LoadingView` (an `ActivityIndicator`) is reserved for genuinely
indeterminate *actions* — a submit in flight, a paginated append — and is no
longer used for first paint on any screen. Every skeleton composition announces
itself to assistive tech as a single `accessibilityRole="progressbar"` region and
hides its individual shapes.

---

## 1. Modern Button Atom

File: [`src/components/AppButton/AppButton.tsx`](src/components/AppButton/AppButton.tsx:1)

### 1.1 Anatomy

```text
┌───────────────────────────────────────────┐  ← pressable box, radius = radius.md
│  [ padH ]  ( leading ) ( gap ) ( label )  │  ← single row, centred both axes
└───────────────────────────────────────────┘
        └──────────── content row ─────────┘
```

* Outer element owns: height, horizontal padding, radius, background, border,
  pressed transform. It is the *touch* box.
* Inner element owns: `flexDirection: 'row'`, `alignItems: 'center'`,
  `justifyContent: 'center'`, `gap: spacing.xs`. It is the *optical* box.

### 1.2 Variants

| Variant | Idle fill | Idle label | Border | Role in the app |
|---------|-----------|------------|--------|-----------------|
| `primary` | `colors.primary` (Ocean Blue) | `colors.onPrimary` | 1pt, transparent | The one committing action on a screen. A screen has at most one. |
| `secondary` | `colors.secondary` (tinted) | `colors.onSecondary` | 1pt, `colors.border` | Co-equal alternative — "Reset changes", "Try again". |
| `text` | transparent | `colors.textLink` | 0pt | Low-emphasis inline/tertiary action. **Canonical name for the text-only variant.** |
| `ghost` | transparent | `colors.textLink` | 0pt | *Legacy alias of `text`*, retained for existing callers. |
| `danger` | `colors.danger` | `colors.onDanger` | 1pt, transparent | Destructive confirmation only. |

`text` and `ghost` are intentionally identical in rendering: the rename makes
the variant name describe what it looks like rather than where it sits. Both
remain assignable to `AppButtonVariant`.

### 1.3 Sizes and the 44 pt floor

| Size | Height | Horizontal padding | When |
|------|--------|--------------------|------|
| `sm` | `controlHeights.sm` = 36 | `spacing.sm` = 12 | Inline retry / empty-state action |
| `md` | `controlHeights.md` = 44 | `spacing.lg` = 20 | **Default** |
| `lg` | `controlHeights.lg` = 52 | `spacing.xl` = 24 | Primary form submit |

**Minimum touch target rule.** Where `height < MIN_TOUCH_TARGET` (44) — i.e.
`size="sm"` — the atom MUST NOT enlarge the visible box (that would break
visual rhythm) but MUST guarantee the hit region:

* `minHeight` on the pressable is clamped with `Math.max(height, MIN_TOUCH_TARGET)`
  for the *touch* surface, while the painted fill keeps the nominal height via
  `borderRadius`/`paddingVertical` symmetry, **or**
* a vertical `hitSlop` is applied equal to `(MIN_TOUCH_TARGET - height) / 2`.

The implementation uses the first form: `minHeight: Math.max(height, 44)` plus
`alignSelf`/`alignItems` centring, so the background fill still reads as 36pt
while the tappable band is 44pt. `accessibilityState.disabled` is always set.

### 1.4 States

| State | Condition | Background | Label | Extra |
|-------|-----------|------------|-------|-------|
| **Idle** | `!pressed && !blocked` | variant fill | variant label | — |
| **Pressed** | `pressed && !blocked` | unchanged | unchanged | `opacity 0.7` **and** `transform: [{ scale: 0.98 }]` |
| **Loading** | `loading` | `colors.primaryDisabled` (blocked fill) | hidden | spinner in the label slot, `accessibilityState.busy` |
| **Disabled** | `disabled` | `colors.surfaceMuted` / `primaryDisabled` | `colors.textDisabled`/`textMuted` | not pressable, no transform |

**Micro-interaction rule (normative).** Pressed feedback must be *perceivable
without being animated*, because animated feedback is dropped on low-end
Android and is invisible to users with "Reduce Motion" enabled:

* `scale: 0.98` is the required transform — one value, no spring, so it cannot
  desynchronise from the touch event.
* `opacity: 0.7` is the required alpha floor. (Superseded the previous `0.85`,
  which was too subtle against the Ocean Blue fill to read as feedback.)
* A pressed button must never change `height`, `padding` or `borderWidth`.

### 1.5 Content layout rules

1. **Row grouping.** `leading` and `label` sit in one centred row with
   `gap: spacing.xs`. There is never a second text node.
2. **Label fits or ellipsises, never wraps.** The label is `numberOfLines={1}`.
   For a fixed-width button the label is given `flexShrink: 1` inside the row so
   an over-long translation ellipsises instead of pushing the icon out.
3. **Icon sizing.** A `leading` icon should be passed at `iconSizes.small` (16).
   Icon-only buttons are expressed with the separate icon-button atom, not by
   passing an empty label.
4. **`fullWidth`.** Default `true` → `width: '100%'`; `false` → intrinsic width
   with the same padding. `sm` buttons in banner/empty states use `fullWidth={false}`.
5. **Loading spinner is not additive.** The spinner occupies the label's slot
   (the row is replaced, not appended), so a button does not grow when it starts
   submitting.
6. **Vertical centring is structural.** `alignItems: 'center'` +
   `justifyContent: 'center'` on both boxes; no `lineHeight` trickery may be
   used to fake centring.
7. **No container-imposed margin.** The atom emits no outer margin; spacing
   between buttons is the parent's `gap`.

### 1.6 Backward compatibility

Consumed in 16 call sites (auth flows, availability, settings, leave,
`ErrorView`, `EmptyState`, `CompanyLockedView`). The atom therefore keeps the
`AppButtonVariant` / `AppButtonSize` / `AppButtonProps` export names and every
existing prop; the pressed-alpha change and the touch-target floor are the only
behavioural deltas, and both are strictly more accessible.

---

## 2. Floating-Style Text Input Atom

File: [`src/components/AppTextInput/AppTextInput.tsx`](src/components/AppTextInput/AppTextInput.tsx:1)

### 2.1 Anatomy — normal vs floated

```text
   NORMAL (empty, unfocused)              FLOATED (focused OR populated)
   ┌───────────────────────────┐          ┌───────────────────────────┐
   │  Email                    │          │  Email          ← caption │  ← label rides the top border
   │                           │          │  ada@example.com          │
   └───────────────────────────┘          └───────────────────────────┘
     label sits *inside*, at                label shrinks to caption and
     body size, vertically centred          translates up, clipped by the
                                            wrapper's top padding band
```

### 2.2 The fixed-footprint geometry (the core rule)

The field reserves **four stacked bands** at all times and never changes any of
their heights:

| Band | Height | Content |
|------|--------|---------|
| `labelBand` | `lineHeight.xs` = 16 | Floating label (caption) *or* the resting label inside the box |
| `controlBand` | `controlHeights.md` = 44 | The bordered box: input text **and**, when normal, the in-box label |
| `messageBand` | `lineHeight.xs` = 16 | Error message **or** helper message **or** empty spacer |
| `gap` | `spacing.xxs` = 4 | Between label band and control band |

* The label is rendered **once**, absolutely positioned, and animated between two
  resting positions — it is never swapped between two different elements.
* The `messageBand` is **always mounted with a fixed height**. When there is no
  error and no helper it renders an empty spacer View of exactly
  `lineHeight.xs`. This is what makes G4 hold: typing an invalid value paints
  `colors.danger` into a band that already existed, so the submit button below
  does not move by a single point.
* Error **takes precedence over** helper (mutually exclusive content in one band).
* A message is always `numberOfLines={1}` with `ellipsizeMode="tail"`; a long
  server message ellipsises rather than wrapping the band.

### 2.3 The floating-label animation

| Property | Normal | Floated |
|----------|--------|---------|
| font scale | `fontSize.md` (15) | `fontSize.xs` (12) |
| line height | `lineHeight.md` (22) | `lineHeight.xs` (16) |
| vertical position | centred in control band (`translateY ≈ 11`) | lifted to `translateY = 0` of the label band |
| colour | `colors.textMuted` | `colors.textSecondary`; `colors.danger` on error |
| tracking | `letterSpacing.normal` | `letterSpacing.wide` (small caps-ish legibility) |

Rules:

1. **Font size is not animated numerically.** React Native cannot animate
   `fontSize` on both platforms without a per-frame re-layout that drops frames
   and risks G4. Instead the label is *rendered* at the floated size
   (`fontSize.xs`) and scaled **up** by `fontSize.md / fontSize.xs` (1.25) while
   resting inside the box, using `transform: [{ scale }]` with
   `transformOrigin` pinned to the label's left edge. Only `scale`,
   `translateY` and `color` are animated — all three are GPU-composited.
2. **Trigger.** Floated when `isFocused === true` **OR** the current value is
   non-empty (`value.length > 0`). This is the definition of the *Populated*
   state; it means a filled-but-unfocused field still shows its label floated.
3. **Duration / easing.** `150 ms`, `Easing.out(Easing.cubic)`. Under 200 ms so
   it never lags the keyboard; cubic-out so the arrival is soft.
4. **Reduce Motion.** If the OS "Reduce Motion" flag is set, the label switches
   instantly (duration `0`) between the two resting positions. It must never be
   mid-flight when the field is read by a screen reader.
5. **Hit testing.** The floating label is `pointerEvents="none"`: tapping where
   the (floated) label *appears* to be must focus the input, not the label.

### 2.4 States

| State | Border colour | Border width | Fill | Label | Input text |
|-------|---------------|--------------|------|-------|-----------|
| **Normal / Idle** | `colors.borderStrong` | `borderWidths.hairline` (1) | `colors.surface` | in-box, `textMuted` | `colors.text` |
| **Focused** | `colors.primary` | `borderWidths.focus` (2) | `colors.surface` | floated, `textSecondary` | `colors.text` |
| **Populated** | `colors.borderStrong` | `borderWidths.hairline` (1) | `colors.surface` | floated, `textSecondary` | `colors.text` |
| **Error** | `colors.danger` | `borderWidths.focus` (2) | `colors.surface` | floated, `danger` | `colors.text` |
| **Disabled** | `colors.border` | `borderWidths.hairline` (1) | `colors.surfaceMuted` | in-box, `textDisabled` | `colors.textDisabled` |

Two geometry notes:

* **Border width must not change the inner box.** Focus/error raise the border
  from 1pt to 2pt. The wrapper therefore uses `borderWidth` as the *only*
  variable and compensates padding by `borderWidths.focus - borderWidths.hairline`
  on all sides, so the text baseline does not shift by 1pt when focus arrives.
  Equivalently: the wrapper is given a permanent 2pt-thick transparent frame and
  only the border *colour* moves — this is the implemented form and is preferred
  because it is unconditional.
* **Disabled is not merely "greyed focus".** `editable={false}` plus
  `accessibilityState.disabled`.

### 2.5 Content rules

1. `required` renders the label as `` `${label} *` `` — a text marker, not a red
   asterisk, so it survives greyscale.
2. Placeholder is `colors.textMuted` and may **only** be used where the label
   alone is insufficient; with a floating label the in-box label already
   occupies the resting placeholder position.
3. `secureToggle` is a trailing `Pressable` with `hitSlop: spacing.sm`; its
   label toggles between "Show password" / "Hide password".
4. The input element carries `theme.typography.variants.body` explicitly so a
   default `Text` style cannot leak in.
5. The atom accepts `containerStyle` but emits no outer margin of its own; form
   stacks own their `gap`.
6. `forwardRef` to the raw `TextInput` instance is preserved
   (`AppTextInputRef`) so "next field" focus chains keep working.

---

## 3. Status Pill Badge Atom

File: [`src/components/StatusBadge/StatusBadge.tsx`](src/components/StatusBadge/StatusBadge.tsx:1)

### 3.1 Shape — maximum roundness

* `borderRadius: theme.radius.full` (999). A pill, not a rounded rectangle; the
  radius must exceed half the badge height at every size so the ends are true
  semicircles.
* `alignSelf: 'flex-start'` — the badge hugs its content and never stretches to
  the row width (which would make a short status look like a banner).
* `alignItems: 'center'`, `justifyContent: 'center'`.
* No border, no shadow. Tone is carried by a soft fill + a strong foreground.

### 3.2 Semantic mapping (Phase 1 tokens)

| Semantic role | API statuses | Fill | Text | Meaning |
|---------------|--------------|------|------|---------|
| **Approved** → `success` | `approved`, `completed`, `published`, `active` | `colors.successSoft` | `colors.successStrong` | Terminal-good. |
| **Pending** → `warning` | `pending`, `swap_requested` | `colors.warningSoft` | `colors.warningStrong` | Awaiting a decision. |
| **Denied** → `danger` | `rejected`, `cancelled` | `colors.dangerSoft` | `colors.dangerStrong` | Terminal-bad. |
| `info` | `scheduled` | `colors.infoSoft` | `colors.infoStrong` | Neutral-informational. |
| `neutral` | `draft`, `inactive`, unknown | `colors.surfaceMuted` | `colors.textSecondary` | No decision implied. |

**Fallback rule.** An unmapped status renders `neutral` with a humanised label
(`swap_requested` → "Swap requested"). It must never render nothing — an
unexpected backend enum degrades to a grey pill rather than a blank gap.

### 3.3 Explicit bounds and single-line lock

| Bound | Value | Why |
|-------|-------|-----|
| `minHeight` | `lineHeight.xs + 2 × spacing.xxs` = 16 + 8 = **24** | Guarantees the pill keeps its stadium silhouette at the smallest type. |
| `paddingHorizontal` | `spacing.xs` (8) | Clear air either side of the caps; half the height, so the curve is not crowded. |
| `paddingVertical` | `spacing.xxs` (4) | Combined with the 16pt line height yields the 24pt floor. |
| Text | `variant="label"`, `numberOfLines={1}`, `ellipsizeMode="tail"` | The label is **locked to one line**. It never wraps (which would break the pill into a lozenge) and never clips (which would show half a glyph). |
| `maxWidth` | 100% of parent | With `numberOfLines={1}` an over-wide label ellipsises at the container edge instead of overflowing. |

* **High contrast.** Foreground/background pairs are the `*Soft` / `*Strong`
  Phase 1 pairs, which are contrast-tuned in both light and dark themes. Text is
  never drawn in a raw semantic ramp step.
* **Fixed height.** The pill's height is derived from tokens only, so a list of
  badges on a card aligns pixel-perfectly.

### 3.4 Accessibility

* `accessibilityRole="text"` and `accessibilityLabel` = the resolved human label
  (so a screen reader says "Approved", not "Badge").
* Because a status *change* is meaningful, callers embedding a badge in a
  live-updating row should pass the badge inside a parent with
  `accessibilityLiveRegion="polite"`.
* The pill never conveys meaning through colour alone — it always carries the
  status word (G6).
* `tone` may be overridden by a caller for a one-off case, but the override is
  expected to be rare; the mapping table is the default contract.

---

## 4. Icon Component Integration Strategy

New file: [`src/components/AppIcon/AppIcon.tsx`](src/components/AppIcon/AppIcon.tsx:1)

### 4.1 Asset strategy

* Icons are **vector glyph components** from a permissively licensed set —
  Lucide (primary) or Feather (fallback for any glyph Lucide lacks), both of
  which expose stroke-based SVG path components with the same
  `size` / `color` / `strokeWidth` API.
* The app does **not** ship icon fonts and does **not** reference a glyph by
  string name at the call site. Call sites pass a *component*; this keeps
  tree-shaking honest (an unused icon is never bundled) and makes a missing icon
  a compile error rather than a blank "tofu" box at runtime.
* Until the vector set is added as a dependency, the atom accepts any
  `React.FC<IconRenderProps>` — which is satisfied by Lucide, Feather, or a
  local placeholder glyph — so integration is a one-line import change with no
  atom rewrite.

```ts
export type IconComponent = React.ComponentType<{
    size?: number;
    color?: string;
    strokeWidth?: number;
}>;
```

### 4.2 Size presets

| Preset | pt | Intended context |
|--------|----|------------------|
| `micro` | 12 | Inline suffix, dense metadata, badge leading marker |
| `small` | 16 | Buttons, list rows, inside inputs, tab bar |
| `medium` | 24 | Primary actions, headers, toolbars, icon buttons |
| `large` | 32 | Empty states, hero illustrations |

`iconSizes` also retains the pre-existing numeric keys (`xs` 14, `sm` 16,
`md` 20, `lg` 24, `xl` 32, `xxl` 48) so nothing that already reads
`theme.sizing.iconSizes.md` changes behaviour. The four named presets are the
colour-independent API going forward; `AppIcon` accepts a preset name **or** a
raw point value for the rare bespoke case.

### 4.3 Strict bounding-box squaring

This is the rule that makes centring trustworthy:

1. The glyph is wrapped in a `View` whose `width` **and** `height` are both set
   to the *same* resolved pt value. A `View` with a square box centres its child
   symmetrically by construction.
2. The inner vector is given the identical `size` and
   `alignItems/justifyContent: 'center'` on the wrapper, plus
   `overflow: 'visible'` so a stroke cap that extends a hair past the viewBox is
   not clipped.
3. Because the box is square, an icon placed next to text needs **no**
   asymmetric `marginTop`/`paddingTop` correction — the historical hack that
   produced icons sitting 1–2pt high on one platform and not the other. `AppIcon`
   emits no margin at all; vertical alignment is delegated to the parent's
   `alignItems: 'center'`.
4. Icons are **never** stretched: width and height are always equal, and the
   atom never accepts separate `width`/`height` props.
5. This square box is what `AppButton`'s `leading` slot and `AppTextInput`'s
   trailing toggle are sized against, so a 16pt icon + 20pt horizontal padding
   is a deterministic 44pt+ control.

### 4.4 Colour

* `color` defaults to `colors.icon` (theme token). Atoms pass an explicit token
  when the icon must match surrounding text (`colors.onPrimary` inside a primary
  button, `colors.danger` inside an error field). A raw hex is never passed.
* Stroke width defaults to `2` at `small`/`medium` and is not scaled with size —
  scaling stroke with size makes a 32pt icon look spindly and a 12pt icon look
  muddy.

### 4.5 Accessibility

* An icon that conveys information the surrounding text does not must carry an
  `accessibilityLabel`; the wrapper then exposes it as an image with that label.
* A decorative icon (the common case — a glyph that merely decorates a labelled
  button) is given `accessibilityElementsHidden` /
  `importantForAccessibility="no-hide-descendants"` so the screen reader does
  not announce a nameless element. `AppIcon` defaults to *decorative*; the
  opt-in is `accessibilityLabel`, which flips it to meaningful.

---

## 5. Verification contract

A Phase 2 change is complete only when all three pass:

1. `npx tsc --noEmit --ignoreDeprecations 6.0` — clean.
2. `npx jest` — all existing suites green (atoms are unchanged in every
   externally-observable prop).
3. `npx eslint src/components` — zero errors, no new warnings.

Plus the manual geometry checks for G4:

* Focus a field with a helper message, type an invalid value → the element
  **below** the field must not move.
* Press-and-hold a `sm` button → the painted fill stays 36pt, the tappable band
  is ≥44pt, and nothing reflows.
* Render a badge with a 40-character label → one line, ellipsised, pill intact.
* Toggle system dark mode → every atom re-renders with dark tokens and no atom
  retains a hard-coded colour.

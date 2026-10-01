# Phase 3 — Molecular Layout Components & Containers: Architectural Specification

Status: **Normative**. Complements [`phase-2-atom-spec.md`](.roo/phase-2-atom-spec.md:1).

Scope: the four layout molecules every screen is assembled from —
**Elevated Card**, **Screen Header**, **Bottom Tab Bar**, **Skeleton Loader**.

These are the components that touch the *device*, so this phase is where the
mobile constraints live: hardware safe zones, the absolute bottom edge, native
scroll behaviour, and the UI-thread budget.

---

## 0. Platform rules that govern this phase

| # | Rule | Consequence if broken |
|---|------|----------------------|
| P1 | **No web layout systems.** No CSS grid, no `flex-wrap`-as-masonry, no `position: fixed`, no `vh`/`vw`, no media queries. Layout is `flexDirection` + `flexGrow/flexShrink/flexBasis` + explicit pt values, in both directions. | The renderer has no such concepts; a ported web layout silently collapses. |
| P2 | **Safe zones are computed, never assumed.** Top/bottom insets come from `useSafeAreaInsets()` only. | Content under a notch, a Dynamic Island, or a swipe-home pill. |
| P3 | **Scroll behaviour is native.** `ScrollView`/`FlatList` handle scrolling with `keyboardShouldPersistTaps="handled"` and `keyboardDismissMode="on-drag"`. No JS scroll listeners, no `onScroll` animation drivers for chrome. | Dropped frames and a keyboard that eats the first tap. |
| P4 | **Anything that animates continuously must run off the JS thread** (`useNativeDriver: true`, or `Animated`/`Reanimated` on the UI thread). | A shimmer loop that blocks `onPress` — the classic "loading screen feels frozen" bug. |
| P5 | **Chrome owns its own safe-area padding; content owns its own inset compensation.** | Double padding, or none at all. |
| P6 | **Horizontal rhythm is `screenGutter`.** Full-bleed is the exception and must be declared explicitly (`withGutter={false}`, `padded={false}`). | Cards at 16pt on one screen and 20pt on another. |
| P7 | **Nothing may render outside its rounded container.** `overflow: 'hidden'` on every clipped surface. | A status badge's soft fill bleeding past a card's corner radius. |
| P8 | **Fixed chrome is measured, not wrapped.** Header height and tab bar height are token constants that `ScreenContainer` reads when computing bottom padding. | The last list row permanently hidden behind the tab bar. |
| P9 | **Chrome borders switch to `darkElevation.ring` in dark mode.** A hairline that reads as a soft edge on white reads as a grey outline on a dark surface. | A visible grey rule across every header and tab bar in dark mode. |
| P10 | **`getItemLayout` must be *true*.** A layout constant that is hand-tuned rather than derived from the same type metrics the stylesheet uses silently corrupts scroll position and `scrollToIndex`. | `scrollToIndex` lands on the wrong row; the scrollbar lies during a fling. |

### 0.1 Phase 7 layout changes (normative)

The design-system refactor did not change any platform rule above. It changed how
the molecules express them:

- **Tab bar.** [`TabBarItem`](src/components/TabBarItem/TabBarItem.tsx:75) now
  renders a real vector glyph and a soft `primarySoft` pill behind the focused
  item, animated with a Reanimated spring. The pill is `pointerEvents="none"` and
  exposes `${testID}-indicator`, so it never steals the touch and is assertable.
  The letter-plate placeholders are gone from
  [`AppTabs`](src/navigation/stacks/AppTabs.tsx:80).
- **Header.** [`AppHeader`](src/components/AppHeader/AppHeader.tsx:89) draws its
  bottom rule as `theme.colors.hairline` in light and `theme.darkElevation.ring` in
  dark (P9), and its back control is a tinted 44pt plate.
- **Card.** [`AppCard`](src/components/AppCard/AppCard.tsx:94) is borderless by
  default (`variant="elevated"` with a micro shadow), with `glass` and `plain`
  variants; its radius is `componentRadius.card` and its border follows P9.
- **Skeletons.** [`SkeletonGroup`](src/components/Skeleton/Skeleton.tsx:99) drives
  its shimmer with a single `Animated.Value` at the group level (P4), and
  `SkeletonList` / `SkeletonRows` / `SkeletonDetail` are the compositions screens
  mount. `SkeletonGroup` pins its opacity when Reduce Motion is on.
- **List layout math.** `HomeScreen` and `MyRosterScreen` both precompute
  cumulative offsets for `getItemLayout` (P10); `SECTION_HEIGHT` / `ROW_BLOCK` are
  sums of the same tokens the stylesheet uses, not literals.

---

## 1. Modern Elevated Card Container

File: [`src/components/AppCard/AppCard.tsx`](src/components/AppCard/AppCard.tsx:1)

### 1.1 Structure

```text
        ┌─────────────────────────────────────┐  ← overflow: hidden clips all children
        │                                     │     to the radius below
        │   [ padH = spacing.md = 16 ]        │
        │   content                           │  ← paddingVertical = spacing.md
        │                                     │
        └─────────────────────────────────────┘
          radius = radiusRoles.macro.md (12)  ← large geometric token
          elevation = theme.shadows.low        ← soft-elevation token
```

| Layer | Source | Value |
|-------|--------|-------|
| Corner radius | `radiusRoles.macro.md` | 12pt |
| Elevation | `theme.shadows.low` | 2pt drop / 6pt blur / 6% ink (iOS) — `elevation: 2` (Android) |
| Surface | `theme.colors.surface` | scheme-aware |
| Edge (light) | `borderWidths.hairline` + `colors.border` | 1pt |
| Edge (dark) | `theme.darkElevation.ring` | lightened hairline ring; a drop shadow is invisible on a dark surface (see Phase 1 §4) |
| Intrinsic radius on Android | `theme.darkElevation.surfaceLift` | raise the surface one ramp step instead of relying on `elevation` alone |

**Elevation policy.** `low` is the required tier for a resting card. A card is
*not* a floating surface — it is a grouping surface. Using `high` here is what
makes a business app look dated. `elevation` prop may raise to `medium` for a
card that must read as sticky, but never above that.

### 1.2 Internal geometry (8pt grid, rigid)

| Token | Value | Applies to |
|-------|-------|-----------|
| `paddingHorizontal` | `spacing.md` = 16 | Both axes, when `padded` |
| `paddingVertical` | `spacing.md` = 16 | " |
| External separation | **none emitted** | The card never emits margin; stacks own their `gap` (`spacing.sm`/`md`). |
| Flush mode | `padded={false}` → `padding: 0` | For image headers and embedded `FlatList` rows |

Internal children that need to reach the card edge (dividers, images, full-bleed
rows) must be rendered with `padded={false}` and pad their own content — a nested
card may not add a second padding layer.

### 1.3 Interactive feedback (hit-test overlay)

When `onPress` is supplied the card becomes a link, and the *entire* surface is
the hit target:

1. **Overlay.** The card renders a `Pressable` covering the full card rectangle
   (`StyleSheet.absoluteFill` equivalent: the pressable **is** the surface, with
   `flex: 1` on the content wrapper so the touch area does not depend on content
   height).
2. **Hit slop.** `hitSlop: spacing.xxs` on all sides, so a card that is visually
   flush against its neighbour is still comfortably tappable at the seam.
3. **Press visual (normative).** On touch-down the card applies
   `transform: [{ scale: 0.99 }]` **and** tints the surface to
   `theme.colors.surfaceMuted`. Both are composited/colour-only: no layout
   property changes, so nothing below the card in the list shifts.
4. **Scale, not translate.** `0.99` is the maximum permitted scale-down. Anything
   smaller reads as a glitch at card size, whereas `0.99` on a 340pt-wide card is
   a ~3.4pt contraction — perceptible, not theatrical.
5. **Accessibility.** `accessibilityRole="button"`, `accessibilityLabel` falls
   back to the caller's label, and no nested interactive child may sit inside the
   pressable without its own role (a `StatusBadge` inside a tappable card is
   `accessibilityRole="text"` and is therefore not a competing target).
6. **Non-interactive cards are plain `View`s.** No `Pressable` is mounted, so no
   phantom touch responder exists in a long list.

### 1.4 Clipping boundaries (enforced)

* `overflow: 'hidden'` is **always** set on the card — not only when a child is
  known to bleed. The failure mode this prevents is the `StatusBadge` case: its
  `*Soft` fill is a rounded rectangle nested inside the card, and without clipping
  a flush-positioned badge paints a square corner over the card's 12pt curve.
* On iOS, `overflow: 'hidden'` also clips shadows of children; this is intended —
  a child may not cast outside its card.
* Android needs `renderToHardwareTextureAndroid` **not** to be set; a large
  clipped surface with a software layer defeats the shadow's rendering path.
* A child that must escape the radius (a floating action affordance) is not a
  child at all — it is positioned as a sibling.
* Border and radius are applied to the same node that clips, so the clip shape and
  the painted shape cannot disagree.

### 1.5 Backward compatibility

Existing consumers already pass `onPress`, `padded`, `style`, `testID`; the
surface treatment changes from border-only to border + low elevation, and the
pressed state from tint-only to tint + `0.99` scale. `Divider` keeps its
`inset` prop and its `spacing.md` inset, which matches the new card padding.

---

## 2. Prominent Mobile Header

File: [`src/components/AppHeader/AppHeader.tsx`](src/components/AppHeader/AppHeader.tsx:1)

### 2.1 Hardware safe-area handling

```text
   ┌───────────────────────────────────────────┐
   │        insets.top  (notch / island)       │  ← paddingTop = insets.top + spacing.sm
   ├───────────────┬───────────────┬───────────┤
   │  LEFT  slot   │  CENTER slot  │ RIGHT slot│  ← fixed 44pt control band
   ├───────────────┴───────────────┴───────────┤
   │        subtitle (optional)                │
   └───────────────────────────────────────────┘
```

* `paddingTop = insets.top + spacing.sm`. The inset is read from
  `useSafeAreaInsets()` — never a hard-coded 44/48 — because the value differs
  between a notched iPhone, a Dynamic Island iPhone, and an Android device with
  only a status bar.
* **Safe-area must be applied by exactly one owner.** The header applies the top
  inset itself; screens rendered under it pass `hasHeader` to
  [`ScreenContainer`](src/components/ScreenContainer/ScreenContainer.tsx:1) so the
  container contributes `paddingTop: 0`. Two owners is the most common
  double-padding bug on this screen type.
* `flat` mode (header inside a scroll view) contributes **no** inset — in that
  position the content scrolls under the status bar and the inset belongs to the
  scrolling container.
* The control band is `MIN_TOUCH_TARGET` (44pt) tall, which is the header's
  `minHeight` floor beneath the inset.

### 2.2 Three-column layout matrix

The row is a **strict 3-column template**. The centre column is absolutely
centred with respect to the *screen*, not to its own flex remainder:

| Column | Flex | Alignment | Content | Bound |
|--------|------|-----------|---------|-------|
| **Left** | `flexShrink: 0`, fixed slot width | `flex-start` | Back arrow / dismissal only. Nothing else may occupy it. | Exactly `MIN_TOUCH_TARGET` (44×44) |
| **Centre** | `flex: 1`, `minWidth: 0` | `center` | Screen title (+ optional subtitle) | Clamped by the two side slots |
| **Right** | `flexShrink: 0`, fixed slot width | `flex-end` | Contextual action icon slots (equally spaced, `gap: spacing.xs`) | Exactly `MIN_TOUCH_TARGET` per slot |

Mechanics that make it work:

1. **Symmetric spacers.** When the Left slot is empty (a tab root), a
   `MIN_TOUCH_TARGET`-wide transparent spacer is rendered in its place — the same
   width the Back affordance would occupy. This is what keeps the title optically
   centred instead of sliding left by 44pt.
2. **`minWidth: 0` on the centre.** Without it a long title establishes a
   min-content width and pushes the side slots outward, breaking §2.3.
3. **Slot width is fixed, not content-derived.** An action icon is wrapped in a
   44×44 box ([`AppIcon`](src/components/AppIcon/AppIcon.tsx:1) at `medium` inside
   a centred square) so a change of glyph cannot change the header's geometry.
4. **Both side slots have identical width.** Left and Right are the same fixed
   width, which is what makes the centre truly centred.

### 2.3 Title truncation rules

* Title: `numberOfLines={1}` + `ellipsizeMode="tail"`, inside a
  `flex: 1, minWidth: 0` block, `textAlign` matching the column alignment.
* Subtitle: same rules, one line, `variant="label"`.
* **Non-negotiable outcome:** a 60-character title must ellipsise. It may never
  wrap to a second line (which would grow the header and shift all content down)
  and may never push the side slots out of their fixed boxes (which would move the
  Back target under the user's thumb between screens).
* Alternative `ellipsizeMode="middle"` is permitted **only** for a title known to
  end in a distinguishing token (e.g. a long ID); `tail` is the default.
* Dynamic type is honoured (`AppText` keeps `allowFontScaling`), so the title's
  `lineHeight` is pinned by the typography token to prevent clipping at large OS
  font sizes.

### 2.4 Accessibility

* The Back affordance is `accessibilityRole="button"` with label "Go back";
  `hitSlop: spacing.sm` extends its target beyond the visible glyph.
* The title is the header's accessible heading; `accessibilityRole="header"`.
* Action slots must each carry an `accessibilityLabel`, since several headers
  render icon-only actions.

---

## 3. Modern Bottom Tab Bar

File: [`src/navigation/stacks/AppTabs.tsx`](src/navigation/stacks/AppTabs.tsx:1) (configuration) and
[`src/components/TabBarItem/TabBarItem.tsx`](src/components/TabBarItem/TabBarItem.tsx:1) (slot)

### 3.1 Positioning — absolute bottom edge

| Property | Value | Reason |
|----------|-------|--------|
| `position` | `absolute` (via the navigator's tab bar) | The bar must not participate in the screen's flex flow; content scrolls *under* it. |
| `bottom` | `0` | Locked to the physical bottom edge of the display. |
| `left` / `right` | `0` | Full screen width; the bar is never inset horizontally. |
| `paddingBottom` | `insets.bottom` | Clears the swipe-home indicator on gesture-navigation devices; equals the on-screen home button height on older hardware. |
| `height` | `sizing.layout.tabBarHeight` (56) **+** `insets.bottom` | The *content* band is a constant 56pt; the inset is additive, so the slots keep their geometry on every device. |

Consequences that must be honoured by the rest of the app:

* Because the bar floats above content, **every scrollable screen must reserve
  bottom padding equal to `tabBarHeight + insets.bottom`.** [`ScreenContainer`](src/components/ScreenContainer/ScreenContainer.tsx:1)
  does this through `withBottomInset`; a screen that owns a `FlatList` must set
  `contentContainerStyle={{ paddingBottom: tabBarHeight + insets.bottom }}`.
  Without it the final row is permanently unreachable.
* The bar is opaque (`theme.colors.surface`) with a hairline top border
  (`colors.border`) and `theme.shadows.medium` — the one place a real shadow is
  correct, because the bar genuinely floats over moving content.
* The bar never animates its height; it may fade/slide as a whole on navigation,
  but a changing height would re-flow content mid-scroll.

### 3.2 Five-slot matrix

```text
┌─────────┬─────────┬─────────┬─────────┬─────────┐
│  1/5    │  1/5    │  1/5    │  1/5    │  1/5    │   ← flexBasis: 0, flexGrow: 1
│  ┌───┐  │         │         │         │         │
│  │24 │  │         │         │         │         │  ← Icon Atom @ medium (24pt)
│  └───┘  │         │         │         │         │
│  Label  │         │         │         │         │  ← micro caption (12pt max)
└─────────┴─────────┴─────────┴─────────┴─────────┘
```

* **Equal split.** Every slot is `flexBasis: 0, flexGrow: 1, flexShrink: 1`, so
  the width is exactly `screenWidth / 5` regardless of label length. Labels of
  different lengths must **not** produce different slot widths.
* **Vertical stack per slot.** `flexDirection: 'column'`, `alignItems: 'center'`,
  `justifyContent: 'center'`, `gap: spacing.xxs` (4):
  1. the **Icon Atom** at the `medium` preset (24pt), inside a square box (§4 of
     Phase 2) so it centres without an offset hack;
  2. the label at the micro caption tier — `fontSize.xs` (12pt), medium weight,
     `numberOfLines={1}`, `ellipsizeMode="tail"`, truncated inside the slot.
     Labels are single words where possible; a label that needs ellipsising is a
     copy problem, but it must degrade to an ellipsis rather than shrink the slot
     or wrap to a second line.
* **Slot hit target.** The whole slot is the target (full 56pt height × slot
  width), not just the 24pt icon — this is comfortably above the 44pt floor in
  both axes.
* **State is not colour-only.** The active slot is distinguished by
  (a) `colors.primary` tint, (b) a 2–3pt indicator **plus** a `label` weight
  change, and (c) `accessibilityState={{ selected: true }}`. A user who cannot
  perceive the hue difference still sees the weight change and hears "selected".

### 3.3 Active indicator

| Aspect | Value |
|--------|-------|
| Tint | `colors.primary` (active) / `colors.textMuted` (inactive) |
| Indicator | A 24pt × 2pt bar (`radius.pill.full`) centred under the icon box, in `colors.primary`. Rendered as a sibling of the icon, inside the icon's square box, so it cannot affect the slot's height. |
| Inactive indicator | Still mounted at `opacity: 0` (never conditionally unmounted) so toggling tabs cannot change the slot's geometry — a layout-shift guard of the same class as Phase 2 G4. |

### 3.4 Notification badge slot (absolute overlay)

```text
   ┌────────────────┐
   │            ┌───┴──┐   ← absolutely positioned container
   │   ┌────┐   │ 3  │      top: 0, right: 0 (of the icon box)
   │   │icon│   └────┘      translate: +25% x, −25% y
   │   └────┘
   └────────────────┘
```

* **Structural rule:** an absolutely-positioned micro-container is rendered as a
  *sibling of the icon inside the square icon box*, never as a child in the flex
  flow. An in-flow badge would grow the slot and shift the label.
* **Anchor:** `top: 0, right: 0` of the icon's bounding box, offset outward by
  `translateX: +25% / translateY: −25%` so the pill overlaps the icon's
  top-right corner rather than sitting inside it.
* **Shape:** a high-contrast **red pill** — `colors.danger` fill,
  `colors.onPrimary` text, `radius.pill.full`, `minWidth: lineHeight.xs` with
  `paddingHorizontal: spacing.xxs`, so 1–2 digit counts form a circle and 3+
  digits form a stadium.
* **Text:** `variant="label"` (12pt), `numberOfLines={1}`, clamped to `99+`.
* **Content:** the count comes from the local inbox (`useLocalUnreadCount`), not
  the server, so the badge cannot go blank when connectivity drops. The server
  count from `useUnreadCount` is used only as a pre-hydration placeholder.
* **Mount rule:** at zero unread the container **is** unmounted (`null`), because
  it is absolutely positioned and therefore cannot affect layout — unlike the
  active indicator, which stays mounted for exactly that reason.
* **Accessibility:** the badge is inside the slot; the slot's `accessibilityLabel`
  is extended when a count is present ("Notifications, 3 unread"), so a screen
  reader does not have to find the pill independently.
* **Stable icon references.** Icon renderers stay hoisted to module scope. Declaring
  them inline in `options` creates a new component type per render and remounts the
  icon subtree every time the badge count changes.

---

## 4. Content Skeleton Loading Layout

Files: [`src/components/Skeleton/Skeleton.tsx`](src/components/Skeleton/Skeleton.tsx:1) (primitive)
and [`src/components/Skeleton/SkeletonScreen.tsx`](src/components/Skeleton/SkeletonScreen.tsx:1) (compositions)

### 4.1 Why replace the spinner

A centred spinner communicates "unknown duration, unknown shape". A skeleton
communicates "content is coming, and here is where it will be". For a scheduling
app the second is materially better: the user can see that a shift day, a time
range and a status pill are loading, and the moment content arrives it fills
existing boxes rather than replacing the whole viewport. It also eliminates the
**spinner → content layout jump**, because the skeleton already occupies the
content's final geometry.

`LoadingView` (spinner) remains for genuinely indeterminate actions (a submit in
flight, a pull-to-refresh). Skeletons are for **first paint of a known shape**.

### 4.2 Shape vocabulary

Three primitives, each mapped to a real element rather than to an abstract box:

| Primitive | Shape | Maps to | Size source |
|-----------|-------|---------|-------------|
| **Rectangle** | `radius.micro.xs` (4) | Body copy, titles, labels, input fields | Width in pt or `%`; height = the real variant's `lineHeight` |
| **Pill** | `radius.pill.full` | Status badges, filter chips, buttons, tags | `minHeight: lineHeight.xs + spacing.xxs × 2` (= the real `StatusBadge` height) |
| **Circle** | `radius.pill.full` on a square | Avatars, icon slots, tab glyphs | `avatarSizes.sm/md/lg`, or the icon preset |

**Fidelity rules.**

1. **Text lines are sized to the real line height, not to the font size.** A
   `body` line is `lineHeight.md` = 22pt tall; using 15pt makes the skeleton
   shorter than the content and reintroduces the jump it was meant to remove.
2. **A multi-line text block is N rectangles of the real line height separated by
   `spacing.xxs`**, with the final line at 60–70% width. Uniform full-width bars
   read as a table, not as prose.
3. **Circles are always square boxes** (single dimension for both width and
   height) — the same squaring rule as the icon atom.
4. **Colour:** `colors.skeleton` for the base shape. The animated overlay uses
   `colors.skeletonHighlight`. Both are scheme-aware, so dark mode does not get a
   white flash.
5. **No text is rendered inside a skeleton.** A skeleton must contain no copy at
   all: it is a shape, and a screen reader must not read a wireframe.
6. **No literal dimensions at call sites** — every shape reads a token, so a
   retuned line height automatically retunes the skeleton.

### 4.3 Compositions (mirror, don't invent)

Each composition mirrors a real screen's wireframe at the level of its layout
molecule, so the swap-in on data arrival is a no-op geometrically:

| Composition | Mirrors | Blocks |
|-------------|---------|--------|
| `SkeletonList` | A vertical list of cards | N × `CardSkeleton` with `gap: spacing.sm` |
| `SkeletonCard` | [`AppCard`](src/components/AppCard/AppCard.tsx:1) wrapping a shift/leave row | Real card padding (16) + radius (12); circle 40 + 2 text lines + a pill |
| `SkeletonRow` | [`AppListItem`](src/components/AppListItem/AppListItem.tsx:1) | Square leading slot + one full line + one 50% line |
| `SkeletonHeader` | The title block of [`AppHeader`](src/components/AppHeader/AppHeader.tsx:1) | Title line at `lineHeight.xl` + one label line |

Each composition renders inside a wrapper with `accessibilityRole="progressbar"`,
`accessibilityLabel="Loading"`, and `importantForAccessibility="no-hide-descendants"`
on the shapes, so a screen reader announces *one* loading region rather than 30
anonymous boxes.

### 4.4 Shimmer animation loop

**Workflow.**

1. One `Animated.Value` per skeleton **group** (not per shape), shared via
   context/props. Thirty independent loops would be thirty JS timers.
2. The loop is `Animated.loop(Animated.sequence([timing → 1, timing → 0]))` with
   `Easing.inOut(Easing.ease)`, `duration: 700ms` each way (1400ms cycle).
3. The animated value interpolates **opacity** from **0.3 → 0.7 → 0.3** and is
   applied to a highlight overlay drawn on top of the base shape. Opacity only:
   no `translateX` sweep, because a gradient sweep needs a masked gradient that
   is expensive on low-end Android, whereas an opacity crossfade is a composited
   property on every platform.
4. **`useNativeDriver: true` is mandatory.** Opacity is a transform-class
   property, so the entire loop runs on the UI thread. The JS thread stays free,
   which is what keeps `onPress`, tab switches and list scrolling responsive
   *while the skeleton animates* — the specific lockup this phase must prevent.
5. The animation starts on mount and is **stopped and reset on unmount**
   (`animation.stop()`) so a loop cannot outlive its screen and leak.
6. **Reduce Motion:** when the OS accessibility "Reduce Motion" flag is set, the
   loop is not started at all and the shape renders at a static
   `opacity: 0.5`. A perpetual pulsing animation is a genuine accessibility
   problem for motion-sensitive users.
7. Reduce Motion detection uses `AccessibilityInfo.isReduceMotionEnabled()` plus
   the `reduceMotionChanged` subscription, defaulting to **not** animating until
   the first read resolves (fail-safe: a static skeleton is always acceptable).
8. Skeleton shapes set `pointerEvents="none"` so the whole overlay is
   non-interactive — taps fall through to nothing rather than being swallowed.

### 4.5 Integration rule

A screen with a skeleton replaces `if (isLoading) return <LoadingView />` with
`if (isLoading) return <SkeletonList count={3} />`, keeping the same
`ScreenContainer` wrapper so the gutter, safe-area padding and scroll behaviour
are identical in both states. The skeleton must never be rendered *inside* the
real content's list; it is a sibling state of the whole content region.

---

## 5. Verification contract

1. `npx tsc --noEmit --ignoreDeprecations 6.0` — clean.
2. `npx jest` — all suites green.
3. `npx eslint src/components src/navigation` — zero errors, no new warnings.

Manual geometry checks:

* **Notched device:** header title clears the Dynamic Island; the last list row
  clears the home indicator; nothing is double-padded under a header.
* **Tab bar:** content scrolls *under* the bar and the final row is reachable;
  toggling tabs does not change any slot's width or height (badge is absolute,
  indicator stays mounted).
* **Card:** press and hold a tappable card in a list — the card scales to 0.99
  and tints, and the following card does not move. A flush `StatusBadge` is
  clipped by the 12pt corner.
* **Header:** a 60-character title ellipsises to one line and the Back target
  stays in the same place.
* **Skeleton:** shapes occupy the same geometry as the loaded content (no jump on
  arrival); the loop runs with the JS thread free — tabs and buttons stay
  responsive; enabling Reduce Motion freezes it at static 50% opacity.

# Phase 5 — Core App Dashboard & Navigation Views

Normative engineering blueprint for the three core operational screens:

1. **Personalized Home Dashboard** — `src/features/home/screens/HomeScreen.tsx`
2. **My Roster scheduling matrix** — `src/features/roster/screens/MyRosterScreen.tsx`
3. **Interactive Shift Detail** — `src/features/shifts/screens/ShiftDetailScreen.tsx`

This document is the contract. It is written against the real Phase 1–4 code in this
repository. Every token named below exists; every component named below exists or is
introduced by this phase. Where a column says *bounded*, the bound is a token, never a
magic number.

---

## §0 — Platform rules for this phase

These are numbered so a review comment can cite one. They are extensions of the
Phase 4 rules K1–K10 and do not replace them.

| ID | Rule | Rationale / enforcement |
|----|------|-------------------------|
| **V1** | **No un-virtualised `.map()` over a server collection.** Any list whose length is a function of API data must render through `FlatList` (or `FlashList`). | A `.map()` produces N mounted views for N rows regardless of viewport. 400 shifts = 400 mounted trees = dropped frames on scroll and a large retained memory graph. |
| **V2** | **A `FlatList` is never nested inside a `ScrollView`.** The screen shell must be non-scrolling when the screen owns a list. | Nesting collapses virtualization: the outer `ScrollView` gives the inner list unbounded height, so it mounts every row. This is why [`ScreenContainer`](src/components/ScreenContainer/ScreenContainer.tsx:27) already exposes `scrollable={false}`. |
| **V3** | **`keyExtractor` must return a stable identity** — the server `id`, never the array index. | Index keys re-bind row state to the wrong record after an insert/refetch: the row keeps its scroll position but shows another shift's data. |
| **V4** | **Row renderers are identity-stable.** A `renderItem` that closes over changing state must be wrapped in `useCallback`, and the row component in `React.memo`. | An unstable `renderItem` re-creates every visible row on every parent render — the list appears to work while burning the frame budget. |
| **V5** | **Fixed row height ⇒ `getItemLayout` is mandatory.** | Without it `FlatList` measures each row after layout, so `scrollToIndex` cannot work and the scrollbar is estimated. With it, scroll-to-row is exact and the list can position unrendered rows. |
| **V6** | **Windowing values are explicit properties, not defaults.** `initialNumToRender`, `maxToRenderPerBatch`, `windowSize`, `removeClippedSubviews`. | Defaults are tuned for short lists. Stating them makes the memory/scroll trade-off reviewable. |
| **V7** | **Section headers come from the list engine**, via `SectionList` or a typed discriminated-union row, never from a wrapping `.map()` of groups that each contain their own list. | Rule V2 again, applied to grouping. A "group contains a list" shape cannot be virtualised at all. |
| **V8** | **A sticky, absolutely-positioned bar must be laid out as a sibling of the scroller, not inside it**, and must reserve its height in the scroller's bottom content inset. | A bar inside the scroller scrolls away; a bar over the content without a reserved inset hides the last row underneath it. |
| **V9** | **Chevrons / drill-down affordances never intercept touches.** | The row is the touch target; the glyph is decoration. `AppIcon` already sets `pointerEvents="none"` — a hand-rolled glyph must do the same. |
| **V10** | **Semantic tint is never the only signal.** Every tinted status surface also states the status in words. | Extends K9. Colour-blind users and greyscale screens must still parse the shift state. |

---

## §1 — Shared structural primitives introduced by this phase

All five are presentation-only and API-agnostic, so they live in `src/components/` and
are exported from the barrel.

### 1.1 `GreetingHeader`

```
GreetingHeader                                    props: greeting, subtitle?, action?, background?
└── View  paddingTop = insets.top               ← one owner for the top inset (K6)
    └── View  paddingHorizontal = screenGutter (16)
              paddingTop = spacing.md (16)
              paddingBottom = spacing.lg (20)
        └── View  flexDirection row, alignItems flex-start, gap spacing.sm (12)
            ├── View  flex 1, gap spacing.xxs (4)
            │   ├── AppText  variant="overline"      colour = onPrimary @ 0.80 alpha
            │   │            numberOfLines = 1
            │   └── AppText  variant="headerLarge"   colour = onPrimary
            │                numberOfLines = 2, ellipsizeMode="tail"
            └── slot  {action}                       44×44 (K7)
                                                    alignSelf = flex-start
```

**Background.** The requested treatment is a brand gradient on the primary token. A
gradient in React Native requires either `react-native-linear-gradient` (a native
module — a rebuild) or hand-rolled stacked views. Neither is justified for a single
header, so the component accepts a `background` colour and the screens pass
`theme.colors.primary`. The token is already the brand fill and is contrast-checked
against `onPrimary` in both schemes. The prop is a plain colour, so swapping in a
gradient component later is a one-line change at the call site and touches no screen
layout.

**Bounds.** The header's total height is `Σ(top inset, spacing.md, overline line
height 16, spacing.xxs 4, headerLarge line height 32, spacing.lg 20)`. It is therefore
fully derived — never a fixed pixel height — so a raised OS text size grows the header
instead of clipping the greeting.

### 1.2 `SummaryHeroCard`

```
SummaryHeroCard                    props: eyebrow, value, unit?, status, statusLabel, footnote?
└── AppCard  elevated="medium"          ← macro container, non-scrolling
             backgroundColor = primarySoft
             borderColor       = primaryBorder
             radius            = radiusRoles.macro.lg (16)   ← larger than a row card
    └── View  gap spacing.sm (12)
        ├── AppText variant="overline"  colour = textSecondary
        ├── View  flexDirection row, alignItems flex-end, gap spacing.xs (8)
        │   ├── AppText variant="display"  colour = primary
        │   │            fontVariant tabular-nums      ← the hours figure must not jitter
        │   └── AppText variant="subtitle" colour = textSecondary  marginBottom spacing.xxs
        │            (visually baseline-aligned to the display figure)
        ├── StatusBadge  status={status}  label={statusLabel}
        └── AppText variant="caption" colour = textSecondary
```

**Non-scrolling.** Per the brief this card is a *macro* container that does not
participate in the scroll. In the Home tree (§2) it is rendered as the `ListHeaderComponent`
of the shift feed, which is the only structural position that satisfies *both* "stays
above the feed" and V2 ("no list inside a scroller"). It scrolls with the feed rather
than being pinned, which is deliberate: pinning it would consume ~40% of a small
viewport permanently and leave the feed unusable.

### 1.3 `WeekDayStrip`

```
WeekDayStrip                     props: days: string[], selectedDate, onSelect, isToday
└── FlatList  horizontal
    horizontal            = true
    data                  = {days}                      (exactly 7)
    keyExtractor          = (day) => day                ← the date IS the identity (V3)
    showsHorizontalScrollIndicator = false
    getItemLayout = (_, index) => ({ length: CELL, offset: CELL * index, index })
    initialNumToRender    = 7                           ← all 7 fit; no windowing benefit
    maxToRenderPerBatch   = 7
    windowSize            = 3                           ← one screen either side
    removeClippedSubviews = true
    contentContainerStyle = { paddingHorizontal: screenGutter, gap: spacing.xs (8) }
    renderItem            = memoised DayCell
    └── DayCell   width = CELL, height = CELL_HEIGHT
        └── Pressable
            accessibilityRole = "button"
            accessibilityState = { selected }
            accessibilityLabel = "Wed 15 Oct, selected"
            style:
              ┌ Idle state                        ┌ Selected / Today state
              │ backgroundColor = surface         │ backgroundColor = primary
              │ borderColor     = border          │ borderColor     = primary
              │ text colour     = text            │ text colour     = textInverse
              │ weight          = regular         │ weight          = semibold
              │ shadow          = none            │ elevation = shadows.low
              └ radius = radiusRoles.micro.md (8)
                borderWidth = borderWidths.hairline (1)
                minHeight   = MIN_TOUCH_TARGET (44)      ← K7
            └── View  alignItems center, gap spacing.xxs (4)
                ├── AppText variant="caption"   → weekday short ("Wed")
                ├── AppText variant="bodyStrong" → day number ("15")
                └── View  activeDot  width 6, height 6
                          borderRadius radiusRoles.pill.full
                          backgroundColor = {selected ? onPrimary : primary}
                          opacity 1 when selected-or-today, else 0
```

**Why a dot **and** a fill.** The dot is the *today* marker and the fill is the
*selection* marker. They are independent facts: a user can select a day that is not
today, and can be looking at a week whose today cell is unselected. Encoding both in one
channel would lose one. A zero-height placeholder is not used — the dot is always
mounted at `opacity 0` so the cell height cannot change when it appears (K4).

`CELL` is derived, not hardcoded: `CELL = (min(screenWidth, layout.maxContentWidth) −
2 × screenGutter − 6 × spacing.xs) / 7`, so 7 cells plus their 6 gaps exactly fill the
gutter-to-gutter measure with no partial cell peeking at the edge.

### 1.4 `StatusScaffold`

A full-bleed, tinted strip whose background is chosen from a semantic state.

```
StatusScaffold              props: tone: 'info'|'success'|'warning'|'danger'|'neutral',
                                  title, description?, trailing?, children?
└── View  width '100%'
          backgroundColor = TONE[tone].background      ← soft token
          borderColor     = TONE[tone].border
          borderWidth     = borderWidths.hairline (1)
          borderRadius    = radiusRoles.macro.md (12)
          paddingVertical   = spacing.md (16)
          paddingHorizontal = screenGutter (16)
    └── View  gap spacing.xs (8)
        ├── View  flexDirection row, alignItems center, gap spacing.sm (12)
        │   ├── AppText variant="bodyStrong" colour = TONE[tone].text   flex 1
        │   └── {trailing}
        ├── AppText variant="body" colour = TONE[tone].text        (when description)
        └── {children}
```

`TONE` maps onto the Phase 1 soft/strong pairs, which are already contrast-tuned in both
schemes:

| tone | background | text / border |
|------|-----------|---------------|
| `info` | `infoSoft` | `infoStrong` / `primaryBorder` |
| `success` | `successSoft` | `successStrong` / `success` |
| `warning` | `warningSoft` | `warningStrong` / `warning` |
| `danger` | `dangerSoft` | `dangerStrong` / `danger` |
| `neutral` | `surfaceMuted` | `textSecondary` / `border` |

Per V10 the `title` is mandatory: a tint without a word is unreadable in greyscale.

### 1.5 `DetailMatrix`

```
DetailMatrix                       props: rows: MatrixRow[]
                                         MatrixRow = { key, label, value, icon, tone? }
└── AppCard  padded = true
    └── View  gap spacing.md (16)
        ├── (for each row, a micro sub-container)
        │   └── View
        │       ├── View  flexDirection row, alignItems center, gap spacing.xs (8)
        │       │   ├── AppIcon  icon={row.icon}
        │       │   │            size="small" (16)
        │       │   │            colour = row.tone ?? 'textSecondary'
        │       │   │            accessibilityLabel = undefined      ← decorative (V9)
        │       │   └── AppText variant="label" colour = textSecondary
        │       │                numberOfLines = 1
        │       └── AppText variant="bodyStrong" colour = text
        │                numberOfLines = 2, ellipsizeMode="tail"
        │                marginTop spacing.xxs (4)
        └── Divider  inset              (between rows, not after the last)
```

**2-column matrix without `flexWrap`.** The key sits in a left column and the value in a
right column on each row: `label` slot `flexBasis` 40%, `value` slot `flexBasis` 60%,
`flexShrink: 1` on both. This is a fixed two-column grid at row granularity — it gives the
aligned scan of a table without the K10-prohibited `flexWrap`, and without the ellipsis
behaviour of a single line. Rows that would land under a 40% measure (long addresses)
wrap to two lines inside the value column instead of pushing the label.

**Every label carries an icon** per the brief. The glyph set is extended with
`ClockGlyph` (times), `MapPinGlyph` (locations), `UserGlyph` (supervisors/employee),
`CalendarGlyph` (dates), `TagGlyph` (position/department), `NoteGlyph` (notes),
`InfoGlyph` (misc) — the same primitive-bar technique as the Phase 4 set, because no
vector library is installed.

### 1.6 `StickyActionTray`

```
StickyActionTray                        props: children, secondary?: ReactNode
└── View  position 'absolute'
          left 0, right 0, bottom 0                       ← locked to the viewport (V8)
          paddingBottom = insets.bottom                   ← hardware bottom inset (K6)
          paddingTop    = spacing.sm (12)
          paddingHorizontal = screenGutter (16)
          gap spacing.sm (12)
          backgroundColor   = surface
          borderTopWidth    = borderWidths.hairline (1)
          borderTopColor    = border
          elevation         = shadows.medium
    ├── {secondary}
    └── View  flexDirection row, gap spacing.sm (12)
        └── {children}                                   ← one or two AppButtons, flex 1 each
```

The tray is a **sibling of the scroller**, never a child (V8). The screen therefore
passes the tray's measured height into the scroller's `contentContainerStyle.paddingBottom`,
so the final detail row can always be scrolled clear of the tray. The tray reports its
own height via `onLayout` rather than the screen guessing it, so a two-line button label
or a raised OS text size cannot cause an overlap.

---

## §2 — Screen 1: Personalized Home Dashboard

Screen root: `ScreenContainer scrollable={false}` (V2) with one `FlatList` inside.

```
HomeScreen                                       ← 4 exclusive view-states
│
├── STATE loading
│   └── ScreenContainer scrollable={false}
│       ├── GreetingHeader greeting={`Good ${partOfDay()}, ${firstName}`}
│       │                  subtitle={formatDate(today, { long: true })}
│       │                  action={NotificationBell}
│       └── ScrollView (or list with SkeletonRow children)
│           └── HomeSkeleton                        ← Phase 3 shapes
│
├── STATE error-locked                             ← 403 + subscription/trial message
│   └── GreetingHeader + StatusScaffold tone="warning"
│         title="Account unavailable"
│         description={error.message}
│         children=<AppText variant="caption">Ask your company administrator…</AppText>
│       ← deliberately NO retry: an admin web task; retrying a lock can never succeed
│
├── STATE error                                    ← any other failure
│   └── GreetingHeader + ErrorView onRetry={refresh}
│
├── STATE no-employee                              ← signed in, no linked employee record
│   └── GreetingHeader + EmptyState "No employee record"
│
└── STATE ready
    └── ScreenContainer scrollable={false}
        ├── GreetingHeader …                       ← sticky: outside the list
        └── FlatList<FeedRow>                      ← THE shift feed
            data                 = feedRows
            keyExtractor         = (row, i) => row.id
            renderItem           = renderRow        (useCallback, V4)
            ListHeaderComponent  = <TodayHero/>
            ListFooterComponent  = <NextUpPreview/>
            ItemSeparatorComponent = ({leadingItem}) => <Separator h={spacing.md}/>
            refreshControl       = <RefreshControl/>
            initialNumToRender   = 4
            maxToRenderPerBatch  = 6
            windowSize           = 5
            removeClippedSubviews = true
            contentContainerStyle = { paddingHorizontal: screenGutter,
                                      paddingBottom: insets.bottom + spacing.huge (64) }
```

### 2.1 Feed row model

The feed is a heterogeneous list, so it is modelled as a **discriminated union** rather
than a chain of `.map()` calls (V1, V7):

```ts
type FeedRow =
    | { kind: 'section'; id: string; title: string; count: number }
    | { kind: 'shift';   id: string; shift: Shift };
```

`feedRows` is built once per data change inside a `useMemo`, and `renderRow` switches on
`row.kind`. This keeps one virtualised engine for both section headers and shift rows —
the alternative (a `View` per section, each containing its own list) is exactly the shape
V2/V7 forbid.

### 2.2 `Today` summary hero (the non-scrolling macro card)

```
ListHeaderComponent
└── View  gap spacing.md (16)
    ├── SummaryHeroCard
    │     eyebrow  = "Worked today"
    │     value    = formatDurationParts(todayMinutes).hours   ← the large figure
    │     unit     = formatDurationParts(todayMinutes).minutes  ← e.g. "30m"
    │     status   = clockStatus     ('completed' | 'scheduled' | 'cancelled')
    │     statusLabel = CLOCK_LABELS[clockStatus]
    │     footnote = `${todayShifts.length} shift(s) today`
    └── (nothing else — the hero is the top of the scroll, not a banner)
```

`CLOCK_LABELS` is an explicit map so the pill never shows a raw enum:

| underlying `shift.status` | pill `label` | pill tone (via `StatusBadge`) |
|---|---|---|
| `completed` | `Clocked out` | `success` |
| `scheduled` | `Not clocked in` | `info` |
| `cancelled` | `Cancelled` | `danger` |
| `swap_requested` | `Swap requested` | `warning` |

`hours` / `minutes` are produced by `formatDurationParts(minutes)` — a new pure helper
beside [`formatDuration`](src/utils/date.ts:282) that splits minutes into a whole-hour
count and a padded remainder, so the display figure can be typeset at `display` size
while the remainder sits beside it at `subtitle`. The number is `tabular-nums`, so it
does not shift width when the total changes from 9h to 10h.

**Clock-in status** is derived, not invented: there is no employee-facing clock API in
this codebase (spec Screen 6 BACKEND GAP), so the pill reflects the *shift record's*
status. It is derived from today's shifts in this precedence — any `scheduled` ⇒
`Not clocked in`; else all `completed` ⇒ `Clocked out`; else `cancelled`/`swap_requested`
as-is; no shifts ⇒ no pill (the empty state below applies instead).

### 2.3 Upcoming shift feed row (the ShiftCard contract)

`ShiftCard` is rewritten to the exact three-slot layout the brief mandates. It becomes a
fixed-height row, which is what makes V5's `getItemLayout` legal.

```
ShiftCard (memo)                       props: shift, onPress, showDate?
└── Pressable
    accessibilityRole  = "button"
    accessibilityLabel = "Shift Wed 15 Oct, 9:00 AM to 5:00 PM, scheduled"
    style  ┌ pressed → backgroundColor surfaceMuted, opacity 0.9
           └ idle    → backgroundColor surface
      borderColor = border, borderWidth = hairline, radius = radiusRoles.macro.md (12)
      padding = spacing.md (16)
      minHeight = ROW_HEIGHT (76)                  ← fixed ⇒ getItemLayout valid (V5)
      flexDirection row, alignItems center, gap spacing.md (16)
    │
    ├── LEFT — time bounds (bold)
    │   View  minWidth 64, gap spacing.xxs (4)
    │   ├── AppText variant="time"            fontVariant tabular-nums
    │   │            numberOfLines 1          {formatTime(start_time)}
    │   └── AppText variant="caption" colour textMuted
    │            numberOfLines 1              {formatTime(end_time)}
    │
    ├── CENTRE — location + department
    │   View  flex 1, gap spacing.xxs (4), minWidth 0     ← minWidth 0 is required
    │   ├── AppText variant="bodyStrong" numberOfLines 1 ellipsizeMode "tail"
    │   │            {position?.name ?? 'Shift'}          ← the role
    │   ├── AppText variant="caption" colour textSecondary numberOfLines 1
    │   │            {department?.name ?? '—'}            ← the department
    │   └── AppText variant="label" colour textMuted numberOfLines 1
    │            {branch?.name ?? 'Unassigned branch'}    ← the location
    │
    └── RIGHT — drill-down chevron
        View  width 24, alignItems 'flex-end'
        ├── StatusBadge  status={shift.status}      (hidden when width < 360)
        └── AppIcon  icon={ChevronRightGlyph} size="small" colour="textMuted"
                     accessibilityLabel={undefined}      ← decorative (V9)
```

`minWidth: 0` on the centre slot is load-bearing: a flex child without it refuses to
shrink below its content width on both platforms, so a long department name would push
the chevron off-screen instead of ellipsising. `numberOfLines={1}` plus `ellipsizeMode`
on every centre line keeps `ROW_HEIGHT` constant, which is what keeps `getItemLayout`
honest.

**Narrow-width rule.** `StatusBadge` is dropped below 360pt width. The three text slots
plus the badge cannot all be legible at that measure; the badge is the one element whose
information is duplicated by the card's tint-free context and by the detail screen, so it
is the correct one to sacrifice. The time, location, department and chevron always
survive.

### 2.4 `Next Up` preview slot

```
ListFooterComponent
└── View  gap spacing.sm (12)
          marginTop spacing.lg (20)
          paddingTop spacing.md (16)
          borderTopWidth hairline, borderTopColor divider      ← the "subtle rule"
          backgroundColor surfaceSunken        ← low-elevation well, not a raised card
          borderRadius radiusRoles.macro.md (12)
          padding spacing.md (16)
    ├── AppText variant="overline" colour textMuted     "NEXT UP"
    ├── (when nextShift)
    │   ├── AppText variant="bodyStrong"  {formatDate(nextShift.date, { withWeekday: true })}
    │   ├── AppText variant="body" colour textSecondary
    │   │        {formatTime(start)} – {formatTime(end)} · {branch.name}
    │   └── Pressable "View shift"  variant="text" size="sm"
    └── (when !nextShift)
        └── AppText variant="body" colour textMuted
                 "Nothing scheduled in the next 7 days."
```

`elevated="none"` (a `surfaceSunken` well with a hairline rule) is what makes this read
as a *preview* rather than a second card competing with the hero. It is the last element
in the list, so it needs no absolute positioning and no reserved inset.

---

## §3 — Screen 2: My Roster scheduling matrix

```
MyRosterScreen
└── ScreenContainer scrollable={false}                    ← V2
    ├── AppHeader title="My Roster"                        ← week chrome lives below
    ├── WeekNavigationRow
    │   └── View  flexDirection row, alignItems center, gap spacing.sm (12)
    │             paddingHorizontal screenGutter
    │             paddingBottom spacing.sm (12)
    │       ├── Pressable  accessibilityLabel="Previous week"
    │       │              hitSlop spacing.sm
    │       │              style: 44×44 (K7), radius radiusRoles.pill.full,
    │       │                     backgroundColor surface, borderColor border,
    │       │                     pressed → surfaceMuted
    │       │   └── AppIcon icon={ChevronLeftGlyph} size="medium" colour="text"
    │       ├── View  flex 1
    │       │   └── AppText variant="bodyStrong"  ← bold week range
    │       │            textAlign 'center'
    │       │            numberOfLines 1
    │       │            accessibilityRole "header"
    │       │            {formatDayMonth(weekStart)} – {formatDayMonth(weekEnd)}
    │       └── Pressable  accessibilityLabel="Next week"  …mirror of the left button
    │           └── AppIcon icon={ChevronRightGlyph} size="medium" colour="text"
    ├── WeekDayStrip  days selectedDate onSelect isToday      ← §1.3, horizontal FlatList
    └── SectionList<Shift, Section>                            ← THE chronological feed
        sections             = Section[]  (one per day WITH shifts)
        stickySectionHeadersEnabled = true
        keyExtractor         = (item) => String(item.id)       ← V3
        renderItem           = memoised ShiftCard              ← fixed height ⇒ V5 holds
        renderSectionHeader  = (info) => <DayDivider/>
        getItemLayout        = (_, index) => …                 ← derived from the flattened
                                                                 section/index map below
        initialNumToRender   = 6
        maxToRenderPerBatch  = 6
        windowSize           = 5
        removeClippedSubviews = true
        refreshControl       = <RefreshControl/>
        ListEmptyComponent   = <EmptyState …/>  (only after a successful load)
        contentContainerStyle = { paddingHorizontal: screenGutter,
                                  paddingBottom: insets.bottom + layout.tabBarHeight + spacing.md }
```

### 3.1 `SectionList` vs the typed-union `FlatList`

Both are legal under V1/V7. `SectionList` is chosen here because the section header must
be **sticky** (`stickySectionHeadersEnabled`), and `SectionList` implements stickiness as
a native behaviour rather than as an `Animated` interpolation the app would have to
maintain. The Home feed uses the union form because its header (`TodayHero`) is *not*
sticky. Two engines, two deliberate reasons.

`getItemLayout` for a `SectionList` needs the running offset in **flattened** index space,
so the screen computes it once per data change:

```ts
// Flattened index = each section's header row + its item rows, in order.
// sectionStart[i] = Σ_{j<i} (1 header + items_j.length)
const offsets = useMemo(() => { /* build header+row prefix sums once */ }, [sections]);
```

The function must count section headers, because `SectionList` passes the flattened index.
Omitting them is the classic bug that makes `scrollToLocation` land one or two rows short.

### 3.2 `DayDivider` (section header)

```
DayDivider                                  props: date, count
└── View  backgroundColor background          ← opaque, so rows scroll *under* it cleanly
          paddingVertical spacing.sm (12)
          paddingHorizontal screenGutter
          flexDirection row, alignItems baseline, justifyContent space-between
    ├── AppText variant="subtitle"  {formatDate(date, { withWeekday: true })}
    │            accessibilityRole "header"
    └── AppText variant="caption" colour textMuted
                 {count} shift{count === 1 ? '' : 's'}
```

The background must be the opaque canvas colour, not `surface`: a translucent sticky
header lets the rows behind it show through as it docks.

### 3.3 Skeleton state for a week fetch

Per the brief the Phase 3 skeletons are triggered while a *new* week is fetched. The
distinction that matters is **initial load vs week change**:

| Trigger | `isLoading` | `isRefetching` after first success | Rendered |
|---|---|---|---|
| First mount | `true` | `false` | `RosterSkeleton` full-screen below the header |
| Prev/Next week tapped | `false` | `true` | Header + nav row + day strip stay interactive; the **list region** swaps to `RosterSkeleton` |
| Pull to refresh | `false` | `true` | Real rows stay mounted; only the `RefreshControl` spins |

Swapping the whole screen for a skeleton on a week change would unmount the day strip the
user just tapped and throw away scroll position — the nav row must remain live so a
mis-tap is immediately correctable.

```
RosterSkeleton
├── SkeletonDayStrip        ← 7 × SkeletonRect(width CELL, height CELL_HEIGHT, radius micro.md)
│                             in a non-scrolling row, margins preserved
└── SkeletonGroup           ← ONE Animated.Value for the whole group (Phase 3 rule)
    ├── SkeletonRect  width '40%', height = lineHeight.lg (24)   ← divider line
    └── 2 × SkeletonShiftCard
        └── row: SkeletonRect(56 × 32)  +  SkeletonText(lines 2)  +  SkeletonPill()
```

`SkeletonShiftCard`'s height is **exactly `ROW_HEIGHT`** and `SkeletonDayStrip`'s cells are
exactly `CELL × CELL_HEIGHT`, so the swap from skeleton to real content moves nothing.
That is the entire point of skeleton-loading a list.

### 3.4 View-state mapping

| State | Condition | Composition |
|---|---|---|
| `loading` | `employeeId !== null && isPending` | header + `RosterSkeleton` |
| `week-loading` | previously loaded, `isRefetching` | header + live nav/strip + `RosterSkeleton` in list region |
| `error-locked` | `isCompanyAccessLocked(error)` | header + `StatusScaffold tone="warning"` — no retry |
| `error` | any other failure | header + `ErrorView onRetry` |
| `no-employee` | `employeeId === null` | header + `EmptyState "No employee record"` |
| `empty` | loaded, `totalShifts === 0` | header + nav + strip + `EmptyState` with "Go to current week" |
| `ready` | loaded, `totalShifts > 0` | full tree above |

`empty` is only reachable after a successful load, because `isLoading` is checked first —
a slow network must never read as "no shifts this week".

### 3.5 Idle vs selected day cell

Restating §1.3 as the screen's contract, because the brief calls it out explicitly:

| Property | Idle | Selected / Today |
|---|---|---|
| `backgroundColor` | `surface` | `primary` |
| `borderColor` | `border` | `primary` |
| weekday + day number colour | `textMuted` / `text` | `textInverse` / `textInverse` |
| weight | `regular` / `medium` | `semibold` |
| shadow / elevation | none | `shadows.low` |
| active dot | `opacity 0` (space reserved) | `opacity 1`, fill `onPrimary` |
| `accessibilityState.selected` | `false` | `true` |

---

## §4 — Screen 3: Interactive Shift Detail

```
ShiftDetailScreen
└── View  flex 1, backgroundColor background            ← fixed native container
    ├── (top safe-area inset is owned here — there is no AppHeader on this screen)
    ├── ScrollView
    │     contentContainerStyle = { paddingTop: insets.top + spacing.sm,
    │                               paddingHorizontal: screenGutter,
    │                               paddingBottom: trayHeight + spacing.xxl (32) }
    │     showsVerticalScrollIndicator = false
    │   ├── BackRow
    │   │   └── Pressable  accessibilityRole "button"
    │   │                  accessibilityLabel "Go back"
    │   │                  hitSlop spacing.sm
    │   │                  style 44×44 (K7), radius radiusRoles.pill.full,
    │   │                         backgroundColor surface, borderColor border
    │   │       └── AppIcon icon={ArrowLeftGlyph} size="medium" colour="text"
    │   ├── StatusHeroStrip                          ← §4.1
    │   ├── AppText variant="headerLarge"  {formatTime(start)} – {formatTime(end)}
    │   │            fontVariant tabular-nums
    │   ├── AppText variant="body" colour textSecondary
    │   │            {formatDate(date, { long: true })}
    │   ├── DetailMatrix rows={whenRows}             ← §4.2, clock + calendar icons
    │   ├── DetailMatrix rows={whereRows}            ← map-pin + tag icons
    │   ├── DetailMatrix rows={whoRows}              ← user icons
    │   ├── DetailMatrix rows={notesRows}            ← only when notes exist
    │   └── AppText variant="caption" colour textMuted
    │              "Times are shown as scheduled. Contact your manager…"
    └── StickyActionTray                             ← §1.6, ABSOLUTE, sibling of scroller
```

The back affordance is a 44×44 target containing the `ArrowLeftGlyph` — the same arrow the
Phase 4 [`AppHeader`](src/components/AppHeader/AppHeader.tsx:93) back slot uses, so the
gesture is visually identical across the app. This screen deliberately does **not** use
`AppHeader`: it needs the status strip to bleed full-width under the top inset, which a
centred-title header cannot do.

### 4.1 Status hero strip

```
StatusHeroStrip
└── StatusScaffold tone={TONE_BY_STATUS[shift.status]}
      title={LABEL_BY_STATUS[shift.status]}
      description={DETAIL_BY_STATUS[shift.status]}
      trailing={<StatusBadge status={shift.status} />}
```

| `shift.status` | `tone` | tint | `title` | `description` |
|---|---|---|---|---|
| `scheduled` | `info` | `infoSoft` (brand-blue wash) | `Scheduled` | "Your shift is confirmed. See you then." |
| `completed` | `success` | `successSoft` (light green) | `Completed` | "This shift is finished." |
| `cancelled` | `danger` | `dangerSoft` (light red) | `Cancelled` | "This shift was cancelled by the office." |
| `swap_requested` | `warning` | `warningSoft` (soft amber) | `Swap requested` | "A swap is awaiting approval." |

The tint is full-bleed to the screen edges (the strip breaks out of the gutter with a
negative horizontal margin of `-screenGutter`), which is what makes it read as a *status*
rather than as another card. It spans the full width because the brief asks for a
full-width hero strip; the surrounding detail blocks stay inside the 16pt gutter.

### 4.2 The detail matrices

`whenRows` (clock + calendar icons):

| key | label | icon | value |
|---|---|---|---|
| `start` | `Starts` | `ClockGlyph` | `formatTime(start_time)` |
| `end` | `Ends` | `ClockGlyph` | `formatTime(end_time)` |
| `duration` | `Duration` | `ClockGlyph` | `formatDuration(minutes)` |
| `break` | `Break` | `ClockGlyph` | `"{n} min (paid\|unpaid)"` or `"None"` |

`whereRows` (map-pin icons):

| key | label | icon | value |
|---|---|---|---|
| `branch` | `Location` | `MapPinGlyph` | `branch?.name ?? 'Not assigned'` |
| `address` | `Address` | `MapPinGlyph` | `branch?.address` (row omitted if null) |
| `timezone` | `Timezone` | `MapPinGlyph` | `branch?.timezone` (row omitted if null) |

`whoRows` (user icons):

| key | label | icon | value |
|---|---|---|---|
| `role` | `Position` | `TagGlyph` | `position?.name ?? 'Not assigned'` |
| `department` | `Department` | `TagGlyph` | `department?.name ?? 'Not assigned'` |
| `employee` | `Assigned to` | `UserGlyph` | `employee?.full_name ?? 'Unassigned'` |
| `roster` | `Roster week` | `CalendarGlyph` | `formatDayMonth(week_start) – formatDayMonth(week_end)` (omitted when no roster) |

**Omission, not blank rows.** A row whose value is `null` is dropped from the array
entirely rather than rendered with a dash. A matrix of four "Not assigned" lines reads as
missing data; three rows that all have values reads as a complete record.

### 4.3 Sticky action tray — action matrix

The tray is a sibling of the scroller (V8). The actions are **context-specific per the
brief**, but this codebase has no employee-facing shift-transition API (spec Screen 6
BACKEND GAP: `PUT /shifts` requires `shift.edit` → 403). Buttons that can only 403 are
worse than no buttons, so every action in the tray is an action that genuinely exists:

| `shift.status` | Primary | Secondary | Why these |
|---|---|---|---|
| `scheduled` | `Add to calendar` (`primary`, lg) | `Contact manager` (`text`) | Both resolve to OS/navigation surfaces that exist. No `Clock In` — no clock API exists, so the button would be dead. |
| `swap_requested` | `Contact manager` (`primary`, lg) | `View roster` (`text`) | The request is already filed; the user's next step is to chase it. |
| `completed` | `View roster` (`primary`, lg) | — | Nothing to action; the trail forward is the roster. |
| `cancelled` | `Contact manager` (`primary`, lg) | `View roster` (`text`) | A cancellation is the one case where the user must act. |

**Danger variant rule.** `AppButton`'s `variant="danger"` is reserved for a genuinely
destructive, permitted action. For a `cancelled` shift the destructive event has already
happened, so the tray does not raise a red button — red is for *this will delete
something*, not *something was deleted*. The only place a `danger` button would be correct
here is a decline action, and the API does not expose one; the matrix above therefore
contains no `danger` variant, and that absence is intentional, not an oversight.

`View roster` navigates via the tab parent (`navigation.getParent()?.navigate('RosterTab')`),
matching the existing helper in HomeScreen.

### 4.4 View-state mapping

| State | Condition | Composition |
|---|---|---|
| `loading` | `query.isPending` | fixed container + back row + `LoadingView`; **no tray** (nothing to action yet) |
| `error` | `isError \|\| !data` | fixed container + back row + `ErrorView onRetry`; no tray |
| `ready` | data present | full tree, tray pinned |

The tray is absent while loading and on error because an action bar over a spinner is a
promise the screen cannot keep.

---

## §5 — Interaction & performance contract

| Concern | Rule |
|---|---|
| Row identity | `keyExtractor` = `String(item.id)` or the date string for day cells (V3) |
| Row memoisation | `ShiftCard` exported with `React.memo`; comparison is the default shallow compare, which is correct because `shift` objects come from one query cache |
| Callback stability | every `renderItem`, `renderSectionHeader` and `getItemLayout` is a `useCallback` with explicit deps (V4) |
| Fixed heights | `ROW_HEIGHT` (ShiftCard), `CELL` / `CELL_HEIGHT` (day cell), skeleton equivalents — all exported so `getItemLayout` and the skeletons cannot drift apart |
| Press feedback | `ShiftCard` reuses the Phase 2 press contract: `backgroundColor → surfaceMuted`, `opacity 0.9`. Scale is not used on list rows — a transform inside a virtualised list forces a re-composite per row |
| Motion | `useReduceMotion()` gates the skeleton shimmer (Phase 3); no new animation is introduced by this phase |
| Touch targets | every interactive element ≥ 44×44 via `minHeight`/`hitSlop`, independent of its painted size (K7) |
| Accessibility | list has `accessibilityRole="list"` semantics via the header structure; each row announces date + times + status as one label; tinted surfaces always state their status in words (V10) |
| Insets | `insets.top` owned by `GreetingHeader` or the detail screen; `insets.bottom` owned by `ScreenContainer` or `StickyActionTray`. Never both (K6) |

## §6 — Phase 3 skeleton reuse

| Screen | Skeleton | Composed of |
|---|---|---|
| Home | `HomeSkeleton` (existing, retained) | `SkeletonRect` + `SkeletonText` |
| My Roster | `RosterSkeleton` (new) | `SkeletonDayStrip` + `SkeletonGroup` + `SkeletonShiftCard` |
| Shift Detail | none — `LoadingView` | The detail shape is a handful of blocks; a spinner is honest and cheaper, and there is no list to align |

Skeleton geometry tracks the real geometry exactly (§3.3), which is the only reason a
skeleton is better than a spinner on a list.

## §7 — Verification contract

1. `npx tsc --noEmit --ignoreDeprecations 6.0` → exit 0.
2. `npx jest --silent` → no regressions against the Phase 4 baseline (28 suites / 219
   tests); new suites for `formatDurationParts`, the Home feed-row builder, the status
   mappings, and the roster `getItemLayout` offset math.
3. `npx eslint … --ext .ts,.tsx` → 0 errors; warning count must not rise above the Phase 4
   baseline of 6.
4. No `.map()` renders a server collection anywhere in the three screens (V1) — the only
   `.map()` calls permitted are over statically-bounded arrays (the 7 day cells are a
   `FlatList`; a fixed 5-entry action list is not).

# Phase 6 — Workflows, Form Submissions & User Settings

> **Scope.** Three screens, built exclusively from the Phase 1–5 token set and atom/molecule
> inventory. No web select drops, no web form paradigms, no raw-`.map` row rendering.
>
> **Prohibitions carried in from earlier phases, restated because they bind hardest here:**
> - No HTML/CSS constructs (`%` heights on flex children, `position: fixed`, `::before`,
>   `box-shadow` strings, `<select>`, `<input>`). Everything is RN flex or RN absolute.
> - All geometry in pt **integers** (the one sanctioned exception is an `opacity` value).
> - Every list is `FlatList` / `SectionList`. No un-virtualised `.map` produces a scrolling feed.
> - No dead controls. If the backend or the native layer cannot do a thing, the UI says so
>   rather than rendering a button that lies.

---

## 0. Cross-cutting decisions taken before any screen

### 0.1 The native date picker gap (blocking, resolved by seam)

The brief requires *"dual Date Input Fields that trigger native, platform-specific iOS/Android
modal date/time pickers rather than raw web text drops."*

`package.json` dependencies are:

```
@hookform/resolvers, @notifee/react-native, @react-native-async-storage/async-storage,
@react-native-firebase/app, @react-native-firebase/messaging, @react-native/new-app-screen,
@react-navigation/bottom-tabs, @react-navigation/native, @react-navigation/native-stack,
@tanstack/react-query, axios, react, react-hook-form, react-native, react-native-config,
react-native-safe-area-context, react-native-screens, zod, zustand
```

**There is no `@react-native-community/datetimepicker`.** The current
[`CreateLeaveRequestScreen.tsx`](src/features/leave/screens/CreateLeaveRequestScreen.tsx:370)
therefore ships two `AppTextInput`s with `placeholder="YYYY-MM-DD"` — precisely the raw web text
drop the brief forbids.

**Resolution — a `DateField` that owns a one-line native seam.**

`DateField` renders a *presentational* press target (calendar glyph + formatted value + chevron,
identical chrome to a settings row) and delegates the actual modal to an injected renderer:

```ts
type DateFieldProps = {
    label: string;
    /** API-shaped `YYYY-MM-DD`, or '' when unset. Never a display format. */
    value: string;
    onChange: (apiDate: string) => void;
    error?: string;
    helper?: string;
    required?: boolean;
    minimumDate?: string;
    testID?: string;
};
```

The screen passes `renderModal` from a single module, `src/features/leave/utils/datePicker.ts`,
which is the **only** place that knows how a date is chosen. That module has two branches:

1. **Native branch** — if `@react-native-community/datetimepicker` resolves, it renders
   `DateTimePicker` with `display="spinner"` on iOS (inside a `Modal` with
   `presentationStyle="pageSheet"`) and the platform dialog on Android, then maps the returned
   `Date` through `toApiDate()`.
2. **Fallback branch** — the module reports `isNativePickerAvailable === false`, and
   `DateField` renders an inline `AppTextInput` constrained to `apiDate` format, prefixed by a
   visible caption: *"Native date picker unavailable in this build — type YYYY-MM-DD."*

This is the same discipline as Phase 5's Shift Detail (which offers no Clock-In button because no
employee-facing transition route exists) and AccountScreen (which offers no avatar upload because
of backend gap G4). **The capability gap is surfaced in the UI, not hidden behind a broken
control.** When the dependency lands, the fallback branch becomes unreachable and is deleted,
with zero changes to any screen: the seam is one prop.

`toApiDate(date: Date): string` and `fromApiDate(value: string): Date` are added to
[`src/utils/date.ts`](src/utils/date.ts:81) next to the existing `parseApiDate`, because the
existing `parseApiDate` treats a bare `YYYY-MM-DD` as **local** midnight (correct) while
`new Date('2026-09-16')` parses as **UTC** midnight (a classic off-by-one-day bug). The new pair
is the only sanctioned round-trip.

### 0.2 Accent-strip geometry (how a left edge stripe survives a rounded card)

A stripe parented to a card with `radius.lg` (16) must not square off the corner. The stripe is
**not** a child of the card; it is a sibling inside a wrapper that owns the clipping:

```
<Pressable style={{ flexDirection:'row', borderRadius: radius.lg, overflow:'hidden' }}>
    <View style={{ width: 4, backgroundColor: <statusStrong> }} />
    <AppCard style={{ flex:1, borderRadius:0, borderTopLeftRadius:0, borderBottomLeftRadius:0 }} />
</Pressable>
```

`overflow:'hidden'` on the wrapper rounds the stripe's outer corners for free on both platforms.
The stripe is `width: 4` (`spacing.xxs`) — the narrowest value that survives a 1pt hairline at
3× density, and it is deliberately *not* `MIN_TOUCH_TARGET`-wide because it is not interactive.

### 0.3 `minWidth: 0` remains load-bearing

Every flexed centre slot in this phase (chip labels, setting titles, leave-card titles) carries
`minWidth: 0`. Without it, a long leave reason or a long department name pushes the trailing
chevron/switch outside the card — the single most common RN layout bug in this codebase's history.

### 0.4 `avatarSizes` has no 64 entry

`sizing.avatarSizes` is `{ sm:32, md:40, lg:56, xl:72 }`. The brief asks for **64×64**. A literal
`64` in AccountScreen would be the only untokenised dimension in the app, so the token is extended:

```ts
export const avatarSizes = { sm: 32, md: 40, lg: 56, xl: 72, profile: 64 } as const;
```

Additive, so no existing call site changes.

---

## 1. Screen A — Leave Requests Overview & Management

**File:** [`src/features/leave/screens/LeaveListScreen.tsx`](src/features/leave/screens/LeaveListScreen.tsx:49)
**Route:** `LeaveStackParamList['LeaveList']`
**Data:** `useLeaveRequests(listParams)` — keyset/offset paginated, `PAGE_SIZE = 20`

### 1.1 Component hierarchy tree

```
ScreenContainer                                              scrollable={false}
│   hasHeader  → top inset zeroed (AppHeader owns it)
│   withFabSpacing → contentContainer paddingBottom = spacing.huge (64)
│                    ↑ reserves the FAB's lane so the last card can still be tapped
│
├── AppHeader                                title="Leave"  subtitle={`${pendingTotal} awaiting approval`}
│   └── action ──> <Pressable accessibilityRole="button" hitSlop={spacing.xs}>
│                  │   minWidth/minHeight = MIN_TOUCH_TARGET (44)
│                  └── AppText variant="bodyStrong" color="primary"  →  "+ Request"
│                  (kept: it is the header affordance on tablets where the FAB is far from the thumb)
│
├── FilterBar                                horizontal scroller — NOT a wrap
│   │   style={[styles.filterBar, { paddingVertical: theme.spacing.xs }]}
│   │   flexGrow: 0                          ← without this a horizontal scroller inside a
│   │                                            column flex parent eats all remaining height
│   └── FlatList<FilterKey>                  horizontal
│       │   data = FILTERS = ['all','pending','approved','rejected']
│       │   keyExtractor = key => key
│       │   showsHorizontalScrollIndicator = {false}      ← brief: indicators hidden
│       │   contentContainerStyle = { paddingHorizontal: theme.screenGutter,
│       │                              gap: theme.spacing.xs }
│       │   getItemLayout  — width unknown per chip ⇒ omitted; chips are ≤4 so windowing
│       │                    is unnecessary and `initialNumToRender={4}` renders all at once
│       │   initialNumToRender = 4, maxToRenderPerBatch = 4, windowSize = 3
│       └── renderItem ──> FilterChip
│                          key          = filter key
│                          label        = FILTER_LABELS[key]
│                          count        = counts[key]
│                          selected     = key === activeFilter
│                          onPress      = (key) => setActiveFilter(key)
│                          ↑ the key is forwarded, never the row index
│
├── FlatList<LeaveRequest>                   the feed — virtualised, vertical
│   │   data              = items (accumulated pages, deduped by id)
│   │   keyExtractor      = item => String(item.id)      ← server id, never index
│   │   contentContainerStyle = { paddingHorizontal: theme.screenGutter,
│   │                             paddingBottom: theme.spacing.sm,
│   │                             gap: theme.spacing.sm }
│   │   ItemSeparatorComponent = null        ← gap on the container replaces a separator view
│   │   refreshControl    = <RefreshControl refreshing={isRefetching} onRefresh={handleRefresh} />
│   │   onEndReached      = handleEndReached  onEndReachedThreshold = 0.5
│   │   ListFooterComponent = isFetchingNextPage ? <ActivityIndicator/> : null
│   │   ListEmptyComponent  = <EmptyState title="No leave requests"
│   │                          description=…  actionLabel="Request leave"
│   │                          onAction={() => navigation.navigate('CreateLeaveRequest')} />
│   │   removeClippedSubviews = Platform.OS === 'android'   ← iOS clipping + shadows is buggy
│   └── renderItem ──> LeaveRow                              (React.memo)
│
└── FloatingActionButton                     rendered as a SIBLING of the FlatList,
                                             not inside it — an absolutely-positioned child of a
                                             virtualised list is recycled and can vanish mid-scroll
    └── (see §1.4)
```

### 1.2 `FilterChip` — new atom

Path: `src/components/FilterChip/FilterChip.tsx`

Reuses the StatusBadge anatomy exactly (pill radius, `lineHeight.xs + spacing.xxs*2` min height,
`numberOfLines={1}`), but swaps the *tone* for a *selection state*:

| state | background | text | border |
|---|---|---|---|
| selected | `primary` (Deep Ocean Blue, solid) | `onPrimary` | `primary` |
| inactive | `surfaceMuted` (soft grey) | `textSecondary` | `border` |

```ts
type FilterChipProps = {
    label: string;
    selected: boolean;
    count?: number;                 // rendered as "Pending · 4"
    onPress: () => void;            // called with no args — the parent already binds the key
    disabled?: boolean;
    testID?: string;
};
```

- `minHeight = Math.max(lineHeight.xs + spacing.xxs * 2, MIN_TOUCH_TARGET - spacing.xs)` then the
  **Pressable** carries `hitSlop={spacing.xs}` so the *visual* pill stays slim while the *touch*
  box clears 44pt. A 44pt-tall chip next to a 44pt card looks clumsy; hitSlop is the correct fix.
- `accessibilityRole="button"`, `accessibilityState={{ selected }}` — VoiceOver announces
  "selected, Pending, 4".
- The count uses `variant="caption"` with `opacity`-free colour change (`onPrimary` vs
  `textMuted`) so no second colour pair is invented.
- **Selection does not animate width.** The label is constant; only fills change. (The Phase 5
  reserved-space rule applies in spirit: nothing reflows on tap.)

### 1.3 `LeaveRow` — feed card with left accent strip

`React.memo`-wrapped. Fixed height so `getItemLayout` is exact:

```
LEAVE_ROW_HEIGHT = 96
    = paddingVertical(md 16) × 2
    + title line (lineHeight.md 20)
    + gap spacing.xxs (4)
    + caption line (lineHeight.xs 14)
    + gap spacing.xxs (4)
    + badge band (lineHeight.xs 14)
                                                  → 16+20+4+14+4+14+16 = 88
    …rounded up to 96 to absorb the 1pt hairline ×2 and font-scale jitter at 1.0.
    The row is a fixed-height contract, so a user who inflates system text will see the
    caption truncate rather than the row grow — which is exactly what keeps the fling smooth.
```

```tsx
<Pressable
    onPress={() => onPress(request.id)}        // id in, not index
    style={({ pressed }) => [
        styles.wrapper,                        // flexDirection:'row', borderRadius: radius.lg,
                                               // overflow:'hidden', opacity: pressed ? 0.7 : 1
    ]}
>
    <View style={{ width: spacing.xxs, backgroundColor: tone.strong }} />
    <View style={{ flex: 1, paddingVertical: spacing.md, paddingHorizontal: spacing.md,
                   gap: spacing.xxs, backgroundColor: theme.colors.surface }}>
        <View style={{ flexDirection:'row', alignItems:'center', gap: spacing.sm }}>
            <AppText variant="bodyStrong" numberOfLines={1} style={{ flex:1, minWidth:0 }}>
                {request.leave_type?.name ?? 'Leave'}
            </AppText>
            <StatusBadge status={request.status} />
        </View>
        <AppText variant="caption" color="textSecondary" numberOfLines={1}>
            {formatDate(request.start_date)} → {formatDate(request.end_date)}  ·  {formatTotalDays(request.total_days)}
        </AppText>
        <AppText variant="caption" color="textMuted" numberOfLines={1}>
            {request.reason ?? 'No reason recorded'}
        </AppText>
    </View>
</Pressable>
```

`tone.strong` comes from a `STATUS_ACCENT: Record<LeaveStatus, {strong: keyof Colors}>` map:
`approved → successStrong`, `pending → warningStrong`, `rejected → dangerStrong`, anything else →
`border`. **The stripe colour is the only colour that encodes status on the card** — the badge
already carries the word, so the stripe is redundant-by-design for colour-blind users and simply
makes the list scannable at a glance.

`accessibilityLabel` on the Pressable:
`Leave request for ${type} from ${start} to ${end}, ${status}, ${days}` — a screen reader gets the
whole row in one swipe instead of three fragments.

### 1.4 `FloatingActionButton` — new atom

Path: `src/components/FloatingActionButton/FloatingActionButton.tsx`

```ts
type FloatingActionButtonProps = {
    onPress: () => void;
    icon?: IconComponent;        // default: the "+" glyph
    accessibilityLabel: string;  // required — an icon-only control without a label is invisible to AT
    testID?: string;
};
```

Geometry, precisely as briefed:

```
FAB_SIZE  = 56                       ← ≥ MIN_TOUCH_TARGET(44); 56 is the Material 3 convention
FAB_OFFSET_FROM_SAFE_AREA = 16       ← the brief's "exactly 16pt above the bottom Safe Area margin"

position: 'absolute'
right:  theme.screenGutter                      (16)
bottom: insets.bottom + FAB_OFFSET_FROM_SAFE_AREA
width/height: FAB_SIZE
borderRadius: componentRadius.fab  (999 → circle)
backgroundColor: theme.colors.primary
alignItems/justifyContent: 'center'
elevation: 6 (Android) / shadowMd (iOS)  — via the Phase 1 elevation tokens, never a raw string
```

- `insets` from `useSafeAreaInsets()`. This is the **bug fixed in this phase**: the existing FAB
  hard-codes `bottom: 24`, which sits 24pt above the *screen* edge and therefore only ~-10pt above
  the home indicator on a notched iPhone — i.e. under the gesture bar. The old value is deleted.
- Press feedback: `pressed → opacity: 0.7` and `transform: [{ scale: 0.98 }]`, matching the Phase 2
  Button atom's contract.
- Rendered **outside** the FlatList (see tree) because a virtualised list may unmount any
  absolutely-positioned child it considers off-screen.
- The `"+"` is a glyph (`PlusGlyph`, added to [`glyphs.tsx`](src/components/AppIcon/glyphs.tsx:1)
  as two absolutely-positioned bars — a 2pt horizontal and a 2pt vertical crossing at centre,
  `ICON_STROKE_WIDTH`, `radius.xs` caps), **not a text "+"**, so the stroke weight matches every
  other icon in the app and never depends on font metrics.

### 1.5 View-state mapping

| state | condition | render |
|---|---|---|
| first load | `isPending` | `<LeaveSkeleton/>` — `SkeletonList count={4}` |
| error | `isError && items.length === 0` | `<ErrorView error onRetry={refetch}/>` |
| empty | `!isPending && items.length === 0` | `ListEmptyComponent` `EmptyState` |
| populated | `items.length > 0` | FlatList feed |
| refreshing | `isRefetching` | `RefreshControl` spinner; list stays mounted |
| paging | `isFetchingNextPage` | `ListFooterComponent` spinner; **never** replaces the list |
| filter switch | `activeFilter` changes | `setAllItems([])` then refetch — an empty flash is worse than a spinner, so the skeleton branch re-enters for one frame |

The filter chips must **not** clear the header's `pendingTotal`, which is sourced independently of
the active filter.

---

## 2. Screen B — Create Leave Request Form

**File:** [`src/features/leave/screens/CreateLeaveRequestScreen.tsx`](src/features/leave/screens/CreateLeaveRequestScreen.tsx:54)
**Route:** `LeaveStackParamList['CreateLeaveRequest']` (`presentation: 'modal'`)
**Validation:** [`createLeaveRequestSchema`](src/features/leave/validation/leaveSchemas.ts:55) — reused **unchanged**

### 2.1 Component hierarchy tree

```
ScreenContainer                                    scrollable={false}
│   hasHeader → top inset zeroed
│
├── AppHeader      title="Request leave"  onBack={guardedBack}
│                  action = <Pressable "Cancel" hitSlop={spacing.xs}>  → same guard as back
│
├── KeyboardAwareView                            ← Phase 4 molecule, reused verbatim
│   │   behaviour: 'padding' iOS / 'height' Android, offset = layout.headerHeight
│   └── ScrollView
│       │   keyboardShouldPersistTaps="handled"   (inherited from KeyboardAwareView)
│       │   showsVerticalScrollIndicator={false}
│       │   contentContainerStyle = { paddingHorizontal: theme.screenGutter,
│       │                             paddingTop: theme.spacing.md,
│       │                             gap: theme.spacing.md,            ← 8pt grid unit ×2
│       │                             paddingBottom: SUBMIT_TRAY_RESERVE }
│       │                             where SUBMIT_TRAY_RESERVE =
│       │                                 controlHeights.lg (52) + theme.spacing.md (16) * 2
│       │                                 + insets.bottom
│       │                             → the last field is never trapped under the sticky tray
│       │
│       ├── SectionCard ①  "Leave type"                      gap: spacing.sm
│       │   ├── AppText variant="caption" color="textSecondary"   → label
│       │   ├── SegmentedControl                             (new molecule, §2.2)
│       │   │     options = leaveTypes.leaveTypes  →  { value: String(type.id),
│       │   │                                           label: type.name,
│       │   │                                           disabled: blocked }
│       │   │     value    = String(field.value ?? '')
│       │   │     onChange = (id) => field.onChange(Number(id))
│       │   │     scrollable — horizontal FlatList when > 3 options
│       │   └── error band / helper band  (same 2-line slot as AppTextInput's messageBand,
│       │         so the card's height does not jump when an error appears)
│       │
│       ├── SectionCard ②  "Dates"                           gap: spacing.md
│       │   ├── View row  flexDirection:'row'  gap: spacing.sm
│       │   │   ├── DateField  label="Starting"  flex:1  minWidth:0
│       │   │   │      value={field.value}  onChange={field.onChange}
│       │   │   │      minimumDate={todayApiDate()}
│       │   │   └── DateField  label="Ending"    flex:1  minWidth:0
│       │   │          value={field.value}  onChange={field.onChange}
│       │   │          minimumDate={watch('start_date') || todayApiDate()}
│       │   │      ↑ stacking two half-width fields is deliberate: a full-width pair would
│       │   │        force a second screen-scroll to compare the two dates, and the
│       │   │        date range is a single mental object.
│       │   ├── TotalDaysPreview        testID="leave-total-preview"
│       │   │      AppText variant="subtitle"  → "3 days"
│       │   │      AppText variant="caption" color="textMuted" → "Inclusive of weekends"
│       │   └── error band (root-level date error from the `superRefine`)
│       │
│       ├── SessionRow ①  "Starting half-day"     (only when start === end, or either side is
│       │                                          a half-day)
│       │      SegmentedControl over leaveSessions = ['full_day','first_half','second_half']
│       ├── SessionRow ②  "Ending half-day"       (same guard)
│       │
│       ├── SectionCard ③  "Notes"                gap: spacing.sm
│       │   ├── AppText variant="caption" color="textSecondary" → "Reason (optional)"
│       │   └── AppTextInput
│       │         multiline
│       │         numberOfLines={5}
│       │         maxHeight={NOTES_MAX_HEIGHT}          ← 120, the brief's number (§2.3)
│       │         textAlignVertical="top"               ← Android centres multiline text otherwise
│       │         scrollEnabled                          ← internal scroll, not page growth
│       │         value/onChange via Controller
│       │         helper="Up to 1,000 characters."
│       │
│       ├── SectionCard ④  "Attachments"          (unchanged from current build)
│       │   ├── attachment rows (map over a *bounded* list ≤ LEAVE_ATTACHMENT_MAX_COUNT,
│       │   │   deliberately a plain .map: 5 items is not a scrolling feed)
│       │   └── AppButton variant="secondary" size="sm" label="Add attachment"
│       │
│       └── errors.root ──> FormErrorPanel              ← Phase 4 molecule
│
└── StickySubmitBar                              absolute, sibling of KeyboardAwareView
    │   position:'absolute'  left:0  right:0  bottom:0
    │   paddingHorizontal: theme.screenGutter
    │   paddingTop: theme.spacing.md
    │   paddingBottom: theme.spacing.md + insets.bottom
    │   backgroundColor: theme.colors.surface
    │   borderTopWidth: borderWidths.hairline  borderTopColor: theme.colors.border
    └── AppButton
          variant="primary"   size="lg"        ← controlHeights.lg = 52
          fullWidth           (default true)
          loading={mutation.isPending}
          disabled={isBlocked || !isDirty}
          label="Submit request"
```

The `StickySubmitBar` sits **outside** the `KeyboardAwareView`, so when the keyboard rises the
tray does not ride up with the scroll content; it is pinned to the viewport and the scroll view's
`paddingBottom` reserve keeps the last field reachable above it.

### 2.2 `SegmentedControl` — new molecule

Path: `src/components/SegmentedControl/SegmentedControl.tsx`

A radio group that looks like a segmented control, not like a stack of buttons.

```ts
export type SegmentedOption<T extends string = string> = {
    value: T;
    label: string;
    disabled?: boolean;
};

type SegmentedControlProps<T extends string> = {
    options: ReadonlyArray<SegmentedOption<T>>;
    value: T | null;
    onChange: (value: T) => void;
    /** Horizontal scroller when the option count is large (leave types). */
    scrollable?: boolean;
    accessibilityLabel?: string;
    testID?: string;
};
```

Container:

```
flexDirection: 'row'
backgroundColor: theme.colors.surfaceMuted        ← the "track"
borderRadius: componentRadius.input (6)
borderWidth: borderWidths.hairline
borderColor: theme.colors.border
padding: spacing.xxs (4)
gap: spacing.xxs (4)
```

Each segment (a `Pressable**):

```
flex: 1                    (non-scrollable mode) — equal widths, no measuring, no layout pass
minHeight: MIN_TOUCH_TARGET - spacing.xxs*2 = 36     ← 44 once the track's 4pt padding is counted
alignItems/justifyContent: 'center'
borderRadius: radius.xs (4)
backgroundColor: selected ? theme.colors.surface : 'transparent'
             ↑ the "thumb" is the raised segment; a white chip on grey reads as selected in both
               schemes because `surface` and `surfaceMuted` invert together in dark mode
borderWidth: selected ? borderWidths.hairline : 0
borderColor: theme.colors.border
elevation: selected ? 1 : 0
```

Label: `selected ? bodyStrong/textPrimary : body/textSecondary`, `numberOfLines={1}`,
`ellipsizeMode="tail"`, `minWidth:0`.

Semantics: `accessibilityRole="radio"`, `accessibilityState={{ selected }}` inside a wrapper with
`accessibilityRole="radiogroup"`. **Not** `role="tab"` — a tab changes a view, a radio changes a
value, and screen readers say "radio button, selected, Approved" which is exactly the interaction.

`scrollable` mode swaps the row for a `FlatList horizontal showsHorizontalScrollIndicator={false}`
with the same track chrome wrapped around it and per-option `flex: 0` + `paddingHorizontal: spacing.md`
so long leave-type names are not crushed into equal slivers.

**This replaces** the hand-rolled chip `.map` at
[`CreateLeaveRequestScreen.tsx:312`](src/features/leave/screens/CreateLeaveRequestScreen.tsx:312).
The `SessionSelector` local component is deleted and reduced to the same `SegmentedControl`.

### 2.3 `AppTextInput` — max-height + internal scroll

The brief: *"multi-line Text Input Atom with a fixed layout height constraint (e.g. max 120pt) that
scrolls internal text smoothly without dynamically expanding the page hierarchy."*

The atom already forwards `multiline`, `numberOfLines`, and `scrollEnabled` via
`Omit<TextInputProps,'style'> & {...rest}`. What is missing is a **height clamp**, because
`numberOfLines={5}` is a *hint* that RN honours inconsistently across platforms and font scales.

Two additions to [`AppTextInput.tsx`](src/components/AppTextInput/AppTextInput.tsx:186):

1. `AppTextInputProps` gains:
   ```ts
   /** Caps the control's height. Pair with `multiline` + `scrollEnabled` for a fixed
    *  narrative box that scrolls internally instead of growing the page. */
   maxHeight?: number;
   ```
2. The control `View` (line 186) merges `maxHeight !== undefined ? { maxHeight } : null` into its
   style, and the inner `TextInput` (line 201) receives `maxHeight` in its own style so the native
   text layer clips rather than the wrapper.

Rules:
- `maxHeight` **only** applies when `multiline` is true. A single-line field with a max height is a
  bug waiting to happen, so the atom asserts it in a `__DEV__` warning rather than silently
  honouring it.
- When `multiline && maxHeight`, the atom forces `textAlignVertical: 'top'` and
  `paddingTop: spacing.sm` (Android otherwise vertically centres the text inside the taller box).
- The atom does **not** default `scrollEnabled`. It is explicit at the call site so a reader can
  see the intent.

Call site:

```tsx
<AppTextInput
    label="Reason (optional)"
    multiline
    numberOfLines={5}
    maxHeight={NOTES_MAX_HEIGHT}   // export const NOTES_MAX_HEIGHT = 120
    textAlignVertical="top"
    scrollEnabled
    …
/>
```

### 2.4 View-state mapping

| state | condition | render |
|---|---|---|
| types loading | `leaveTypes.isLoading` | type card shows a `SkeletonList count={1}`; the rest of the form stays interactive (dates and notes do not depend on types) |
| types unsupported | `leaveTypes.isUnsupported` | reuse the existing informational card + retry (kept) |
| types error | `leaveTypes.isError` | reuse the existing error card + `AppButton` retry (kept) |
| submit pending | `mutation.isPending` | tray button `loading`; tray stays in place; scroll locked (`scrollEnabled={false}` on the ScrollView) |
| submit failed | `mutation.isError` | `FormErrorPanel` under the last card **and** the tray button re-enables |
| submit success | `mutation.isSuccess` | `navigation.replace('LeaveDetail', { leaveRequestId })` — `replace`, not `navigate`, so back does not return to a filled form |
| dirty + back | `beforeRemove` | existing `Alert` guard retained verbatim |
| blocked | `typesBlocked \|\| !isDirty` | tray button `disabled` |

**Field → schema mapping** (unchanged, and the reason the schema is reused as-is):

| control | schema field | transform |
|---|---|---|
| `SegmentedControl` (types) | `leave_type_id` | `Number(value)` |
| `DateField` "Starting" | `start_date` | already `YYYY-MM-DD` from `toApiDate` |
| `DateField` "Ending" | `end_date` | idem |
| `SegmentedControl` (start session) | `start_session` | `leaveSessions` enum |
| `SegmentedControl` (end session) | `end_session` | idem |
| `AppTextInput` (notes) | `reason` | `trim()`, empty string → `null` |
| derived | `total_days` | `previewTotalDays`, `min(0.5)`, `nullish` |

Server errors are mapped through the existing `toFieldErrorMap` — a `422` on `end_date` must land
under the *Ending* field, not in a toast.

---

## 3. Screen C — Account Profile & Settings Hub

**File:** [`src/features/settings/screens/AccountScreen.tsx`](src/features/settings/screens/AccountScreen.tsx:30)
**Route:** `AccountStackParamList['Account']`

### 3.1 Component hierarchy tree

```
ScreenContainer                                        scrollable={false}
│   hasHeader → top inset zeroed
│
├── AppHeader        title="Account"
│
└── ScrollView
    │   showsVerticalScrollIndicator={false}
    │   contentContainerStyle = { paddingHorizontal: theme.screenGutter,
    │                             paddingBottom: insets.bottom + theme.spacing.xl,
    │                             gap: theme.spacing.lg }         ← 20 between groups, not 16:
    │                                                               groups need more air than rows
    │
    ├── ProfileIdentityHeader                                    §3.2
    │   └── AppCard padded={false}
    │       └── View row  alignItems:'center'  gap: theme.spacing.md
    │                    padding: theme.insets.card (16)
    │           ├── Avatar
    │           │   ├── View  width:height: avatarSizes.profile (64)
    │           │   │         borderRadius: componentRadius.avatar (999)
    │           │   │         backgroundColor: theme.colors.primarySoft
    │           │   │         borderWidth: borderWidths.hairline (1)
    │           │   │         borderColor: theme.colors.primaryBorder   ← the "soft border"
    │           │   │         alignItems/justifyContent:'center'
    │           │   │         overflow:'hidden'
    │           │   │   └── initials AppText variant="title" color="primaryStrong"
    │           │   │         (first letter of name, first letter of second word if any)
    │           │   └── accessibilityElementsHidden={true}   ← decorative; the label below speaks
    │           └── View  flex:1  minWidth:0  gap: theme.spacing.xxs
    │               ├── AppText variant="subtitle" numberOfLines={1} → user.name
    │               ├── AppText variant="caption"  color="textSecondary" numberOfLines={1}
    │               │        → user.email        ("corporate email")
    │               └── AppText variant="caption"  color="textMuted"  numberOfLines={1}
    │                        → user.roles.join(' · ') || user.role     ("operational role string")
    │
    ├── SectionGroup "Personal Details"
    │   ├── SectionHeader  AppText variant="caption" color="textMuted"
    │   │                  textTransform:'uppercase' letterSpacing:0.6
    │   │                  paddingLeft: theme.spacing.xs  paddingBottom: theme.spacing.xs
    │   └── AppCard padded={false}
    │       ├── SettingsRow  icon=UserGlyph          title="Personal details"  → Profile
    │       ├── SettingsRow  icon=ShieldCheckGlyph   title="Change password"   → ChangePassword
    │       └── SettingsRow  icon=MailCheckGlyph     title="Verify email"      → resend
    │              (this row is *conditional* — it replaces the standalone "Resend verification
    │               email" card so the action lives where a user looks for account actions)
    │              isLast
    │
    ├── SectionGroup "Preferences"
    │   └── AppCard padded={false}
    │       ├── SettingsRow  icon=InfoGlyph      title="Appearance"  → Preferences
    │       ├── SettingsRow  icon=BellGlyph?     title="Dark mode"
    │       │        trailing = <Switch
    │       │            value={appearance === 'dark'}
    │       │            onValueChange={v => setAppearance(v ? 'dark' : 'light')}
    │       │            trackColor={{ false: theme.colors.surfaceSunken,
    │       │                          true:  theme.colors.primary }}
    │       │            thumbColor={theme.colors.surface}
    │       │            ios_backgroundColor={theme.colors.surfaceSunken} />
    │       └── SettingsRow  icon=ClockGlyph     title="Push notifications"
    │                trailing = <Switch value={pushEnabled} onValueChange={setPushEnabled} … />
    │                isLast
    │
    ├── SectionGroup "Roster"
    │   └── AppCard padded={false}
    │       └── SettingsRow  icon=CalendarGlyph  title="Default to week view"
    │                trailing = <Switch value={rosterWeekView} onValueChange={setRosterWeekView} />
    │                isLast
    │
    ├── CompanyLockCard                     (kept verbatim — `company_access.is_locked` copy)
    │
    └── DestructiveActionSlot                                        §3.4
        ├── AppCard padded={false}
        │   └── SettingsRow
        │         icon       = SignOutGlyph
        │         iconColor  = dangerStrong
        │         title      = "Sign out"
        │         titleColor = dangerStrong
        │         destructive
        │         onPress    = confirmSignOut
        │         isLast
        └── AppText variant="caption" color="textMuted" textAlign="center"
                  paddingTop: theme.spacing.sm
                  → "Version 1.0.0 (build 1)"           ← the slot's terminal footnote
```

**"Absolute bottom of the scroll view" is satisfied structurally, not by `position: 'absolute'`:**
the `DestructiveActionSlot` is the last child of the `ScrollView`, so it lands at the visual bottom
of the content. Pinning it with `position:'absolute'` would float it over the list on a short
screen and contradict the brief's own wording ("at the absolute bottom **of the scroll view**").
A trailing `marginTop: theme.spacing.xxl` (32) separates the destructive action from the settings
matrix so it can never be hit by a thumb aiming for the last switch.

**"Sign out everywhere" is retained** as a second row inside the same `DestructiveActionSlot`,
below "Sign out", with the same `dangerStrong` treatment. It is a real, backend-supported action
(the current screen already ships it with an `Alert` confirm) and moving it into the destructive
slot is more honest than leaving it under a neutral "Session" header.

### 3.2 `SettingsRow` — the shared settings-matrix row

`AppListItem` cannot express this: it renders a **text** `'>'` chevron and has no icon slot.
Rather than overloading it (and risking every existing call site), `AppListItem` gains one
additive, backwards-compatible prop and the chevron becomes a glyph:

```ts
type AppListItemProps = {
    label: string;
    value?: string;
    onPress?: () => void;
    destructive?: boolean;
    disabled?: boolean;
    trailing?: React.ReactNode;
    isLast?: boolean;
    /** Leading 24pt navigation icon (Phase 6 settings matrix). */
    icon?: IconComponent;
    /** Token name, not a hex — matches AppIcon's contract. */
    iconColor?: keyof Colors;
};
```

Row anatomy, per the brief:

```
Pressable
  flexDirection: 'row'   alignItems: 'center'   gap: theme.spacing.sm
  minHeight: MIN_TOUCH_TARGET (44)
  paddingHorizontal: theme.insets.listRow (16)
  paddingVertical: theme.spacing.sm (12)     ← 12+12+20 line = 44 exactly at 1.0 scale
  borderBottomWidth: isLast ? 0 : borderWidths.hairline
  borderBottomColor: theme.colors.border
  pressed → backgroundColor: theme.colors.surfaceMuted
│
├── AppIcon
│      component = icon            (omitted ⇒ the slot is not rendered at all,
│                                   so a future icon-less row keeps the text flush left)
│      size = sizing.iconSizes.medium (24)          ← the brief's "24pt navigation icon"
│      color = iconColor ?? 'textSecondary'
│      accessibilityElementsHidden  (the title says everything; two announcements is noise)
│
├── AppText
│      variant = 'body'
│      color   = destructive ? 'dangerStrong' : 'textPrimary'
│      numberOfLines = 1   ellipsizeMode = 'tail'
│      style = { flex: 1, minWidth: 0 }             ← the load-bearing shrink
│
├── value  (optional)
│      AppText variant='caption' color='textMuted' numberOfLines={1}
│      maxWidth: '45%'                              ← a long value can never push the chevron out
│
└── trailing
        if `trailing` supplied  → rendered as-is (Switch, or a custom node)
        else if `onPress`       → ChevronRightGlyph size={sizing.iconSizes.small}   (16)
                                  color="textMuted"  accessibilityElementsHidden
        else                    → nothing
```

The text `'>'` at [`AppListItem.tsx:57`](src/components/AppListItem/AppListItem.tsx:57) is replaced
by `ChevronRightGlyph` **for every existing call site too**. This is a visual change to Phase 3
screens (Profile, ChangePassword, Preferences, the unverified-email card) and it is the right one:
the text chevron's weight and vertical alignment vary by font, which is why the app already ships a
`ChevronRightGlyph` that was only being used in `AppHeader`.

`accessibilityRole="switch"` + `accessibilityState={{ checked }}` on the Pressable when `trailing`
is a `Switch`, so a screen reader treats the whole 44pt row as the toggle — a bare `Switch` inside
a row is a 20pt target on Android and is a genuine accessibility defect. Alternatively the Switch
itself keeps its own role but the row carries `accessibilityHint`. The row-as-switch form is
chosen because it makes the *whole 44pt* tappable.

### 3.3 Switch rows use live stores, not local `useState`

The three preference rows read/write [`usePreferencesStore`](src/features/settings/store/preferencesStore.ts:57):

| row | store selector | setter |
|---|---|---|
| Dark mode | `appearance` | `setAppearance(v ? 'dark' : 'light')` |
| Push notifications | `pushEnabled` | `setPushEnabled` |
| Default to week view | `rosterWeekView` | `setRosterWeekView` |

- `isHydrated` gates the Switches: until hydration completes the row renders
  `disabled` with the thumb at its default, so the user never sees a switch flip *after* they look
  at it (the "flash of default" the store's own docblock warns about).
- `appearance === 'system'` is represented by the Dark-mode switch being in the **OS-derived**
  position, and the row's `value` caption reads `"Following system"` so a user whose OS is dark
  but whose preference is `system` is not confused by a switch that snaps on. Toggling it always
  writes an explicit `'dark'` / `'light'`, which is the documented way to leave `system`.
- The store persists through `setItem`, which is already namespaced, so sign-out's
  `clearAppStorage()` wipes these correctly.

### 3.4 View-state mapping

| state | condition | render |
|---|---|---|
| session loading | `user === null` | `ProfileIdentityHeader` renders `SkeletonCircle(64)` + two `SkeletonRect`s at the real line heights (no layout shift on hydrate) |
| unverified | `!isVerified` | the "Verify email" row appears with `value="Action needed"`; the row is *present but additive* rather than a separate card |
| locked company | `user.company_access.is_locked` | `CompanyLockCard` unchanged, rendered above the destructive slot |
| resend pending | `resend.isPending` | the Verify row's `value` becomes `"Sending…"`, row `disabled` |
| resend done | `resend.isSuccess` | row `value` → `"Email sent"`, row stays `disabled` for the session |
| destructive confirm | tap | existing `Alert.alert` two-button confirm retained **verbatim** for both sign-out rows |

### 3.5 Icons needed (all new glyphs, same bar-based technique)

Added to [`glyphs.tsx`](src/components/AppIcon/glyphs.tsx:1):

| glyph | rows/cols | used by |
|---|---|---|
| `PlusGlyph` | 2 crossing bars | FAB |
| `SignOutGlyph` | door frame + arrow | destructive slot |
| `BellGlyph` | bell dome + clapper dot | push notifications row |
| `SlidersGlyph` | 3 tracks + 3 knobs | appearance row |
| `SunMoonGlyph` | disc left + crescent right | dark mode row |
| `CheckGlyph` | 2-bar tick | selected segment (optional) |

All are `GlyphProps`-shaped (`{size, color, strokeWidth}`), absolutely positioned, `radius.xs` caps,
default `strokeWidth = ICON_STROKE_WIDTH`. `UserGlyph`, `ShieldCheckGlyph`, `MailCheckGlyph`,
`CalendarGlyph`, `ClockGlyph`, `InfoGlyph` already exist and are reused.

---

## 4. New & changed files

| kind | path |
|---|---|
| new atom | [`src/components/FilterChip/FilterChip.tsx`](src/components/FilterChip/FilterChip.tsx) + `index.ts` |
| new atom | [`src/components/FloatingActionButton/FloatingActionButton.tsx`](src/components/FloatingActionButton/FloatingActionButton.tsx) + `index.ts` |
| new molecule | [`src/components/SegmentedControl/SegmentedControl.tsx`](src/components/SegmentedControl/SegmentedControl.tsx) + `index.ts` |
| new molecule | [`src/components/DateField/DateField.tsx`](src/components/DateField/DateField.tsx) + `index.ts` |
| new util | `src/features/leave/utils/datePicker.ts` (the native seam + availability probe) |
| changed | [`src/components/AppTextInput/AppTextInput.tsx`](src/components/AppTextInput/AppTextInput.tsx:68) — `maxHeight` |
| changed | [`src/components/AppListItem/AppListItem.tsx`](src/components/AppListItem/AppListItem.tsx:15) — `icon`, `iconColor`, glyph chevron |
| changed | [`src/components/AppIcon/glyphs.tsx`](src/components/AppIcon/glyphs.tsx:1) — 6 new glyphs |
| changed | [`src/theme/sizing.ts`](src/theme/sizing.ts:1) — `avatarSizes.profile = 64` |
| changed | [`src/utils/date.ts`](src/utils/date.ts:81) — `toApiDate`, `fromApiDate` |
| changed | [`src/components/index.ts`](src/components/index.ts:1) — barrel exports |
| rewritten | [`LeaveListScreen.tsx`](src/features/leave/screens/LeaveListScreen.tsx:49) |
| rewritten | [`CreateLeaveRequestScreen.tsx`](src/features/leave/screens/CreateLeaveRequestScreen.tsx:54) |
| rewritten | [`AccountScreen.tsx`](src/features/settings/screens/AccountScreen.tsx:30) |

## 5. Acceptance gates

1. `npx tsc --noEmit --ignoreDeprecations 6.0` → exit 0.
2. `npx jest --silent` → all suites green; new tests for `FilterChip` selection colours,
   `FloatingActionButton` inset arithmetic, `SegmentedControl` radio semantics,
   `AppTextInput` maxHeight clamping, `DateField` round-trip, and `LeaveRow` accent colour.
3. `npx eslint "src/**/*.{ts,tsx}"` → 0 errors (warnings must not increase above the Phase 5
   baseline of 58).
4. No `ScrollView` may replace a feed; no feed may use `.map`.
5. No hard-coded safe-area offsets: every bottom-anchored surface derives from `insets.bottom`.

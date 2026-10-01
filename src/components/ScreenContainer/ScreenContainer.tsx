import { useContext } from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing } from '../../theme/spacing';
import { useTheme } from '../../theme/useTheme';

/**
 * Screen shell.
 *
 * Owns the three things every screen would otherwise get subtly wrong:
 *
 * 1. **Safe area** — see the two ownership modes below.
 * 2. **Keyboard avoidance** — `keyboardShouldPersistTaps="handled"` lets a user tap
 *    a submit button while the keyboard is open, instead of the first tap only
 *    dismissing the keyboard.
 * 3. **Consistent gutter** — one horizontal padding value shared with
 *    [`AppHeader`](src/components/AppHeader/AppHeader.tsx:1).
 *
 * `scrollable={false}` renders a plain flex view for screens that manage their own
 * list (FlatList), which must not be nested inside a ScrollView.
 *
 * ## Who owns the top inset
 *
 * Exactly one thing, in one of two modes:
 *
 * ```
 *  hasHeader={false}                        hasHeader={true}
 *  ┌─── scroller decides ───┐               ┌───────────────┐
 *  │  paddingTop = inset.top│               │ AppHeader     │ ← absorbs inset.top
 *  ├────────────────────────┤               ├───────────────┤
 *  │  paddingBottom =       │               │ scroll view   │ ← no top inset here
 *  │  inset.bottom          │               │ paddingBottom │
 *  └────────────────────────┘               └───────────────┘
 * ```
 *
 * Mode A: no header, so the container adds `insets.top` itself — otherwise content
 * begins under the status bar. `paddingTop` lives on the **content container**, so
 * scrolling text disappears under the transparent status bar exactly as it should,
 * rather than being cut off at a hard boundary. There is no `SafeAreaView` on this
 * path on purpose: a background-coloured `SafeAreaView` in front of a scroller
 * paints an opaque band that moving content cannot pass beneath, which is a worse
 * artefact than the one it prevents.
 *
 * Mode B: a header is present and has already absorbed the inset, so the container
 * contributes **zero** top padding and `paddingTop` is measurably 0. Note what it
 * does *not* do: it does not set `paddingTop = measuredHeaderHeight`. The header is
 * a sibling of the scroller in a column, so it already occupies that space in
 * layout; adding the equivalent padding again would push the first row down by a
 * whole header height. The measured height is only useful to a **tab screen** whose
 * scroller sits underneath a screen-level sticky header, and that case is opted
 * into explicitly with `headerHeight`.
 *
 * ## Scroll viewport boundaries
 *
 * The brief's "scroll text must fade under the header rather than slide behind the
 * battery icon" requirement is met by **structure, not by a clip flag**:
 *
 *  - Under a sibling header, the scroller is a flow child of a column that starts
 *    *below* it, so it is bounded at the header's measured lower edge by layout.
 *    There is no scroll offset that can put a row behind the status bar, so no
 *    clipping is required and none is applied.
 *  - The scrollable path adds `paddingTop` to the **content container** instead of
 *    wrapping in a `SafeAreaView`, so content does travel under the transparent
 *    status bar as it scrolls and then leaves the viewport cleanly. An
 *    opaque `SafeAreaView` in front of a scroller would instead paint a permanent
 *    dead band that moving content cannot pass beneath.
 *
 * `clipsToBounds` is deliberately **not** passed even though iOS supports it: it is
 * a `UIView` property with no entry in RN's `ScrollViewProps`, so supplying it would
 * be an untyped prop that a future RN release could rename or reject silently.
 *
 * `removeClippedSubviews` is pinned off. Android defaults it on, and it detaches
 * off-screen children — which breaks shadows and any absolutely positioned overlay
 * inside a row.
 */
export type ScreenContainerProps = {
    children: React.ReactNode;
    /** Wrap content in a ScrollView. Use false when the screen owns a FlatList. */
    scrollable?: boolean;
    /** Pull-to-refresh control forwarded to the internal ScrollView. */
    refreshControl?: React.ReactElement;
    /** Apply the standard horizontal gutter. Disable for full-bleed lists. */
    withGutter?: boolean;
    /** Add bottom safe-area padding. Disable when a tab bar already provides it. */
    withBottomInset?: boolean;
    /** Reserve space at the bottom so a FAB does not cover the last row. */
    withFabSpacing?: boolean;
    /** Screen is rendered under a header, so the top inset is already handled. */
    hasHeader?: boolean;
    /**
     * Height of a screen-level sticky header that the scroller runs *underneath*.
     *
     * Only for tab roots, where a header is rendered for layout purposes but the
     * list still starts at the top of the display and scrolls beneath it. Wire this
     * to `AppHeader`'s `onHeightChange` rather than to `layout.headerHeight`: the
     * real chrome height varies with the device inset and with whether a subtitle
     * wrapped.
     */
    headerHeight?: number;
    backgroundColor?: string;
    contentContainerStyle?: ViewStyle;
    style?: ViewStyle;
};

export function ScreenContainer({
    children,
    scrollable = true,
    refreshControl,
    withGutter = true,
    withBottomInset = true,
    withFabSpacing = false,
    hasHeader = false,
    headerHeight,
    backgroundColor,
    contentContainerStyle,
    style,
}: ScreenContainerProps) {
    const theme = useTheme();
    const insets = useSafeAreaInsets();

    /*
     * Three cases, and only one of them adds a top inset:
     *
     *  - `headerHeight` supplied → the scroller runs *underneath* a screen-level
     *    sticky header, so the header does not occupy flow space. The scroller
     *    therefore starts at the display edge and pads by exactly the header's
     *    measured chrome height, which already contains the inset.
     *  - `hasHeader={true}` → the header is a flow sibling and already occupies its
     *    space. Zero padding. Note it is *not* the header's height: adding both
     *    would push the first row down by a whole header.
     *  - neither → nothing owns the inset, so the container does.
     *
     * `headerHeight` wins over `hasHeader` because it is the more specific claim:
     * a screen that measured its header is always describing the overlay case.
     */
    const paddingTop =
        headerHeight !== undefined
            ? Math.max(headerHeight, insets.top)
            : hasHeader
                ? 0
                : insets.top;
    /*
     * Bottom clearance has three contributors, and they are **summed**, never chosen
     * between:
     *
     *  - `insets.bottom` — the home indicator / gesture bar (0 on hardware without one).
     *  - the floating action button's lane, when the screen renders one.
     *  - the **bottom tab bar**, read from React Navigation's
     *    `BottomTabBarHeightContext`. The bar is absolutely positioned and floats over
     *    scrolling content, so a tab root must reserve its full height or the last row
     *    sits permanently behind it. Reading the context — rather than the constant
     *    `sizing.layout.tabBarHeight` — also gets the value right for this app's
     *    **custom** bar, whose measured height already includes the safe-area inset.
     *    That is the number [`AppTabs`](src/navigation/stacks/AppTabs.tsx:1) documents
     *    this container as reserving, and previously it was not reserved at all: the
     *    docblock promised `tabBarHeight + insets.bottom` while the code contributed
     *    16pt. It is `undefined` outside a tab navigator (the auth stack), where it
     *    correctly contributes nothing.
     */
    const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
    const paddingBottom =
        (withBottomInset ? insets.bottom : 0) +
        (withFabSpacing ? spacing.huge : spacing.md) +
        tabBarHeight;

    const containerStyle = [
        styles.container,
        { backgroundColor: backgroundColor ?? theme.colors.background },
    ];

    const paddingStyle: ViewStyle = {
        paddingHorizontal: withGutter ? theme.screenGutter : 0,
        paddingTop,
        paddingBottom,
    };

    if (!scrollable) {
        return (
            <View style={[...containerStyle, paddingStyle, style]}>
                <View style={styles.flex}>{children}</View>
            </View>
        );
    }

    return (
        <ScrollView
            style={containerStyle}
            contentContainerStyle={[paddingStyle, contentContainerStyle]}
            // The bottom pair keeps a pulled-to-refresh control clear of the home
            // indicator on iOS. `top` is expressed as content padding instead:
            // `contentInset.top` shifts the resting scroll position, which would
            // leave a gap above the first row that the user cannot scroll away.
            contentInset={{ bottom: withBottomInset ? insets.bottom : 0 }}
            scrollIndicatorInsets={{ bottom: withBottomInset ? insets.bottom : 0 }}
            // Android has no contentInset; padding on the content container is the
            // cross-platform equivalent, and is already in `paddingStyle`.
            // NOT `clipsToBounds`: it is an iOS UIView property with no entry in
            // `ScrollViewProps`, so passing it would be an untyped prop that a
            // future RN version renames silently. The required boundary is instead
            // structural — the scroller is a flow sibling *below* the header, so it
            // starts at the header's measured lower edge and clipped/subviews is
            // unnecessary. `removeClippedSubviews` is off because Android defaults
            // it on, and it detaches off-screen children, which breaks shadows and
            // any absolutely positioned overlay inside a row.
            removeClippedSubviews={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            /*
             * A refreshable screen whose content is shorter than the viewport —
             * an empty state, most obviously — would otherwise not bounce on iOS,
             * so the pull gesture that triggers `refreshControl` could never
             * start. Bouncing is enabled only when a control is actually wired,
             * so a plain content screen keeps its non-bouncing behaviour.
             */
            alwaysBounceVertical={refreshControl !== undefined}
            refreshControl={refreshControl}>
            {children}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    flex: {
        flex: 1,
    },
});

import { useCallback } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { componentRadius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { MIN_TOUCH_TARGET } from '../../theme/sizing';
import { useTheme } from '../../theme/useTheme';
import { AppIcon } from '../AppIcon/AppIcon';
import { ArrowLeftGlyph } from '../AppIcon/glyphs';
import { AppText } from '../AppText/AppText';

/**
 * Screen header.
 *
 * Used by screens that are rendered without the native stack header (every stack
 * in this app sets `headerShown: false`). Stack screens therefore use *this*
 * header rather than `navigationOptions.title` — two headers on one screen is a
 * layout bug, so `hasHeader` on
 * [`ScreenContainer`](src/components/ScreenContainer/ScreenContainer.tsx:1) and
 * this component are used together or not at all.
 *
 * ## Safe area — the inset is consumed here, not re-applied to content
 *
 * ```
 *   ┌──────────────────────────────┐
 *   │  inset.top       40pt        │  ← painted BACKGROUND, no content
 *   ├──────────────────────────────┤  ← spacing.sm (12)
 *   │  [back]   Title    [action]  │  ← the 44pt row
 *   ├──────────────────────────────┤  ← spacing.sm (12)
 *   └──────────────────────────────┘
 * ```
 *
 * `paddingTop` is `insets.top + spacing.sm`, so the *content row* always lands a
 * full `spacing.sm` below the notch or status bar — on a Dynamic Island iPhone
 * that band is ~59pt, on a flat Android status bar ~24pt. Both are correct, and
 * `minHeight` only ever applies on a device with no status bar at all, so it can
 * never contribute to any overlap.
 *
 * **The inset is deliberately not forwarded to children.** A previous revision of
 * this file documented the correct maths above but then handed `insets.top` to the
 * screen as well, which is the double-padding bug: content began
 * `inset + spacing.sm + inset` below the display edge, and the notch clipped it.
 * The rule is that the header *absorbs* the inset and the padding is padding — it
 * moves the header's own content and nothing else.
 *
 * `flat` mode contributes no inset at all — inline inside a scroll view the
 * content is meant to travel under the status bar, and the inset belongs to the
 * scroller.
 *
 * ## Chrome, and why the height is measured rather than assumed
 *
 * A screen that scrolls *underneath* this header must fade content at the header's
 * real lower edge, and that edge is not a constant: it is
 * `insets.top + spacing.sm + 44 + spacing.sm` (or the height of a wrapped
 * subtitle). So the component measures itself on layout and reports the value
 * through `onHeightChange`; no screen should hard-code `layout.headerHeight` for
 * an offset. `separator` and `clip` exist for the two placements:
 *
 *  - **sticky** (list sibling) — keep the `separator` hairline and the `medium`
 *    shadow; it genuinely floats over moving content.
 *  - **inside a scroller** — pass `separator={false}` and `clip={false}`: a hairline
 *    coupled with `overflow: 'hidden'` draws a line at the clip edge and shaves the
 *    shadow, which is the grey band artefact seen when this component is used
 *    `flat` inside a ScrollView.
 */
export type AppHeaderProps = {
    title: string;
    /** Optional supporting line under the title, e.g. the current week range. */
    subtitle?: string;
    onBack?: () => void;
    /** Trailing action rendered on the right. */
    action?: React.ReactNode;
    /** Renders the header inline (no inset, no shadow) — for a scrolling content area. */
    flat?: boolean;
    /** Draw the bottom hairline. Disable when the header sits inside a scroller. */
    separator?: boolean;
    /**
     * Clip the header to its own bounds.
     *
     * Off by default: `overflow: 'hidden'` also clips the `medium` shadow, so a
     * sticky header loses its edge the moment it is enabled.
     */
    clip?: boolean;
    /** Reports the fully-resolved chrome height, including the inset. */
    onHeightChange?: (height: number) => void;
};

export function AppHeader({
    title,
    subtitle,
    onBack,
    action,
    flat = false,
    separator = true,
    clip = false,
    onHeightChange,
}: AppHeaderProps) {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const handleLayout = useCallback(
        (event: LayoutChangeEvent) => {
            onHeightChange?.(event.nativeEvent.layout.height);
        },
        [onHeightChange],
    );

    return (
        <View
            accessibilityRole="header"
            onLayout={handleLayout}
            // Keeps the layout height stable across devices without ever adding to
            // the true content height: the inset is already inside `paddingTop`.
            style={[
                styles.container,
                {
                    // `flat` means "inside a scroll view": the scroller owns the
                    // inset, so none is added here.
                    paddingTop: flat ? spacing.sm : insets.top + spacing.sm,
                    paddingBottom: spacing.sm,
                    paddingHorizontal: theme.screenGutter,
                    backgroundColor: theme.colors.surface,
                    borderBottomWidth: separator ? theme.sizing.borderWidths.hairline : 0,
                    // A dark surface needs a *lightened* ring to separate; a
                    // darkened line on a dark background is simply invisible.
                    borderBottomColor: theme.isDark ? theme.darkElevation.ring : theme.colors.hairline,
                    minHeight: flat
                        ? undefined
                        : theme.sizing.layout.headerHeight + insets.top,
                    overflow: clip ? 'hidden' : 'visible',
                },
                flat || !separator ? null : theme.shadows.medium,
            ]}>
            <View style={styles.row}>
                {/* ---- LEFT: back / dismissal only ---- */}
                {onBack !== undefined ? (
                    <Pressable
                        accessibilityRole="button"
                        // The Pressable owns the label, so the glyph beneath it is
                        // decorative. Labelling both would make a screen reader
                        // announce "Go back" twice for one control.
                        accessibilityLabel="Go back"
                        onPress={onBack}
                        // 44pt painted + 12pt hitSlop on every side clears the
                        // platform minimum with room for a thumb.
                        hitSlop={spacing.sm}
                        style={({ pressed }) => [
                            styles.slot,
                            styles.backPlate,
                            {
                                backgroundColor: pressed
                                    ? theme.colors.surfaceMuted
                                    : theme.colors.surfaceSunken,
                            },
                        ]}>
                        <AppIcon
                            icon={ArrowLeftGlyph}
                            size="medium"
                            color="textLink"
                            accessibilityLabel={undefined}
                        />
                    </Pressable>
                ) : (
                    // Symmetric spacer: exactly the width the Back control would
                    // occupy, so the title stays optically centred on tab roots.
                    <View style={styles.slotSpacer} accessible={false} />
                )}

                {/* ---- CENTRE: title + subtitle, clamped by the side slots ---- */}
                <View style={styles.centre}>
                    <AppText
                        variant="headerMedium"
                        color="text"
                        numberOfLines={1}
                        ellipsizeMode="tail">
                        {title}
                    </AppText>
                    {subtitle !== undefined ? (
                        <AppText
                            variant="label"
                            color="textMuted"
                            numberOfLines={1}
                            ellipsizeMode="tail">
                            {subtitle}
                        </AppText>
                    ) : null}
                </View>

                {/* ---- RIGHT: contextual actions, fixed-width slots ---- */}
                {action !== undefined ? (
                    <View style={styles.actionSlot}>{action}</View>
                ) : (
                    <View style={styles.slotSpacer} accessible={false} />
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        justifyContent: 'flex-end',
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    // Both side slots are the same fixed size, which is what centres the middle.
    slot: {
        width: MIN_TOUCH_TARGET,
        height: MIN_TOUCH_TARGET,
        alignItems: 'flex-start',
        justifyContent: 'center',
    },
    /*
     * The back control is a *tinted plate*, not a bare arrow. A glyph floating on
     * the header background has no visible bounds, so it reads as decoration until
     * the user happens to tap it; the plate gives it a hit area you can see. The
     * radius is the icon-button role (a circle), matching every other standalone
     * icon control in the app.
     */
    backPlate: {
        alignItems: 'center',
        borderRadius: componentRadius.iconButton,
    },
    slotSpacer: {
        width: MIN_TOUCH_TARGET,
        height: MIN_TOUCH_TARGET,
    },
    actionSlot: {
        minWidth: MIN_TOUCH_TARGET,
        height: MIN_TOUCH_TARGET,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: spacing.xs,
    },
    centre: {
        flex: 1,
        // Without `minWidth: 0` a long title establishes a min-content width and
        // pushes the side slots outward, moving the Back target between screens.
        minWidth: 0,
        alignItems: 'center',
        justifyContent: 'center',
    },
});

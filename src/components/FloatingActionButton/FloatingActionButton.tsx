import { useContext } from 'react';
import { Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../theme/useTheme';
import type { IconComponent } from '../AppIcon/AppIcon';
import { PlusGlyph } from '../AppIcon/glyphs';

/**
 * A floating action button may not be smaller than this: it is the one control on
 * a screen the user is expected to hit while not looking directly at it.
 */
export const FAB_SIZE = 56;

/**
 * Gap between the button and the bottom boundary, in points.
 *
 * This is the number the brief pins. It is deliberately *added to* the tab bar's
 * measured height (or the safe-area inset when there is no tab bar) rather than
 * hard-coded as an absolute offset from the screen edge — see the docblock.
 */
export const FAB_SAFE_AREA_OFFSET = 16;

/** The spec's squircle corner — a rounded square, not a circle. */
const FAB_RADIUS = 18;
/** The spec's glyph size. */
const FAB_ICON_SIZE = 24;
/** The spec's pressed compression. */
const FAB_PRESS_SCALE = 0.94;
/** The spec's right gutter. */
const FAB_RIGHT = 20;
/** Brand-tinted shadow ink, matching the primary button's float shadow. */
const SHADOW_TINT = '#1B4FA0';

export type FloatingActionButtonProps = {
    onPress: () => void;
    /**
     * Glyph to render. Defaults to the `+` glyph built from two crossed bars, so
     * the stroke weight matches every other icon in the app instead of depending on
     * the metrics of the `+` character.
     */
    icon?: IconComponent;
    /**
     * Required. An icon-only control with no label is invisible to a screen reader,
     * and "the button in the corner" is not something a user can be told to look for.
     */
    accessibilityLabel: string;
    testID?: string;
};

/**
 * Floating action button — 56×56pt, **squircle** (radius 18), anchored bottom-right.
 *
 * ## Why a squircle rather than a circle
 *
 * The 2026 spec moves the FAB off the fully-round shape: a radius-18 rounded square
 * reads as a deliberate object with a top edge, where a circle reads as a generic
 * Material leftover. It also lets the button sit in the same corner language as the
 * cards it floats over.
 *
 * ## Why the offset is derived, not hard-coded
 *
 * The screen this replaces hard-coded `bottom: 24`. On a device with a home
 * indicator that put the button roughly ten points *into* the gesture bar, which
 * makes it both hard to hit and liable to trigger the OS gesture instead. The
 * button must clear the tab bar (which itself already contains the safe-area inset)
 * on a tab screen, and the inset on a screen without one — so the offset is derived
 * per-render and no device gets a phantom gap it did not need.
 *
 * ## Why this must be a sibling of the list, not a child
 *
 * A virtualised list is free to unmount any of its children it decides are
 * off-screen. An absolutely-positioned overlay parented to one is therefore
 * subject to disappearing mid-scroll. The caller renders this beside the list, and
 * reserves its lane with bottom padding (`ScreenContainer`'s `withFabSpacing`).
 */
export function FloatingActionButton({
    onPress,
    icon: Icon = PlusGlyph,
    accessibilityLabel,
    testID,
}: FloatingActionButtonProps): React.JSX.Element {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;

    /*
     * On a tab screen the tab bar is absolutely positioned at the bottom and its
     * measured height already includes the safe-area inset, so the FAB clears the
     * bar plus the spec's 16pt. Without a tab bar (a test, a preview, a future
     * non-tab host) the FAB is the bottom-most element and clears the inset itself.
     */
    const bottom =
        tabBarHeight > 0
            ? tabBarHeight + FAB_SAFE_AREA_OFFSET
            : insets.bottom + FAB_SAFE_AREA_OFFSET;

    /**
     * The spec's float shadow, tinted with the brand blue so the button reads as
     * lit. In dark mode the shadow is zeroed by the scheme's token set, so the
     * button instead carries a 1px `borderHairline` border — the spec's rule for
     * every elevated component in dark mode.
     */
    const shadowStyle: ViewStyle = {
        ...theme.shadows.float,
        shadowColor: SHADOW_TINT,
        ...(theme.isDark
            ? {
                borderWidth: theme.sizing.borderWidths.hairline,
                borderColor: theme.colors.borderHairline,
            }
            : null),
    };

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            onPress={onPress}
            testID={testID}
            style={({ pressed }) => [
                styles.button,
                shadowStyle,
                {
                    width: FAB_SIZE,
                    height: FAB_SIZE,
                    borderRadius: FAB_RADIUS,
                    backgroundColor: theme.colors.primary,
                    right: FAB_RIGHT,
                    bottom,
                    // Dim and scale, matching the Phase 2 press contract used by
                    // every other tappable surface in the app.
                    opacity: pressed ? 0.9 : 1,
                    transform: [{ scale: pressed ? FAB_PRESS_SCALE : 1 }],
                },
            ]}>
            <Icon size={FAB_ICON_SIZE} color={theme.colors.onPrimary} />
        </Pressable>
    );
}

const styles = StyleSheet.create({
    button: {
        position: 'absolute',
        alignItems: 'center',
        justifyContent: 'center',
    },
});

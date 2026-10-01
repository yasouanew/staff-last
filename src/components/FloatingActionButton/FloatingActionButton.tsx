import { Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { componentRadius, radius } from '../../theme/radius';
import { borderWidths, ICON_STROKE_WIDTH } from '../../theme/sizing';
import { useTheme } from '../../theme/useTheme';
import type { IconComponent } from '../AppIcon/AppIcon';
import { PlusGlyph } from '../AppIcon/glyphs';

/**
 * A floating action button may not be smaller than this: it is the one control on
 * a screen the user is expected to hit while not looking directly at it.
 */
export const FAB_SIZE = 56;

/**
 * Gap between the button and the bottom safe-area boundary, in points.
 *
 * This is the number the brief pins. It is deliberately *added to* the device
 * inset rather than hard-coded as an absolute offset from the screen edge — see
 * the docblock.
 */
export const FAB_SAFE_AREA_OFFSET = 16;

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
 * Floating action button — 56×56pt, circular, anchored bottom-right, sitting
 * exactly `FAB_SAFE_AREA_OFFSET` above the bottom safe-area boundary.
 *
 * ## Why the inset is added rather than assumed
 *
 * The screen this replaces hard-coded `bottom: 24`. On a device with a home
 * indicator that put the button roughly ten points *into* the gesture bar, which
 * makes it both hard to hit and liable to trigger the OS gesture instead. The
 * button must clear the inset on every device, and the inset is 0 on hardware that
 * has none — so the offset is derived per-render from `useSafeAreaInsets()` and no
 * device gets a phantom gap it did not need.
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

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            onPress={onPress}
            testID={testID}
            style={({ pressed }) => [
                styles.button,
                {
                    width: FAB_SIZE,
                    height: FAB_SIZE,
                    borderRadius: componentRadius.fab,
                    backgroundColor: theme.colors.primary,
                    // `right` is the same gutter the content respects, so the button
                    // lines up with the cards instead of floating at an arbitrary x.
                    right: theme.screenGutter,
                    bottom: insets.bottom + FAB_SAFE_AREA_OFFSET,
                    // Light: a real drop shadow. Dark: a shadow over content is the
                    // only tier that survives, plus a lit hairline ring, because a
                    // raised dark surface is *lighter* than the canvas and a dark
                    // shadow on it is invisible at any strength.
                    ...theme.shadows.high,
                    ...(theme.isDark
                        ? {
                            borderWidth: borderWidths.hairline,
                            borderColor: theme.darkElevation.ringStrong,
                        }
                        : { borderWidth: borderWidths.none }),
                    // Dim and scale, matching the Phase 2 press contract used by
                    // every other tappable surface in the app.
                    opacity: pressed ? 0.7 : 1,
                    transform: [{ scale: pressed ? 0.98 : 1 }],
                },
            ]}>
            <Icon
                size={theme.sizing.iconSizes.medium}
                color={theme.colors.onPrimary}
                strokeWidth={ICON_STROKE_WIDTH}
            />
        </Pressable>
    );
}

const styles = StyleSheet.create({
    button: {
        position: 'absolute',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.full,
    },
});

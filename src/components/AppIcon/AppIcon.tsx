import { View, type ViewStyle } from 'react-native';

import { iconSizes, ICON_STROKE_WIDTH, type IconSizePreset } from '../../theme/sizing';
import { useTheme } from '../../theme/useTheme';

import type { Colors } from '../../theme/colors';

/**
 * The render contract every vector glyph component satisfies.
 *
 * Lucide, Feather and the majority of RN vector sets all expose a component
 * taking `size` / `color` / `strokeWidth`. By typing against that shape rather
 * than against a concrete icon package, the atom can be adopted before the
 * dependency is even installed — and swapping the icon set later is a change to
 * the call sites' imports, not to this file.
 *
 * Call sites always pass the *component*, never a string name: an unused icon is
 * then never bundled, and a mistyped icon is a compile error instead of a blank
 * box at runtime.
 */
export type IconComponent = React.ComponentType<{
    size?: number;
    color?: string;
    strokeWidth?: number;
}>;

export type AppIconProps = {
    /** A vector glyph component (e.g. a Lucide or Feather icon). */
    icon: IconComponent;
    /** Canonical size preset. Defaults to `small` (16pt). */
    size?: IconSizePreset;
    /**
     * Escape hatch for a one-off size in points. Ignored when `size` is given.
     * Width and height are always forced equal regardless.
     */
    sizePoints?: number;
    /**
     * Theme colour token. Defaults to `textSecondary`, which is the "companion to
     * body text" tier — deliberately not `text`, so an icon never out-shouts the
     * label it sits beside.
     */
    color?: keyof Colors;
    /** Overrides the 2pt default stroke weight. Rarely needed. */
    strokeWidth?: number;
    /**
     * Providing a label makes the icon *meaningful* to assistive tech. Omitting
     * it (the default) makes the icon decorative and invisible to screen readers,
     * which is correct when the glyph merely decorates adjacent labelled text.
     */
    accessibilityLabel?: string;
    style?: ViewStyle;
    testID?: string;
};

/**
 * Vector icon atom.
 *
 * Its entire job is to give a glyph a **strictly square bounding box** at one of
 * four sanctioned sizes. That squaring is what makes the icon trustworthy inside
 * a row: a square box centres its child symmetrically on both axes, so an icon
 * next to a label needs no `marginTop` fudge to look aligned, and the same icon
 * cannot end up 1–2pt high on iOS and low on Android.
 *
 * Colour comes from the theme, never from the caller's hex.
 */
export function AppIcon({
    icon: Icon,
    size = 'small',
    sizePoints,
    color = 'textSecondary',
    strokeWidth = ICON_STROKE_WIDTH,
    accessibilityLabel,
    style,
    testID,
}: AppIconProps) {
    const theme = useTheme();

    // Single source of the box dimension — used for BOTH width and height, so
    // the box cannot be non-square even if `sizePoints` is an odd number.
    const boxSize = sizePoints ?? iconSizes[size];

    const isDecorative = accessibilityLabel === undefined;

    return (
        <View
            testID={testID}
            style={[styles.box, { width: boxSize, height: boxSize }, style]}
            // Screen readers skip a purely decorative glyph but still announce a
            // labelled one; `accessibilityRole="image"` gives the latter a name.
            accessibilityRole={isDecorative ? undefined : 'image'}
            accessibilityLabel={accessibilityLabel}
            accessibilityElementsHidden={isDecorative}
            importantForAccessibility={isDecorative ? 'no-hide-descendants' : 'yes'}
            // The glyph must hit-test where it *looks* — never intercept touches
            // meant for the enclosing button or input.
            pointerEvents="none">
            <Icon size={boxSize} color={theme.colors[color]} strokeWidth={strokeWidth} />
        </View>
    );
}

const styles = {
    box: {
        alignItems: 'center',
        justifyContent: 'center',
        // A stroke cap may extend a hairpast the viewBox; clipping it would
        // shave the glyph at small sizes.
        overflow: 'visible',
    },
} as const satisfies Record<string, ViewStyle>;

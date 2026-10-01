import { Text, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { FONT_SCALE_CAP } from '../../theme/sizing';
import { useTheme } from '../../theme/useTheme';
import type { TextVariant } from '../../theme/typography';

/**
 * Themed text primitive.
 *
 * Every string in the app is rendered through this component so that type scale,
 * colour and truncation behaviour stay consistent. Screens should not import
 * `Text` from `react-native` directly.
 *
 * The variant supplies font size/weight/colour; callers may override both via
 * `color` (theme token key) and `style`.
 */
export type AppTextProps = RNTextProps & {
    /** Named style from [`textVariants`](src/theme/typography.ts:1). */
    variant?: TextVariant;
    /**
     * Caps OS text scaling for this string.
     *
     * Use `'fixed'` when the text lives inside chrome whose height is pinned to a
     * token — a button, an input band, a tab slot, a badge. Those controls cannot
     * grow, so an uncapped label would clip. Free-flowing copy (body, headings,
     * empty states) should leave this unset and reflow instead.
     */
    scaling?: 'fixed' | 'flexible';
    /**
     * Theme colour token to use instead of the variant default. Restricted to the
     * `colors` object keys so an arbitrary hex cannot leak into a screen.
     */
    color?: keyof ReturnType<typeof useTheme>['colors'];
    /** Centre-aligns the text — the common case for empty/error states. */
    align?: TextStyle['textAlign'];
    /** Truncates to a single line with an ellipsis (list rows). */
    numberOfLines?: number;
};

export function AppText({
    variant = 'body',
    color,
    align,
    scaling = 'flexible',
    style,
    children,
    ...rest
}: AppTextProps) {
    const theme = useTheme();
    const variantStyle = theme.typography.variants[variant];
    const colorStyle: TextStyle | null = color !== undefined ? { color: theme.colors[color] } : null;

    return (
        <Text
            // `allowFontScaling` stays enabled (the default) so the OS font-size
            // accessibility setting is honoured — a deliberate choice for an app whose
            // core content is shift times employees must be able to read.
            //
            // `scaling="fixed"` adds a multiplier *ceiling* rather than disabling
            // scaling: the text still grows with the OS setting, it simply cannot grow
            // past the height of the control that holds it. Free-flowing text is
            // uncapped and reflows.
            maxFontSizeMultiplier={scaling === 'fixed' ? FONT_SCALE_CAP : undefined}
            style={[variantStyle, colorStyle, align !== undefined ? { textAlign: align } : null, style]}
            {...rest}>
            {children}
        </Text>
    );
}

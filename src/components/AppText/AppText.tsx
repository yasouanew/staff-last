import {
    Text,
    type TextProps as RNTextProps,
    type TextStyle,
} from 'react-native';

import { FONT_SCALE_CAP } from '../../theme/sizing';
import { useTheme } from '../../theme/useTheme';
import type { TextVariant } from '../../theme/typography';

export type AppTextProps = RNTextProps & {
    variant?: TextVariant;

    scaling?: 'fixed' | 'flexible';

    color?: keyof ReturnType<typeof useTheme>['colors'];

    align?: TextStyle['textAlign'];

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
}: AppTextProps): React.JSX.Element {
    const theme = useTheme();

    const variantStyle = theme.typography.variants[variant];

    /*
     * Typography variants contain legacy/static colours.
     *
     * Always replace that colour with the active theme colour.
     *
     * This prevents a variant created from lightColors from remaining white/
     * dark after the application changes appearance.
     */
    const resolvedColor =
        color !== undefined
            ? theme.colors[color]
            : theme.colors.text;

    return (
        <Text
            maxFontSizeMultiplier={
                scaling === 'fixed'
                    ? FONT_SCALE_CAP
                    : undefined
            }
            style={[
                variantStyle,
                {
                    color: resolvedColor,
                },
                align !== undefined
                    ? { textAlign: align }
                    : null,
                style,
            ]}
            {...rest}>
            {children}
        </Text>
    );
}
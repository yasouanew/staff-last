import { BlurView } from '@react-native-community/blur';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
    interpolate,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from 'react-native-reanimated';

import { pressScale, springs } from '../../theme/motion';
import { radiusRoles } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { useTheme } from '../../theme/useTheme';
import { useReduceMotion } from '../Skeleton/Skeleton';

/**
 * Surface container for grouped content.
 *
 * This is the molecule every list and settings screen is built from, so its
 * geometry is rigid rather than expressive: `radiusRoles.macro.md` (12pt) corners
 * and `spacing.md` (16pt) internal padding on both axes.
 *
 * ## Borderless by default, with micro-lift
 *
 * A resting card is separated from the canvas by *lift*, not by an outline. Three
 * things express that and nothing else does:
 *
 *  1. `shadows.micro` — a 1pt drop with a 3pt blur at 5% ink. The intent is that
 *     the shadow is never consciously seen; it exists so the card's edge does not
 *     dissolve into the background at large blur radii.
 *  2. A hairline border, but a *near-invisible* one — `colors.hairline` at 8% in
 *     light mode. On a soft canvas a truly zero-width border lets a card with a
 *     very light fill read as a floating rectangle with no edge at all; the
 *     hairline pins the geometry without drawing a box.
 *  3. `tone="muted"` for cards that should recede. A grey fill instead of a
 *     shadow is the correct treatment for nested or secondary content — two
 *     elevation tiers on one screen is the fastest way to make a business app
 *     look dated.
 *
 * In dark mode (2) is replaced by the stronger `darkElevation.ring`, because a
 * drop shadow is invisible against an already-dark surface and the edge must be
 * described by light rather than by shadow.
 *
 * ## `variant="glass"`
 *
 * A frosted panel for content that floats above scrolling or photographic
 * content. The blur is a real `BlurView` underneath, and the translucent
 * `colors.glassSurface` tint sits on top of it — the tint is what carries the
 * scheme's colour, so the same component reads as frosted-white in light mode and
 * frosted-slate in dark mode without a conditional.
 *
 * ## Press feedback
 *
 * When `onPress` is supplied the whole card is the hit target and the pressed
 * state is a Reanimated spring to `pressScale.card` (0.99) plus a press tint,
 * both driven by one shared value. Both properties are transform/opacity only, so
 * pressing a card never reflows the cards below it. Reduce Motion jumps the
 * shared value instead of springing it, so the state still appears instantly.
 */
export type AppCardTone = 'surface' | 'muted';
export type AppCardVariant = 'elevated' | 'glass' | 'plain';

export type AppCardProps = {
    children: React.ReactNode;
    /** Renders the card as a touch target with press feedback. */
    onPress?: () => void;
    /** Removes internal padding when the card wraps an image or a flush list. */
    padded?: boolean;
    /**
     * Elevation tier. A resting card should stay at `low`; `medium` is available
     * for a card that must read as sticky over scrolling content.
     */
    elevated?: 'micro' | 'low' | 'medium';
    /**
     * Surface treatment.
     *
     *  - `elevated` (default) — canvas-coloured fill with a micro shadow.
     *  - `glass`               — blurred, translucent panel for overlay content.
     *  - `plain`               — no shadow and no border; geometry only. Use when
     *                            the card is already inside another surface.
     */
    variant?: AppCardVariant;
    /** Fill tone. `muted` uses the grey well fill for secondary content. */
    tone?: AppCardTone;
    /** Uniform padding override. Defaults to `spacing.md`. */
    padding?: number;
    style?: ViewStyle;
    accessibilityLabel?: string;
    testID?: string;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function AppCard({
    children,
    onPress,
    padded = true,
    elevated = 'micro',
    variant = 'elevated',
    tone = 'surface',
    padding,
    style,
    accessibilityLabel,
    testID,
}: AppCardProps) {
    const theme = useTheme();
    const reduceMotion = useReduceMotion();

    const borderRadius = radiusRoles.macro.md;
    const isGlass = variant === 'glass';
    const isPlain = variant === 'plain';

    const fill = (() => {
        if (isGlass) {
            return theme.colors.glassSurface;
        }
        return tone === 'muted' ? theme.colors.surfaceMuted : theme.colors.surface;
    })();

    /**
     * `plain` describes its edge with nothing at all, `glass` with the lighter
     * glass border (the tint already provides separation), and an elevated card in
     * dark mode with the ring — see the class doc.
     */
    const borderColor = (() => {
        if (isPlain) {
            return 'transparent';
        }
        if (isGlass) {
            return theme.colors.glassBorder;
        }
        return theme.isDark ? theme.darkElevation.ring : theme.colors.hairline;
    })();

    /** 0 = resting, 1 = fully pressed. Drives scale and tint together. */
    const press = useSharedValue(0);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: interpolate(press.value, [0, 1], [1, pressScale.card]) }],
    }));

    const tintStyle = useAnimatedStyle(() => ({
        opacity: interpolate(press.value, [0, 1], [0, 0.06]),
    }));

    const settle = (to: number): void => {
        press.value = reduceMotion ? to : withSpring(to, springs.snappy);
    };

    const pressInk = theme.isDark ? '#FFFFFF' : '#000000';

    const surfaceStyle: ViewStyle = {
        borderRadius,
        // Always clip: children must never paint outside the rounded rect.
        overflow: 'hidden',
        backgroundColor: isGlass ? undefined : fill,
        padding: padded ? (padding ?? spacing.md) : 0,
        borderWidth: isPlain ? 0 : theme.sizing.borderWidths.hairline,
        borderColor,
        ...(isPlain ? theme.shadows.none : theme.shadows[elevated]),
    };

    /**
     * The blur layer. Rendered *behind* the content and outside the padding box so
     * the tint never blurs the text that sits on it. `pointerEvents="none"` keeps
     * it from intercepting the card's touch.
     */
    const blurLayer = isGlass ? (
        <BlurView
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
            blurType={theme.isDark ? 'dark' : 'light'}
            blurAmount={18}
            // Android's BlurView is expensive and the overlay path already dims the
            // content behind the sheet, so it is opted out of here.
            reducedTransparencyFallbackColor={theme.colors.glassSurface}
        />
    ) : null;

    if (onPress === undefined) {
        return (
            <View style={[surfaceStyle, style]} testID={testID}>
                {blurLayer}
                {children}
            </View>
        );
    }

    return (
        <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            onPress={onPress}
            onPressIn={() => settle(1)}
            onPressOut={() => settle(0)}
            testID={testID}
            // A card sitting flush against its neighbour is still comfortably
            // tappable at the seam.
            hitSlop={spacing.xxs}
            style={[surfaceStyle, animatedStyle, style]}>
            {blurLayer}
            {/* Press tint sits above the fill but below the content, and is
                pointer-transparent so it never steals the touch. */}
            <Animated.View
                pointerEvents="none"
                style={[
                    StyleSheet.absoluteFill,
                    { borderRadius, backgroundColor: pressInk },
                    tintStyle,
                ]}
            />
            {/* `flex: 1` keeps the touch area covering the full card rectangle
                rather than only the content's intrinsic height. */}
            <View style={styles.content}>{children}</View>
        </AnimatedPressable>
    );
}

/**
 * Horizontal rule matching the card border treatment.
 *
 * Insets by `spacing.md` to line up with the card's own padding, so a divider
 * between two card sections reads as a rule inside the card rather than a break
 * across it.
 */
export function Divider({ inset = false }: { inset?: boolean }) {
    const theme = useTheme();

    return (
        <View
            style={[
                styles.divider,
                {
                    height: theme.sizing.borderWidths.hairline,
                    backgroundColor: theme.colors.divider,
                    marginHorizontal: inset ? spacing.md : 0,
                },
            ]}
        />
    );
}

const styles = StyleSheet.create({
    divider: {
        width: '100%',
    },
    content: {
        flex: 1,
    },
});

import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
    interpolate,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from 'react-native-reanimated';

import { useHaptics } from '../../hooks/useHaptics';
import { pressScale, springs } from '../../theme/motion';
import { MIN_TOUCH_TARGET, controlHeights } from '../../theme/sizing';
import { spacing } from '../../theme/spacing';
import { type HapticSemantic } from '../../theme/haptics';
import { useTheme } from '../../theme/useTheme';
import { useReduceMotion } from '../Skeleton/Skeleton';
import { AppText } from '../AppText/AppText';

/**
 * Primary action button.
 *
 * Handles the four states every form in the app needs: idle, pressed,
 * submitting (spinner + disabled), and disabled. The `danger` variant covers the
 * error-adjacent/destructive case (e.g. "Sign out everywhere").
 *
 * Two rules drive the implementation:
 *
 *  1. **The paint and the touch target are separate concerns.** A `sm` button is
 *     painted 36pt tall because that is what the layout rhythm wants, but it is
 *     still tappable across 44pt (Apple HIG / Material minimum). Shrinking the
 *     hit area to match a visual choice is the most common accessibility defect
 *     in a button component.
 *  2. **Pressed feedback is a spring, not a hard cut.** Touch-down drives a
 *     Reanimated shared value from 0→1; the scale and the press tint both
 *     interpolate from it, so the button compresses and darkens together on a
 *     single `springs.snappy` curve. Both properties are transform/opacity only,
 *     so the animation runs on the UI thread and never reflows siblings.
 *
 * Reduce Motion is honoured by *jumping* the shared value instead of springing
 * it — the pressed state still appears, it simply arrives instantly.
 */
export type AppButtonVariant = 'primary' | 'secondary' | 'text' | 'ghost' | 'danger';
export type AppButtonSize = 'sm' | 'md' | 'lg';

export type AppButtonProps = {
    label: string;
    onPress: () => void;
    variant?: AppButtonVariant;
    size?: AppButtonSize;
    /** Shows a spinner in the label's slot and blocks interaction. Implied by `disabled`. */
    loading?: boolean;
    disabled?: boolean;
    /** Stretches to the container width — the default for form submit buttons. */
    fullWidth?: boolean;
    /** Optional leading element, e.g. an [`AppIcon`](src/components/AppIcon/AppIcon.tsx:1). */
    leading?: React.ReactNode;
    /** Optional trailing element, e.g. a disclosure chevron. */
    trailing?: React.ReactNode;
    /**
     * Haptic pulse fired on a successful press. Defaults to a light impact for
     * `primary` and a heavy impact for `danger` (the two consequential variants);
     * pass `false` to silence a button that fires often, e.g. in a list.
     */
    haptic?: HapticSemantic | false;
    /** Accessibility label; falls back to `label`. */
    accessibilityLabel?: string;
    testID?: string;
};

const HORIZONTAL_PADDING: Record<AppButtonSize, number> = {
    sm: spacing.sm,
    md: spacing.lg,
    lg: spacing.xl,
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function AppButton({
    label,
    onPress,
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled = false,
    fullWidth = true,
    leading,
    trailing,
    haptic,
    accessibilityLabel,
    testID,
}: AppButtonProps) {
    const theme = useTheme();
    const reduceMotion = useReduceMotion();
    const triggerHaptic = useHaptics();

    const isBlocked = disabled || loading;

    const paintedHeight = controlHeights[size];
    // Never smaller than the platform minimum, whatever `size` says.
    const touchHeight = Math.max(paintedHeight, MIN_TOUCH_TARGET);

    const isTextOnly = variant === 'text' || variant === 'ghost';

    /** 0 = resting, 1 = fully pressed. Drives both the scale and the tint. */
    const press = useSharedValue(0);

    const backgroundColor = (() => {
        if (variant === 'primary') {
            return isBlocked ? theme.colors.primaryDisabled : theme.colors.primary;
        }

        if (variant === 'danger') {
            return isBlocked ? theme.colors.surfaceMuted : theme.colors.danger;
        }

        if (variant === 'secondary') {
            return isBlocked ? theme.colors.surfaceMuted : theme.colors.secondary;
        }

        return 'transparent';
    })();

    const labelColor = (() => {
        if (variant === 'primary') {
            return isBlocked ? theme.colors.textMuted : theme.colors.onPrimary;
        }

        if (variant === 'danger') {
            return isBlocked ? theme.colors.textMuted : theme.colors.onDanger;
        }

        if (isTextOnly) {
            return isBlocked ? theme.colors.textDisabled : theme.colors.textLink;
        }

        return isBlocked ? theme.colors.textDisabled : theme.colors.onSecondary;
    })();

    const borderRadius = theme.radius.md;

    /**
     * Press ink. Light mode darkens toward black; dark mode must *lighten*, or
     * the tint would be invisible against an already-dark fill.
     */
    const pressInk = theme.isDark ? '#FFFFFF' : '#000000';

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: interpolate(press.value, [0, 1], [1, pressScale.button]) }],
    }));

    const tintStyle = useAnimatedStyle(() => ({
        // 8% is the readability ceiling: enough to register as a press, not
        // enough to shift the label's contrast ratio.
        opacity: interpolate(press.value, [0, 1], [0, 0.08]),
    }));

    const settle = (to: number): void => {
        // Reduce Motion: arrive instantly rather than springing.
        press.value = reduceMotion ? to : withSpring(to, springs.snappy);
    };

    const handlePress = (): void => {
        const semantic =
            haptic === false
                ? undefined
                : (haptic ?? (variant === 'danger' ? 'destructive' : variant === 'primary' ? 'actionPress' : undefined));

        if (semantic !== undefined) {
            triggerHaptic(semantic);
        }

        onPress();
    };

    return (
        <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel ?? label}
            accessibilityState={{ disabled: isBlocked, busy: loading }}
            disabled={isBlocked}
            onPress={handlePress}
            onPressIn={() => settle(1)}
            onPressOut={() => settle(0)}
            testID={testID}
            style={[
                styles.base,
                {
                    // Padding is computed against the *painted* height so the label
                    // stays optically centred while the touch band stretches.
                    minHeight: touchHeight,
                    height: touchHeight,
                    paddingHorizontal: HORIZONTAL_PADDING[size],
                    borderRadius,
                    backgroundColor,
                    borderWidth: isTextOnly ? 0 : theme.sizing.borderWidths.hairline,
                    borderColor: variant === 'secondary' ? theme.colors.border : 'transparent',
                    width: fullWidth ? '100%' : undefined,
                },
                animatedStyle,
            ]}>
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

            {loading ? (
                // The spinner replaces the row rather than joining it, so the
                // button does not grow when it starts submitting.
                <ActivityIndicator size="small" color={labelColor} />
            ) : (
                <View style={styles.content}>
                    {leading}
                    <AppText
                        variant="bodyStrong"
                        style={{ color: labelColor }}
                        // The button's height is pinned to a control token, so the
                        // label's scaling is capped rather than allowed to overflow it.
                        scaling="fixed"
                        numberOfLines={1}>
                        {label}
                    </AppText>
                    {trailing}
                </View>
            )}
        </AnimatedPressable>
    );
}

const styles = StyleSheet.create({
    base: {
        alignItems: 'center',
        justifyContent: 'center',
        // Clips the press tint to the button's own rounded rect.
        overflow: 'hidden',
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.xs,
        // Lets an over-long (e.g. translated) label ellipsise instead of pushing
        // the leading icon out of the button.
        maxWidth: '100%',
    },
});

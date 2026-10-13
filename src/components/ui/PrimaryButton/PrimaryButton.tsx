import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, type ViewStyle } from 'react-native';
import Animated, {
    interpolate,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from 'react-native-reanimated';

import { springs } from '../../../theme/motion';
import { useTheme } from '../../../theme/useTheme';
import { AppText } from '../../AppText';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * The 2026 auth primary action.
 *
 * ## Why this exists alongside `AppButton`
 *
 * [`AppButton`](src/components/AppButton/AppButton.tsx:1) is the general-purpose
 * button: five variants, three sizes, a haptic map and a press-tint overlay. The
 * auth spec wants one very specific object — a 54pt, radius-16, brand-filled
 * slab with a *tinted* float shadow — and it wants it identical on every auth
 * screen. Encoding that here means the login, forgot-password and reset screens
 * cannot drift apart, and the brand fill is read from the theme rather than
 * hardcoded.
 *
 * ## Pressed state
 *
 * Touch-down drives a Reanimated shared value 0→1 on `springs.snappy`; the scale
 * interpolates to 0.98 and the fill swaps to `primaryPressed`. Both are
 * transform/colour only, so the animation runs on the UI thread and never
 * reflows siblings.
 *
 * ## Shadow
 *
 * The spec's float shadow is tinted with the brand blue (`#1B4FA0` at 25%)
 * rather than the neutral shadow ink, so the button reads as *lit by its own
 * colour* rather than as a grey box that happens to be blue.
 */
export type PrimaryButtonProps = {
    label: string;
    onPress: () => void;
    /** Shows a spinner in the label's slot and blocks interaction. */
    loading?: boolean;
    disabled?: boolean;
    /** Stretches to the container width. Defaults to true. */
    fullWidth?: boolean;
    accessibilityLabel?: string;
    testID?: string;
    /** Merged last, so a caller can add layout (e.g. `marginTop`). */
    style?: ViewStyle;
};

/* ---- Spec geometry -------------------------------------------------- */

/** Painted height — the spec's 54pt. */
const BUTTON_HEIGHT = 54;
/** Corner radius — the spec's 16pt. */
const BUTTON_RADIUS = 16;
/** Pressed compression — the spec's 0.98. */
const PRESS_SCALE = 0.98;
/** Brand-tinted shadow ink. */
const SHADOW_TINT = '#1B4FA0';
/** Brand-tinted shadow opacity. */
const SHADOW_OPACITY = 0.25;

export function PrimaryButton({
    label,
    onPress,
    loading = false,
    disabled = false,
    fullWidth = true,
    accessibilityLabel,
    testID,
    style,
}: PrimaryButtonProps): React.JSX.Element {
    const theme = useTheme();
    const [isPressed, setIsPressed] = useState(false);

    const isBlocked = disabled || loading;
    /**
     * The spec's *disabled* state, distinct from *loading*.
     *
     * A disabled button is a deliberate "not yet" — the week is clean or invalid —
     * and is painted `primarySoft` with `primary` text at 0.5 opacity so it reads
     * as intentionally inert. A loading button is mid-action and keeps the muted
     * `primaryDisabled` fill behind its spinner. Collapsing the two into one
     * washed-out blue is the ambiguity this replaces.
     */
    const isDisabled = disabled && !loading;

    /** 0 = resting, 1 = fully pressed. Drives the scale. */
    const press = useSharedValue(0);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: interpolate(press.value, [0, 1], [1, PRESS_SCALE]) }],
    }));

    const backgroundColor = isDisabled
        ? theme.tokens.colors.primarySoft
        : isBlocked
            ? theme.colors.primaryDisabled
            : isPressed
                ? theme.tokens.colors.primaryPressed
                : theme.tokens.colors.primary;

    /** Disabled label ink: brand `primary`, dimmed to 0.5 by the label style. */
    const labelColor = isDisabled ? theme.tokens.colors.primary : theme.colors.onPrimary;

    /**
     * The float token carries both platform descriptions; only the ink and its
     * opacity are overridden with the brand tint the spec calls for. In dark
     * mode the scheme's token set zeroes the shadow, so the button carries a 1px
     * `borderHairline` border instead.
     */
    const shadowStyle: ViewStyle = {
        ...theme.shadows.float,
        shadowColor: SHADOW_TINT,
        shadowOpacity: theme.isDark ? 0 : SHADOW_OPACITY,
        ...(theme.isDark
            ? {
                borderWidth: theme.sizing.borderWidths.hairline,
                borderColor: theme.colors.borderHairline,
            }
            : null),
    };

    return (
        <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel ?? label}
            accessibilityState={{ disabled: isBlocked, busy: loading }}
            disabled={isBlocked}
            onPress={onPress}
            onPressIn={() => {
                setIsPressed(true);
                press.value = withSpring(1, springs.snappy);
            }}
            onPressOut={() => {
                setIsPressed(false);
                press.value = withSpring(0, springs.snappy);
            }}
            testID={testID}
            style={[
                styles.base,
                shadowStyle,
                {
                    backgroundColor,
                    width: fullWidth ? '100%' : undefined,
                },
                animatedStyle,
                style,
            ]}>
            {loading ? (
                // The spinner replaces the label rather than joining it, so the
                // button does not grow when it starts submitting.
                <ActivityIndicator size="small" color={theme.colors.onPrimary} />
            ) : (
                <AppText
                    variant="bodyStrong"
                    scaling="fixed"
                    numberOfLines={1}
                    style={[
                        styles.label,
                        { color: labelColor, opacity: isDisabled ? 0.5 : 1 },
                    ]}>
                    {label}
                </AppText>
            )}
        </AnimatedPressable>
    );
}

const styles = StyleSheet.create({
    base: {
        height: BUTTON_HEIGHT,
        borderRadius: BUTTON_RADIUS,
        alignItems: 'center',
        justifyContent: 'center',
    },
    label: {
        // The spec's 16/22 w600 — one step above `bodyStrong`'s 15pt.
        fontSize: 16,
        lineHeight: 22,
        fontWeight: '600',
    },
});

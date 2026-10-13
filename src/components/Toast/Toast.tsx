import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radiusRoles } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { useTheme } from '../../theme/useTheme';
import { AppIcon } from '../AppIcon/AppIcon';
import { CheckCircleGlyph } from '../AppIcon/glyphs';
import { AppText } from '../AppText/AppText';
import { useReduceMotion } from '../Skeleton/Skeleton';

/**
 * Transient success confirmation.
 *
 * ## Why a pill and not a banner
 *
 * A full-width banner reads as a persistent state (an offline bar, a form-level
 * error) and competes with the screen's own chrome. A centred pill reads as a
 * *moment* — it appears, it is read, it leaves — which is what a "your password
 * was updated" confirmation is. The 44pt height and `r999` radius are the spec's.
 *
 * ## Auto-dismiss
 *
 * The pill dismisses itself after `duration` (3s by default) by calling
 * `onDismiss`, so the parent owns the `visible` flag and the toast stays a
 * controlled component. The timer is cleared on unmount and whenever the
 * visibility flips, so a re-render cannot leave a stray timer behind.
 *
 * `onDismiss` is held in a ref: the parent typically passes an inline arrow, and
 * depending on it directly would restart the timer on every parent render — the
 * toast would then never dismiss on a busy screen.
 *
 * ## Placement
 *
 * Absolutely positioned at the top of its parent, offset by the top safe-area
 * inset so it clears the notch. The parent must be a positioned, full-height
 * container (the screen root).
 */
export type ToastProps = {
    message: string;
    visible: boolean;
    onDismiss: () => void;
    /** Auto-dismiss delay in milliseconds. Defaults to 3000. */
    duration?: number;
    testID?: string;
};

/** Painted height — the spec's 44. */
const TOAST_HEIGHT = 44;
/** Auto-dismiss delay — the spec's 3s. */
const DEFAULT_DURATION = 3000;

export function Toast({
    message,
    visible,
    onDismiss,
    duration = DEFAULT_DURATION,
    testID,
}: ToastProps): React.JSX.Element | null {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const reduceMotion = useReduceMotion();

    const opacity = useRef(new Animated.Value(0)).current;

    // See the class doc: a ref keeps the timer from restarting on every parent
    // render when `onDismiss` is an inline arrow.
    const onDismissRef = useRef(onDismiss);
    onDismissRef.current = onDismiss;

    useEffect(() => {
        if (!visible) {
            opacity.setValue(0);
            return;
        }

        if (reduceMotion) {
            opacity.setValue(1);
        } else {
            Animated.timing(opacity, {
                toValue: 1,
                duration: 180,
                useNativeDriver: true,
            }).start();
        }

        const timer = setTimeout(() => onDismissRef.current(), duration);

        return () => clearTimeout(timer);
    }, [visible, duration, opacity, reduceMotion]);

    if (!visible) {
        return null;
    }

    return (
        <View
            pointerEvents="box-none"
            style={[styles.host, { top: insets.top + spacing.xs }]}>
            <Animated.View
                testID={testID}
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                style={[
                    styles.pill,
                    { backgroundColor: theme.colors.successSoft, opacity },
                ]}>
                <AppIcon icon={CheckCircleGlyph} size="small" color="success" />
                <AppText
                    variant="bodyStrong"
                    numberOfLines={1}
                    style={{ color: theme.colors.success }}>
                    {message}
                </AppText>
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    host: {
        position: 'absolute',
        left: 0,
        right: 0,
        alignItems: 'center',
        zIndex: 1000,
    },
    pill: {
        height: TOAST_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        paddingHorizontal: spacing.md,
        borderRadius: radiusRoles.pill.full,
    },
});

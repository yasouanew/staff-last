import { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';

import { useTheme } from '../../../theme/useTheme';

/**
 * The availability day toggle.
 *
 * ## Why a custom switch rather than the platform `Switch`
 *
 * The platform control cannot be given the spec's exact geometry (48 × 28 track,
 * 24pt thumb) or its two-tone treatment (a `borderHairline` track when off, a
 * `success` track when on), and it renders differently enough between iOS and
 * Android that a row of seven of them never lines up. This is a small, fully
 * controlled control so the seven rows are pixel-identical.
 *
 * ## Motion
 *
 * Only the thumb's `translateX` is animated, on a 200ms timing curve. The track
 * colour is swapped directly rather than interpolated: a colour tween on a 28pt
 * object is imperceptible, and keeping it out of the worklet means the animation
 * touches a single composited property.
 */

/** Track geometry — the spec's 48 × 28. */
const TRACK_WIDTH = 48;
const TRACK_HEIGHT = 28;
/** Thumb — the spec's 24pt disc. */
const THUMB_SIZE = 24;
/** Inset of the thumb from the track rim, so the disc never touches the edge. */
const THUMB_INSET = 2;
/** Horizontal travel, derived so the geometry cannot drift apart. */
const THUMB_TRAVEL = TRACK_WIDTH - THUMB_SIZE - THUMB_INSET * 2;
/** The spec's 200ms slide. */
const SLIDE_DURATION = 200;

export type AvailabilitySwitchProps = {
    value: boolean;
    onValueChange: (value: boolean) => void;
    accessibilityLabel: string;
    testID?: string;
};

export function AvailabilitySwitch({
    value,
    onValueChange,
    accessibilityLabel,
    testID,
}: AvailabilitySwitchProps): React.JSX.Element {
    const theme = useTheme();

    // 0 = off (thumb left), 1 = on (thumb right). Seeded from the current value so
    // the resting position is correct before the first animation runs.
    const progress = useSharedValue(value ? 1 : 0);

    useEffect(() => {
        progress.value = withTiming(value ? 1 : 0, { duration: SLIDE_DURATION });
    }, [progress, value]);

    const thumbStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: progress.value * THUMB_TRAVEL }],
    }));

    return (
        <Pressable
            accessibilityRole="switch"
            accessibilityLabel={accessibilityLabel}
            accessibilityState={{ checked: value }}
            onPress={() => onValueChange(!value)}
            // The painted track is 28pt tall, below the 44pt platform minimum, so
            // the touch area is widened without changing the visual geometry.
            hitSlop={theme.spacing.sm}
            testID={testID}
            style={[
                styles.track,
                {
                    // Off track is the spec's `borderHairline`; on track is
                    // `success`. Both are scheme tokens, so the control re-tints
                    // in dark mode without a branch here.
                    backgroundColor: value
                        ? theme.colors.success
                        : theme.colors.borderHairline,
                },
            ]}>
            <Animated.View
                style={[
                    styles.thumb,
                    // The thumb stays white in both schemes, per the spec. The
                    // card shadow is zeroed in dark mode by the scheme's token
                    // set, so the disc reads as a flat white puck on the track.
                    theme.shadows.card,
                    { backgroundColor: '#FFFFFF' },
                    thumbStyle,
                ]}
            />
        </Pressable>
    );
}

const styles = StyleSheet.create({
    track: {
        width: TRACK_WIDTH,
        height: TRACK_HEIGHT,
        borderRadius: TRACK_HEIGHT / 2,
        padding: THUMB_INSET,
        justifyContent: 'center',
    },
    thumb: {
        width: THUMB_SIZE,
        height: THUMB_SIZE,
        borderRadius: THUMB_SIZE / 2,
    },
});

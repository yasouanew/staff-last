import { useEffect, useState } from 'react';
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

    /**
     * Local optimistic mirror of `value`.
     *
     * ## Why the control cannot be *purely* controlled
     *
     * Every toggle on this screen is owned by the screen reducer, but this
     * component is rendered by `DayRow`, which is a plain function component with
     * no `React.memo`. Two independent things can therefore leave the switch
     * showing a state the reducer never adopted:
     *
     *  1. `LayoutAnimation.configureNext` is armed in `DayRow`'s effect for the
     *     flip, and this switch's own `withTiming` starts in the same commit. On
     *     Fabric (the New Architecture used by RN 0.87) the layout animation's
     *     frame can be committed *before* the animated style is applied, so the
     *     thumb finishes its travel while the `backgroundColor` from the previous
     *     render is still on screen — the row looks switched off even though
     *     `is_available` is `true`. Re-tapping then sends the *new* `!value`, which
     *     looks like "the toggle doesn't respond".
     *  2. Any render of the parent that does not change `value` (a transient
     *     re-render, a `savedMessage` clear, an undo/redo of the week) leaves the
     *     thumb where the last animation stopped rather than where `value` says
     *     it should be.
     *
     * Mirroring the prop into local state fixes both: the press paints
     * immediately (the control is responsive even before the reducer's commit
     * lands), and the effect below — keyed on the *prop*, not the local copy —
     * re-asserts the authoritative value whenever the parent disagrees. If the
     * reducer rejects the change, the mirror is pulled back to `value` instead of
     * silently drifting.
     */
    const [visualValue, setVisualValue] = useState(value);
    const progress = useSharedValue(value ? 1 : 0);

    useEffect(() => {
        setVisualValue(value);
        progress.value = withTiming(value ? 1 : 0, { duration: SLIDE_DURATION });
    }, [progress, value]);

    const thumbStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: progress.value * THUMB_TRAVEL }],
    }));

    const handlePress = (): void => {
        const next = !value;
        // Paint first so the control never feels dead, then hand the change to
        // the owner. `value` (not `visualValue`) is the base of the negation: the
        // parent is the single source of truth for what the toggle means.
        setVisualValue(next);
        onValueChange(next);
    };

    return (
        <Pressable
            accessibilityRole="switch"
            accessibilityLabel={accessibilityLabel}
            accessibilityState={{ checked: visualValue }}
            onPress={handlePress}
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
                    backgroundColor: visualValue
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

import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';

import { useTheme } from '../../../theme/useTheme';
import { AppText } from '../../AppText';

/**
 * The 2026 segmented control.
 *
 * ## Why this exists alongside the older `SegmentedControl`
 *
 * [`src/components/SegmentedControl`](src/components/SegmentedControl/SegmentedControl.tsx:1)
 * is a `FlatList`-backed radio group that flips a segment's *background* between
 * transparent and `surface`. That is fine for a scroller of unequal labels, but the
 * 2026 spec wants a fixed, equal-width track with a **raised thumb that slides**
 * between segments — the platform-native feel — and it wants the selected label to
 * never truncate.
 *
 * ## The animated indicator
 *
 * A single absolutely-positioned thumb is measured from the track's own width and
 * animated with `withTiming` on `translateX`. Because the segments are equal width
 * by construction, the thumb's travel is `index * segmentWidth` — no per-segment
 * measurement pass, and no desynchronisation when the labels change.
 *
 * ## Never truncate
 *
 * The spec's "Second …" bug came from a fixed-width segment ellipsising a long
 * label. Each label is `numberOfLines={1}` with `adjustsFontSizeToFit` and a
 * `minimumFontScale`, so "Second half" shrinks to fit rather than clipping.
 */
export type SegmentedControlOption = {
    value: string;
    label: string;
    disabled?: boolean;
};

export type SegmentedControlProps = {
    options: ReadonlyArray<SegmentedControlOption>;
    /** The selected value, or `null` when nothing has been chosen yet. */
    value: string | null;
    onChange: (value: string) => void;
    /** Announced as the group's name; not rendered. */
    accessibilityLabel?: string;
    testID?: string;
};

/* ---- Spec geometry -------------------------------------------------- */

/** Track height — the spec's 44. */
const TRACK_HEIGHT = 44;
/** Track radius — the spec's 12. */
const TRACK_RADIUS = 12;
/** Track padding — the spec's 3. */
const TRACK_PADDING = 3;
/** Segment radius — the spec's 9. */
const SEGMENT_RADIUS = 9;
/** The spec's 200ms slide. */
const SLIDE_DURATION = 200;

export function SegmentedControl({
    options,
    value,
    onChange,
    accessibilityLabel,
    testID,
}: SegmentedControlProps): React.JSX.Element {
    const theme = useTheme();
    const [trackWidth, setTrackWidth] = useState(0);

    const selectedIndex = Math.max(
        options.findIndex(option => option.value === value),
        0,
    );

    // The inner width available to the segments, once the track has measured.
    const innerWidth = Math.max(trackWidth - TRACK_PADDING * 2, 0);
    const segmentWidth = options.length > 0 ? innerWidth / options.length : 0;

    const offset = useSharedValue(0);

    useEffect(() => {
        offset.value = withTiming(selectedIndex * segmentWidth, { duration: SLIDE_DURATION });
    }, [offset, selectedIndex, segmentWidth]);

    const thumbStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: offset.value }],
    }));

    const handleLayout = (event: LayoutChangeEvent): void => {
        setTrackWidth(event.nativeEvent.layout.width);
    };

    return (
        <View
            accessibilityRole="radiogroup"
            accessibilityLabel={accessibilityLabel}
            testID={testID}
            onLayout={handleLayout}
            style={[
                styles.track,
                {
                    backgroundColor: theme.colors.surfaceMuted,
                    borderRadius: TRACK_RADIUS,
                },
            ]}>
            {/* The sliding thumb. Rendered only once the track has a width, so it
                never flashes at x=0 on the first frame. */}
            {segmentWidth > 0 ? (
                <Animated.View
                    pointerEvents="none"
                    style={[
                        styles.thumb,
                        theme.tokens.shadows.shadowCard,
                        {
                            width: segmentWidth,
                            backgroundColor: theme.colors.surface,
                            borderRadius: SEGMENT_RADIUS,
                        },
                        thumbStyle,
                    ]}
                />
            ) : null}

            <View style={styles.segments}>
                {options.map(option => {
                    const selected = option.value === value;
                    const isDisabled = option.disabled === true;

                    return (
                        <Pressable
                            key={option.value}
                            accessibilityRole="radio"
                            accessibilityLabel={option.label}
                            accessibilityState={{ selected, disabled: isDisabled }}
                            disabled={isDisabled}
                            onPress={() => onChange(option.value)}
                            style={({ pressed }) => [
                                styles.segment,
                                {
                                    opacity: pressed && !isDisabled ? 0.7 : isDisabled ? 0.5 : 1,
                                },
                            ]}>
                            <AppText
                                variant={selected ? 'bodyStrong' : 'body'}
                                color={selected ? 'text' : 'textSecondary'}
                                numberOfLines={1}
                                // Shrink to fit rather than ellipsise — the "Second …"
                                // defect this replaces.
                                adjustsFontSizeToFit
                                minimumFontScale={0.8}
                                scaling="fixed">
                                {option.label}
                            </AppText>
                        </Pressable>
                    );
                })}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    track: {
        height: TRACK_HEIGHT,
        padding: TRACK_PADDING,
        justifyContent: 'center',
    },
    thumb: {
        position: 'absolute',
        top: TRACK_PADDING,
        left: TRACK_PADDING,
        bottom: TRACK_PADDING,
    },
    segments: {
        flexDirection: 'row',
        flex: 1,
    },
    segment: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        // Without this a long label widens its segment at the others' expense.
        minWidth: 0,
        paddingHorizontal: 4,
    },
});

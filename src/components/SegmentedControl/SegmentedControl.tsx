import { memo, useCallback, useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, View, type ListRenderItemInfo } from 'react-native';

import { componentRadius, radius } from '../../theme/radius';
import { borderWidths, MIN_TOUCH_TARGET } from '../../theme/sizing';
import { spacing } from '../../theme/spacing';
import { useTheme } from '../../theme/useTheme';
import { AppText } from '../AppText/AppText';

/**
 * One choice in the group.
 *
 * `value` is a string rather than a number so the component can be used for both
 * numeric server ids (`leave_type_id`) and string enums (`leaveSessions`). Callers
 * with a numeric value coerce at the boundary — `String(id)` in, `Number(value)`
 * out — which keeps the control itself free of type parameters it cannot infer.
 */
export type SegmentedOption = {
    value: string;
    label: string;
    disabled?: boolean;
};

export type SegmentedControlProps = {
    options: ReadonlyArray<SegmentedOption>;
    /** The selected value, or `null` when nothing has been chosen yet. */
    value: string | null;
    onChange: (value: string) => void;
    /**
     * Renders the group as a horizontal scroller instead of equal-width segments.
     *
     * Use it when the option labels are of unknown or very unequal length — leave
     * *type* names, for instance. Equal widths are only fair if the labels are
     * comparable; forcing `"Annual leave"` and `"Bereavement"` into the same sliver
     * crushes one and wastes space on the other.
     */
    scrollable?: boolean;
    /** Announced as the group's name; not rendered. */
    accessibilityLabel?: string;
    testID?: string;
};

/**
 * Segmented control — a radio group drawn as a track with a raised thumb.
 *
 * ## Why the semantics are `radio`, not `tab`
 *
 * A tab changes *which view* is shown; a radio changes *a value within a view*.
 * Assistive technology already knows how to announce and navigate both, and the
 * two are not interchangeable: VoiceOver reads a radio group as "2 of 4", which is
 * exactly the information a user needs when picking a leave type, whereas a tab
 * list announces navigation that goes nowhere. The wrapper carries `radiogroup`;
 * each option carries `radio` plus its own selected state.
 *
 * ## Why the thumb is a background, not a moving view
 *
 * Animating an absolutely-positioned thumb between segments requires measuring
 * every segment and re-measuring on font-scale change. Since selection never
 * changes a segment's size, flipping the background between transparent and
 * `surface` produces the same visual with no measurement pass at all — and it
 * cannot desynchronise from the labels, because it *is* the label's container.
 *
 * ## Why `surface`/`surfaceMuted` and not a pair of hard-coded greys
 *
 * Both tokens invert together in dark mode, so the raised segment stays raised in
 * either scheme without a per-scheme branch here.
 */
export function SegmentedControl({
    options,
    value,
    onChange,
    scrollable = false,
    accessibilityLabel,
    testID,
}: SegmentedControlProps): React.JSX.Element {
    const theme = useTheme();

    const trackStyle = useMemo(
        () => ({
            backgroundColor: theme.colors.surfaceMuted,
            borderColor: theme.colors.border,
            borderRadius: componentRadius.input,
            borderWidth: borderWidths.hairline,
            padding: spacing.xxs,
        }),
        [theme],
    );

    const renderOption = useCallback(
        ({ item }: ListRenderItemInfo<SegmentedOption>) => (
            <Segment
                option={item}
                selected={item.value === value}
                // In scroller mode a segment hugs its label and needs its own gap;
                // in equal-width mode the track's `gap` spaces them instead.
                grow={!scrollable}
                onPress={onChange}
            />
        ),
        [onChange, value, scrollable],
    );

    const keyExtractor = useCallback((item: SegmentedOption) => item.value, []);

    if (!scrollable) {
        return (
            <View
                accessibilityRole="radiogroup"
                accessibilityLabel={accessibilityLabel}
                testID={testID}
                style={[styles.track, trackStyle, { flexDirection: 'row', gap: spacing.xxs }]}>
                {options.map(option => (
                    <Segment
                        key={option.value}
                        option={option}
                        selected={option.value === value}
                        grow
                        onPress={onChange}
                    />
                ))}
            </View>
        );
    }

    return (
        <View
            accessibilityRole="radiogroup"
            accessibilityLabel={accessibilityLabel}
            testID={testID}
            style={trackStyle}>
            <FlatList<SegmentedOption>
                horizontal
                data={options}
                keyExtractor={keyExtractor}
                renderItem={renderOption}
                // The brief's rule, restated: an indicator bar under a control that
                // is already visibly a scroller is noise.
                showsHorizontalScrollIndicator={false}
                // Option counts here are single digits, so windowing costs more than
                // it saves; render them all and never show a blank segment.
                initialNumToRender={options.length}
                maxToRenderPerBatch={options.length}
                windowSize={3}
                contentContainerStyle={{ gap: spacing.xxs }}
                // An inner horizontal scroller must not try to claim height from the
                // column-flex parent, or it swallows the rest of the form.
                style={styles.scroller}
            />
        </View>
    );
}

type SegmentProps = {
    option: SegmentedOption;
    selected: boolean;
    /** `flex: 1` in equal-width mode; hug-the-label in scroller mode. */
    grow: boolean;
    onPress: (value: string) => void;
};

/**
 * One segment.
 *
 * Memoised with an id-forwarding press handler, so tapping segment *n* reports the
 * option's own value rather than its position — the same rule the ShiftCard and
 * the day strip follow. A reordering of the options (the API re-sorting leave
 * types, say) must not silently change which value is submitted.
 */
const Segment = memo(function Segment({ option, selected, grow, onPress }: SegmentProps) {
    const theme = useTheme();
    const isDisabled = option.disabled === true;

    const handlePress = useCallback(() => {
        onPress(option.value);
    }, [onPress, option.value]);

    return (
        <Pressable
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ selected, disabled: isDisabled }}
            disabled={isDisabled}
            onPress={handlePress}
            style={({ pressed }) => [
                styles.segment,
                grow ? styles.segmentGrow : styles.segmentHug,
                {
                    backgroundColor: selected ? theme.colors.surface : 'transparent',
                    borderColor: selected ? theme.colors.border : 'transparent',
                    borderRadius: radius.xs,
                    borderWidth: selected ? borderWidths.hairline : borderWidths.none,
                    opacity: pressed && !isDisabled ? 0.7 : isDisabled ? 0.5 : 1,
                },
                // A raised segment needs a lift on Android only; the border does the
                // work on iOS where a 1pt hairline is already a crisp edge.
                selected ? theme.shadows.low : null,
            ]}>
            <AppText
                variant={selected ? 'bodyStrong' : 'body'}
                color={selected ? 'text' : 'textSecondary'}
                numberOfLines={1}
                ellipsizeMode="tail">
                {option.label}
            </AppText>
        </Pressable>
    );
});

const styles = StyleSheet.create({
    track: {
        alignItems: 'stretch',
    },
    scroller: {
        // See the note on the FlatList: a horizontal scroller inside a column flex
        // parent will otherwise grow to fill the remaining height.
        flexGrow: 0,
    },
    segment: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: spacing.sm,
        // Track padding is `spacing.xxs` on each side, so 36 + 4 + 4 clears the
        // 44pt target without the segment itself looking like a button.
        minHeight: MIN_TOUCH_TARGET - spacing.xxs * 2,
    },
    segmentGrow: {
        flex: 1,
        // Without this, a long label in one segment widens it at the others'
        // expense and the group stops looking segmented.
        minWidth: 0,
    },
    segmentHug: {
        flexGrow: 0,
        minWidth: MIN_TOUCH_TARGET,
    },
});

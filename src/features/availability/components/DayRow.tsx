import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '../../../components/AppText';
import { availabilityCopy, TIME_END_HINT, TIME_INPUT_HINT } from '../../../constants/copy';
import { useTheme } from '../../../theme/useTheme';
import { formatTime } from '../../../utils/date';
import type { WeekDayDraft } from '../utils';
import { AvailabilitySwitch } from './AvailabilitySwitch';
import { TimeField } from './TimeField';

/**
 * One day in the availability settings list.
 *
 * ## Collapsed vs expanded
 *
 * The row is a fixed 64pt list item when collapsed — day name, a one-line summary
 * and the toggle. Turning the toggle on reveals the start/end inputs beneath it.
 * The header band keeps its 64pt height in both states, so the toggle never moves
 * as the row expands and the list reads as a stable column of switches.
 *
 * ## Expansion animation
 *
 * `LayoutAnimation` is used rather than a measured height tween: the body's height
 * depends on the label/hint stack, which is text-scaled, so a hardcoded height
 * would be wrong at large OS text sizes. `LayoutAnimation` animates whatever the
 * layout actually resolves to. On Android it must be enabled once, which is done
 * at module load.
 */

/*
 * ## Why the row no longer arms `LayoutAnimation`
 *
 * It used to call `LayoutAnimation.configureNext` in an effect keyed on
 * `is_available`, to animate the expansion of the time fields. On Fabric (RN
 * 0.87) that configured layout animation is committed on the *next* frame, and
 * `AvailabilitySwitch` starts its own `withTiming` in the same commit. The two
 * animations target the same frame: the row's height changes, the switch's thumb
 * jumps, but the track's `backgroundColor` — a plain style prop, not animated —
 * can be committed from the pre-flip render. The toggle then appears to stay off
 * while the reducer holds `is_available: true`, and the save bar enables against
 * what looks like a stale screen. The expansion is now un-animated, which removes
 * the competing commit entirely; the switch's own slide is the only animation on
 * a toggle and it always matches the committed value.
 */

/** The spec's collapsed row height. */
const ROW_HEIGHT = 64;
/** The spec's row gutter. */
const ROW_PADDING = 20;
/** Gap between the two time fields. */
const FIELD_GAP = 12;
/** Bottom padding of the expanded body. */
const BODY_PADDING_BOTTOM = 16;
/** Gap above the "Mark as unavailable" link. */
const LINK_MARGIN_TOP = 10;

export type DayRowProps = {
    day: WeekDayDraft;
    /** Localised day name, e.g. "Monday". */
    dayName: string;
    /** Validation message for this day, if any. */
    error?: string;
    onToggle: (value: boolean) => void;
    /** Called with the chosen `HH:MM` start time. */
    onChangeStart: (value: string) => void;
    /** Called with the chosen `HH:MM` end time. */
    onChangeEnd: (value: string) => void;
    onMarkUnavailable: () => void;
    /** Suppresses the bottom hairline on the final row of the group. */
    isLast?: boolean;
};

/**
 * `memo` on the row so a single toggle does not re-render the other six rows.
 *
 * The screen dispatches `updateDay` for one day, and the reducer returns a new
 * `days` array where only the touched entry is a new object. Combined with the
 * stable `useCallback`-free props (the handlers are recreated each render, so the
 * comparison below ignores them deliberately — the day object is what changes)
 * the untouched rows bail out and never restage their expansion.
 */
export const DayRow = memo(function DayRow({
    day,
    dayName,
    error,
    onToggle,
    onChangeStart,
    onChangeEnd,
    onMarkUnavailable,
    isLast = false,
}: DayRowProps): React.JSX.Element {
    const theme = useTheme();

    const summary = !day.is_available
        ? availabilityCopy.unavailable
        : day.start_time == null && day.end_time == null
            ? availabilityCopy.availableAllDay
            : `${formatTime(day.start_time)} – ${formatTime(day.end_time)}`;

    return (
        <View
            testID={`availability-day-${day.day_of_week}`}
            style={[
                styles.row,
                {
                    borderBottomWidth: isLast ? 0 : theme.sizing.borderWidths.hairline,
                    borderBottomColor: theme.tokens.colors.borderHairline,
                },
            ]}>
            <View style={styles.header}>
                <View style={styles.textBlock}>
                    <AppText variant="bodyStrong" color="text" numberOfLines={1}>
                        {dayName}
                    </AppText>
                    <AppText variant="caption" color="textMuted" numberOfLines={1}>
                        {summary}
                    </AppText>
                </View>

                <AvailabilitySwitch
                    value={day.is_available}
                    onValueChange={onToggle}
                    accessibilityLabel={`${dayName} available`}
                    testID={`availability-toggle-${day.day_of_week}`}
                />
            </View>

            {day.is_available ? (
                <View style={styles.body}>
                    <View style={styles.fields}>
                        <TimeField
                            label={availabilityCopy.startLabel}
                            value={day.start_time}
                            onChange={onChangeStart}
                            placeholder="09:00"
                            hint={TIME_INPUT_HINT}
                            error={error}
                            testID={`availability-start-${day.day_of_week}`}
                        />
                        <TimeField
                            label={availabilityCopy.endLabel}
                            value={day.end_time}
                            onChange={onChangeEnd}
                            placeholder="17:00"
                            hint={TIME_END_HINT}
                            error={error}
                            testID={`availability-end-${day.day_of_week}`}
                        />
                    </View>

                    {error ? (
                        <AppText
                            variant="caption"
                            color="danger"
                            testID={`availability-error-${day.day_of_week}`}>
                            {error}
                        </AppText>
                    ) : (
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Mark ${dayName} as unavailable`}
                            testID={`availability-clear-${day.day_of_week}`}
                            onPress={onMarkUnavailable}
                            hitSlop={theme.spacing.sm}
                            style={styles.link}>
                            <AppText variant="bodyStrong" color="danger">
                                {availabilityCopy.markUnavailable}
                            </AppText>
                        </Pressable>
                    )}
                </View>
            ) : null}
        </View>
    );
});

const styles = StyleSheet.create({
    row: {
        backgroundColor: 'transparent',
    },
    header: {
        height: ROW_HEIGHT,
        paddingHorizontal: ROW_PADDING,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
    },
    textBlock: {
        flex: 1,
        // Without `minWidth: 0` a long day name establishes a min-content width and
        // pushes the toggle off the row.
        minWidth: 0,
        gap: 2,
    },
    body: {
        paddingHorizontal: ROW_PADDING,
        paddingBottom: BODY_PADDING_BOTTOM,
    },
    fields: {
        flexDirection: 'row',
        gap: FIELD_GAP,
    },
    link: {
        marginTop: LINK_MARGIN_TOP,
        alignSelf: 'flex-start',
    },
});

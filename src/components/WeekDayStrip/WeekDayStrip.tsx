import { memo } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { scaleRowHeight, useRowScale } from '../../hooks';
import { shadows } from '../../theme/shadows';
import { spacing } from '../../theme/spacing';
import { useTheme } from '../../theme/useTheme';
import { AppText } from '../AppText/AppText';

/**
 * One day cell's worth of data.
 *
 * `date` is the API date string (`YYYY-MM-DD`) and doubles as the list key — see
 * the note on `keyExtractor` below.
 */
export type WeekDay = {
    /** API date, `YYYY-MM-DD`. Stable identity for the cell. */
    date: string;
    /** Short weekday label, e.g. `"Mon"`. */
    weekday: string;
    /** Day-of-month number, e.g. `"21"`. */
    day: string;
    /** Short month label, e.g. `"Sep"`. */
    month: string;
    /** Marker for "this is today" — styles the cell even when unselected. */
    isToday: boolean;
};

export type WeekDayStripProps = {
    days: WeekDay[];
    selectedDate: string;
    onSelect: (date: string) => void;
    testID?: string;
};

/** Cell height, per the 2026 spec. Scaled by the OS text size (see below). */
const CELL_HEIGHT = 64;

/** Cell corner radius, per the 2026 spec. */
const CELL_RADIUS = 14;

/**
 * Horizontal day selector.
 *
 * ## Why this is a plain `View` row and not a `FlatList`
 *
 * The previous build was a horizontal `FlatList` with a negative
 * `marginHorizontal` and a `getItemLayout` that derived cell widths from the
 * window. That combination is what clipped the selected Monday pill at the left
 * edge: the list's content container was pulled outside the screen gutter, and
 * the first cell's shadow/fill was then cut by the list's own bounds.
 *
 * Seven cells always fit on screen, so virtualisation bought nothing here. The
 * strip is now a **flex row of seven equal cells** inside a plain `View` with
 * `paddingHorizontal: 20` and `overflow: 'visible'`. There is no negative
 * margin, no absolute offset and no scroll engine, so a selected cell renders
 * fully within bounds by construction — the clip cannot recur.
 *
 * ## Why the cells are `flex: 1` rather than a computed width
 *
 * A derived pixel width has to be recomputed on every rotation and every
 * `useWindowDimensions` change, and any rounding error shows up as a cell that
 * is a hair too wide and pushes its neighbour off the edge. `flex: 1` lets the
 * layout engine divide the available width exactly, with the `gap` subtracted
 * first — no arithmetic, no drift.
 *
 * ## Why the height is scaled
 *
 * The cell holds three stacked lines (weekday, day number, month), so its height
 * must grow with the OS text size or the lines clip. `CELL_HEIGHT` is the design
 * baseline; the rendered height is scaled by the same factor the rest of the app
 * uses, so a large accessibility setting is honoured without the strip
 * overflowing its own geometry.
 */
export function WeekDayStrip({
    days,
    selectedDate,
    onSelect,
    testID,
}: WeekDayStripProps): React.JSX.Element {
    const scale = useRowScale();
    const cellHeight = scaleRowHeight(CELL_HEIGHT, scale);

    return (
        <View
            testID={testID}
            style={[styles.strip, { height: cellHeight }]}
            // The selected cell's shadow must be allowed to paint outside the
            // row's bounds; clipping it is the defect this rebuild removes.
            pointerEvents="box-none">
            {days.map(day => (
                <DayCell
                    key={day.date}
                    day={day}
                    height={cellHeight}
                    selected={day.date === selectedDate}
                    onPress={onSelect}
                />
            ))}
        </View>
    );
}

type DayCellProps = {
    day: WeekDay;
    /** Scaled cell height, so the three stacked lines never clip. */
    height: number;
    selected: boolean;
    onPress: (date: string) => void;
};

/**
 * A single day column.
 *
 * Memoised on the four props that can change it. `onPress` is passed the whole
 * `day` rather than a bound `() => onPress(day.date)` callback, which is what
 * allows the memo to hold: a per-item arrow function would be a new identity on
 * every parent render and defeat the comparison entirely.
 *
 * Idle vs selected follow the brief exactly: idle is a neutral surface with
 * tertiary/secondary ink and **no shadow**; selected is the primary fill with
 * white text and a primary-tinted float shadow.
 */
function DayCellComponent({ day, height, selected, onPress }: DayCellProps): React.JSX.Element {
    const theme = useTheme();
    const { colors } = theme;

    const weekdayColor = selected ? colors.onPrimary : colors.textMuted;
    const dayColor = selected ? colors.onPrimary : colors.text;
    const monthColor = selected ? colors.onPrimary : colors.textMuted;

    return (
        <Pressable
            onPress={() => onPress(day.date)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${day.weekday} ${day.day} ${day.month}`}
            style={({ pressed }) => [
                styles.cell,
                {
                    backgroundColor: selected ? colors.primary : colors.surfaceMuted,
                    height,
                    opacity: pressed ? 0.7 : 1,
                    // The selected cell floats; the idle cell is flat. The shadow
                    // is tinted with the brand colour rather than the neutral ink
                    // so the lift reads as "selected", not merely "raised".
                    ...(selected
                        ? { ...shadows.float, shadowColor: colors.primary }
                        : shadows.none),
                },
            ]}>
            <AppText variant="micro" scaling="fixed" style={{ color: weekdayColor }} numberOfLines={1}>
                {day.weekday}
            </AppText>

            <AppText
                scaling="fixed"
                // Bold weight for the selected day is part of the state, not
                // decoration — it must survive in greyscale.
                style={[styles.dayNumber, { color: dayColor }]}
                numberOfLines={1}>
                {day.day}
            </AppText>

            <AppText variant="micro" scaling="fixed" style={{ color: monthColor }} numberOfLines={1}>
                {day.month}
            </AppText>
        </Pressable>
    );
}

/**
 * The memo is load-bearing, not an optimisation: without it the strip
 * re-renders all seven cells on every selection change, which is exactly the
 * kind of avoidable per-tap work that costs a frame on a low-end Android.
 */
const DayCell = memo(DayCellComponent);

const strip: ViewStyle = {
    flexDirection: 'row',
    // The one global gutter, applied here rather than by a parent so the strip
    // is self-contained and cannot be pulled outside it by a negative margin.
    paddingHorizontal: 20,
    gap: 6,
    // Explicit: the selected cell's shadow paints outside the row.
    overflow: 'visible',
};

const styles = StyleSheet.create({
    strip,
    cell: {
        alignItems: 'center',
        borderRadius: CELL_RADIUS,
        flex: 1,
        gap: spacing.xxs,
        // `height` is applied inline, scaled by the OS text size (see the
        // component body), so the three stacked lines cannot clip.
        justifyContent: 'center',
        overflow: 'visible',
    },
    dayNumber: {
        fontSize: 17,
        lineHeight: 22,
        fontWeight: '600',
        fontVariant: ['tabular-nums'],
    },
});

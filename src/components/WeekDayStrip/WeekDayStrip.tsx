import { memo, useCallback, useMemo } from 'react';
import {
    FlatList,
    Pressable,
    StyleSheet,
    useWindowDimensions,
    View,
    type ListRenderItemInfo,
} from 'react-native';

import { scaleRowHeight, useRowScale } from '../../hooks';
import { layout } from '../../theme/sizing';
import { spacing } from '../../theme/spacing';
import { radiusRoles } from '../../theme/radius';
import { useTheme } from '../../theme/useTheme';
import { AppText } from '../AppText/AppText';

/**
 * One day cell's worth of data.
 *
 * `date` is the API date string (`YYYY-MM-DD`) and doubles as the list key —
 * see the note on `keyExtractor` below.
 */
export type WeekDay = {
    /** API date, `YYYY-MM-DD`. Stable identity for the list. */
    date: string;
    /** Single-letter or short weekday label, e.g. "Mo". */
    weekday: string;
    /** Day-of-month number, rendered as a string to keep the cell dumb. */
    day: string;
    /** Marker for "this is today" — styles the cell even when unselected. */
    isToday: boolean;
};

export type WeekDayStripProps = {
    days: WeekDay[];
    selectedDate: string;
    onSelect: (date: string) => void;
    testID?: string;
};

/** The strip is always exactly one week — a fixed, known length. */
const DAYS_PER_WEEK = 7;

/**
 * Horizontal day selector carousel.
 *
 * ## Why this is a `FlatList` and not a `View` with `.map`
 *
 * Seven items fit on screen, so a virtualised list buys nothing here *today*.
 * It is still a `FlatList` for three reasons that all survive that observation:
 *
 * 1. **It is the mandated architecture** (V1). If this screen later grows a
 *    two-week or month strip, the scroll engine is already correct and the only
 *    change is the data feeding it.
 * 2. **`getItemLayout` makes the horizontal scroll jump-free.** A day strip is
 *    the one place in the app where tapping "next day" should scroll
 *    programmatically; without measured offsets that scroll is a guess.
 * 3. **Windowing keeps `initialNumToRender` explicit**, which is the difference
 *    between a defined first frame and an accidental one.
 *
 * ## Why every cell is rendered immediately
 *
 * `initialNumToRender = DAYS_PER_WEEK` is deliberate, not a default left
 * unset. Seven cells are always visible, so deferring any of them would
 * produce a visibly empty strip for one frame. `windowSize = 1` is safe
 * *because* everything fits: there is no off-screen tail to pre-render.
 *
 * ## Why the active dot is always mounted
 *
 * The dot marks the selected day. Rendering it conditionally would change the
 * cell's inner height when selection moves, so the row would jump by the dot's
 * height on every tap. It is instead always present at `opacity: 0` and only
 * its opacity changes — the same reserved-space technique the auth screens use
 * for the password strength meter, and the reason `CELL_HEIGHT` is a constant
 * that `getItemLayout` can rely on.
 *
 * ## Layout maths
 *
 * Cell width is derived, never guessed. The strip shows seven gutters between
 * eight cell edges across the content width, so:
 *
 * ```
 * cell = (contentWidth - (DAYS_PER_WEEK - 1) * GAP) / DAYS_PER_WEEK
 * ```
 *
 * `contentWidth` is `min(screenWidth, maxContentWidth)` so the strip is
 * identical on a phone and on a tablet, where the rest of the app is capped by
 * `layout.maxContentWidth`.
 */
export function WeekDayStrip({
    days,
    selectedDate,
    onSelect,
    testID,
}: WeekDayStripProps): React.JSX.Element {
    const theme = useTheme();
    const { width: windowWidth } = useWindowDimensions();

    const contentWidth = Math.min(windowWidth, layout.maxContentWidth) - theme.screenGutter * 2;
    const cellWidth =
        (contentWidth - (DAYS_PER_WEEK - 1) * spacing.xs) / DAYS_PER_WEEK;

    // `getItemLayout` is contractually required for a fixed-size horizontal
    // list: it lets the list answer "where is item n?" without measuring, which
    // is what makes `scrollToIndex` reliable and the first render instant.
    /*
     * The cell holds three stacked lines (weekday, day number, dot), so its height
     * must grow with the OS text size. `CELL_HEIGHT` is the design baseline; the
     * actual height is scaled, and `getItemLayout` is told the scaled value so the
     * horizontal `scrollToIndex` used for "next day" stays accurate.
     */
    const scale = useRowScale();
    const cellHeight = scaleRowHeight(CELL_HEIGHT, scale);

    const getItemLayout = useCallback(
        (_data: ArrayLike<WeekDay> | null | undefined, index: number) => ({
            length: cellWidth + spacing.xs,
            offset: (cellWidth + spacing.xs) * index,
            index,
        }),
        [cellWidth],
    );

    // Identity-stable renderer (V4). `onSelect` must itself be stable — the
    // screen wraps it in `useCallback`, because a fresh closure here would
    // discard `DayCell`'s memoisation on every parent render.
    const renderItem = useCallback(
        ({ item }: ListRenderItemInfo<WeekDay>) => (
            <DayCell
                day={item}
                width={cellWidth}
                height={cellHeight}
                selected={item.date === selectedDate}
                onPress={onSelect}
            />
        ),
        [cellWidth, cellHeight, selectedDate, onSelect],
    );

    // The key is the API date, never the index (V3): switching weeks reorders
    // and replaces every item, and an index key would make React reuse a
    // selected "Tuesday" cell as an unselected "Wednesday" one — carrying the
    // old selection styling into the new week for a frame.
    const keyExtractor = useCallback((day: WeekDay) => day.date, []);

    const separator = useMemo(
        () => <View style={{ width: spacing.xs }} />,
        [],
    );

    return (
        <FlatList
            testID={testID}
            data={days}
            horizontal
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            getItemLayout={getItemLayout}
            ItemSeparatorComponent={() => separator}
            showsHorizontalScrollIndicator={false}
            // Everything fits on screen, so: render it all, keep the window tight.
            initialNumToRender={DAYS_PER_WEEK}
            maxToRenderPerBatch={DAYS_PER_WEEK}
            windowSize={1}
            removeClippedSubviews={false}
            contentContainerStyle={styles.content}
            style={{ marginHorizontal: -theme.screenGutter }}
        />
    );
}

type DayCellProps = {
    day: WeekDay;
    width: number;
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
 * dark text and **no shadow**; selected is the primary fill with white bold
 * text and the active dot.
 */
function DayCellComponent({ day, width, height, selected, onPress }: DayCellProps): React.JSX.Element {
    const theme = useTheme();

    const textColor = selected ? theme.colors.onPrimary : theme.colors.text;
    const weekdayColor = selected ? theme.colors.onPrimary : theme.colors.textMuted;

    return (
        <Pressable
            onPress={() => onPress(day.date)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${day.weekday} ${day.day}`}
            style={({ pressed }) => [
                styles.cell,
                {
                    backgroundColor: selected
                        ? theme.colors.primary
                        : theme.colors.surfaceMuted,
                    opacity: pressed ? 0.7 : 1,
                    width,
                    height,
                },
            ]}>
            <AppText variant="caption" style={{ color: weekdayColor }}>
                {day.weekday}
            </AppText>

            <AppText
                variant={selected ? 'subtitle' : 'body'}
                // Bold weight for the selected day is part of the state, not
                // decoration — it must survive in greyscale (V10).
                style={{
                    color: textColor,
                    fontWeight: selected ? '700' : '500',
                }}>
                {day.day}
            </AppText>

            {/*
             * Always mounted, only ever faded (see component docblock). The
             * unselected colour is `textMuted`, the "today" colour is the
             * primary tint so an unselected today still reads as today.
             */}
            <View
                style={[
                    styles.dot,
                    {
                        backgroundColor: selected
                            ? theme.colors.onPrimary
                            : theme.colors.primary,
                        opacity: selected || day.isToday ? 1 : 0,
                    },
                ]}
            />
        </Pressable>
    );
}

/**
 * The memo is load-bearing, not an optimisation: without it the strip
 * re-renders all seven cells on every selection change, which is exactly the
 * kind of avoidable per-tap work that costs a frame on a low-end Android.
 */
const DayCell = memo(DayCellComponent);

const CELL_HEIGHT = 72;

const styles = StyleSheet.create({
    content: {
        alignItems: 'center',
    },
    cell: {
        alignItems: 'center',
        borderRadius: radiusRoles.macro.md,
        gap: spacing.xxs,
        // `height` is applied inline, scaled by the OS text size (see the component
        // body), so the three stacked lines cannot clip at large accessibility sizes.
        justifyContent: 'center',
        // Explicitly no shadow on the idle state; the selected state is
        // distinguished by fill alone, per the brief.
        elevation: 0,
        shadowOpacity: 0,
    },
    dot: {
        borderRadius: radiusRoles.pill.full,
        height: 4,
        width: 4,
    },
});

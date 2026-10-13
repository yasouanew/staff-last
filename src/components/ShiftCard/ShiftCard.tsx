import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { scaleRowHeight, useRowScale } from '../../hooks';
import { useTheme } from '../../theme/useTheme';
import { formatDate, formatDuration, formatTime, shiftDurationMinutes } from '../../utils/date';
import type { Shift } from '../../features/shifts/types';
import { AppIcon, ChevronRightGlyph } from '../AppIcon';
import { AppText } from '../AppText/AppText';
import { StatusBadge } from '../StatusBadge/StatusBadge';

/**
 * Fixed row height, in points.
 *
 * This constant is load-bearing: it is passed to the feed's `getItemLayout`
 * (V5), which lets the list compute scroll offsets without measuring a single
 * row. If the rendered row drifts from this number, scroll position and
 * `scrollToIndex` silently desync — so the row's content is clamped with
 * `numberOfLines` rather than allowed to grow.
 */
export const SHIFT_ROW_HEIGHT = 80;

type Props = {
    shift: Shift;
    onPress: (shiftId: number) => void;
    /** Render the date line. Hidden on Home "Today", where the header already says Today. */
    showDate?: boolean;
    /** Hide the drill-down chevron when the row is not navigable. */
    showChevron?: boolean;
};

/**
 * One shift card — the single row definition shared by the Home feed and the
 * Roster feeds.
 *
 * ## The three-slot contract
 *
 * The brief specifies the card as Left / Middle / Right, and the slots have
 * different jobs, so they are built differently:
 *
 * | Slot | Content | Sizing |
 * |------|---------|--------|
 * | Left | start and end time | `minWidth: 92`, `flexShrink: 1` |
 * | Middle | location + duration | `flex: 1` and **`minWidth: 0`** |
 * | Right | status pill + chevron | intrinsic, never shrinks |
 *
 * ## The truncation fix
 *
 * The previous card pinned the time column to a fixed 56pt width, which clipped
 * a 12-hour start time to `"9:0…"`. The column now has a **92pt floor** and is
 * allowed to shrink only as a last resort, and the start time itself is set with
 * `numberOfLines={1}` plus `adjustsFontSizeToFit` down to a 0.85 minimum — so a
 * long time shrinks to fit rather than being cut off. The floor is what makes the
 * common case (a 12-hour time) render at full size.
 *
 * ## Why the chevron is inside the Pressable, not beside it
 *
 * The whole card is one touch target, so the chevron is a purely visual
 * affordance. It is rendered with no `accessibilityLabel` (making `AppIcon`
 * treat it as decorative) and `pointerEvents="none"` inside `AppIcon`, so a tap
 * on the chevron hits the card's `Pressable` rather than being swallowed by the
 * glyph (V9).
 *
 * ## Why `onPress` receives the id
 *
 * The card is memoised and rendered as a list item, so its `onPress` must not
 * close over a per-item arrow function created by the parent — that would be a
 * new function identity on every render and would discard the `memo`. The card
 * instead calls a single stable handler with its own id, letting the parent
 * memoise both the renderer and the handler.
 */
function ShiftCardComponent({
    shift,
    onPress,
    showDate = true,
    showChevron = true,
}: Props): React.JSX.Element {
    const theme = useTheme();
    const { colors, radius, shadows } = theme.tokens;
    /*
     * The row's height is a contract with `getItemLayout` on the Home and Roster
     * feeds, so it is scaled by the same factor those screens use. See
     * [`useRowScale`](src/hooks/useRowScale.ts:1): the constant and the rendered row
     * must move together or the list desyncs when the OS text size changes.
     */
    const scale = useRowScale();
    const rowHeight = scaleRowHeight(SHIFT_ROW_HEIGHT, scale);

    const minutes = shiftDurationMinutes(
        shift.start_time,
        shift.end_time,
        shift.break_minutes,
        shift.paid_break,
    );

    /**
     * A cancelled shift is still a real row — it is not hidden and its opacity
     * stays at 1 — but its *content* recedes: the time and location drop to the
     * tertiary ink tier and the duration is struck through, so a cancelled day
     * is scannable at a glance without the row disappearing. The status pill
     * (danger, "Cancelled") carries the state for anyone who reads the row
     * rather than scanning it.
     */
    const isCancelled = shift.status === 'cancelled';

    const locationLine = shift.branch?.name ?? 'Unassigned branch';
    const durationLine = showDate
        ? `${formatDate(shift.date)} · ${formatDuration(minutes)}`
        : formatDuration(minutes);

    const timeColor = isCancelled ? colors.inkTertiary : colors.inkPrimary;
    const locationColor = isCancelled ? colors.inkTertiary : colors.inkPrimary;
    const durationColor = isCancelled ? colors.inkTertiary : colors.inkSecondary;

    const handlePress = useCallback(() => onPress(shift.id), [onPress, shift.id]);

    return (
        <Pressable
            onPress={handlePress}
            accessibilityRole="button"
            accessibilityLabel={`Shift on ${formatDate(shift.date)} from ${formatTime(
                shift.start_time,
            )} to ${formatTime(shift.end_time)}, ${shift.status.replace(/_/g, ' ')}`}
            style={({ pressed }) => [
                styles.row,
                {
                    minHeight: rowHeight,
                    backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
                    borderColor: colors.borderHairline,
                    borderRadius: radius.rLg,
                    ...shadows.shadowCard,
                    opacity: pressed ? 0.9 : 1,
                },
            ]}>
            {/* ── Left slot: the time bounds. 92pt floor, shrinks last. ── */}
            <View style={styles.times}>
                <AppText
                    style={[styles.startTime, { color: timeColor }]}
                    numberOfLines={1}
                    // Shrink the glyphs rather than clip them: a 12-hour start
                    // time must never render as "9:0…".
                    adjustsFontSizeToFit
                    minimumFontScale={0.85}>
                    {formatTime(shift.start_time)}
                </AppText>
                <AppText variant="caption" style={{ color: colors.inkTertiary }} numberOfLines={1}>
                    {formatTime(shift.end_time)}
                </AppText>
            </View>

            {/* ── Middle slot: location + duration. Flexes, truncates. ── */}
            <View style={styles.details}>
                <AppText variant="bodyStrong" style={{ color: locationColor }} numberOfLines={1}>
                    {locationLine}
                </AppText>
                <AppText
                    variant="caption"
                    style={[
                        { color: durationColor },
                        // A cancelled shift's duration is struck through so the
                        // row reads as "this did not happen" at a glance, while
                        // the row itself stays fully opaque and present.
                        isCancelled ? styles.struck : null,
                    ]}
                    numberOfLines={1}>
                    {durationLine}
                </AppText>
            </View>

            {/* ── Right slot: status + drill-down affordance. Intrinsic width. ── */}
            <View style={styles.trailing}>
                <StatusBadge status={shift.status} />
                {showChevron ? (
                    <View style={styles.chevron}>
                        <AppIcon icon={ChevronRightGlyph} size="small" color="textMuted" />
                    </View>
                ) : null}
            </View>
        </Pressable>
    );
}

export const ShiftCard = memo(ShiftCardComponent);

const row: ViewStyle = {
    alignItems: 'center',
    flexDirection: 'row',
    // `minHeight` is applied inline, scaled by the OS text size (see the component
    // body). Keeping the *base* out of this static style is what stops the two from
    // silently disagreeing.
    padding: 16,
    width: '100%',
};

const styles = StyleSheet.create({
    row,
    times: {
        alignItems: 'flex-start',
        // The floor that fixes the "9:0…" bug: wide enough for a 12-hour time at
        // full size, and the column only shrinks below it as a last resort.
        minWidth: 92,
        flexShrink: 1,
    },
    startTime: {
        fontSize: 20,
        lineHeight: 24,
        fontWeight: '700',
        fontVariant: ['tabular-nums'],
    },
    details: {
        flex: 1,
        // See the component docblock: without this the middle refuses to
        // shrink and pushes the chevron off-screen instead of truncating.
        minWidth: 0,
        marginLeft: 16,
        gap: 2,
    },
    trailing: {
        alignItems: 'center',
        flexDirection: 'row',
        gap: 8,
        marginLeft: 12,
    },
    chevron: {
        // The glyph is decorative; the card is the touch target.
        pointerEvents: 'none',
    },
    struck: {
        // Cancelled shifts only: the duration is struck through so the row is
        // scannable as "did not happen" without the card being hidden.
        textDecorationLine: 'line-through',
    },
});

import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { AppIcon, ChevronRightGlyph } from '../../../components/AppIcon';
import { AppText } from '../../../components/AppText';
import { StatusBadge } from '../../../components/StatusBadge';
import { scaleRowHeight, useRowScale } from '../../../hooks';
import { spacing, useTheme } from '../../../theme';
import { formatDate, formatDuration, formatTime, shiftDurationMinutes } from '../../../utils/date';
import type { Shift } from '../../shifts/types';

/**
 * Fixed row height, in points.
 *
 * This constant is load-bearing: it is passed to the feed's `getItemLayout`
 * (V5), which lets the list compute scroll offsets without measuring a single
 * row. If the rendered row drifts from this number, scroll position and
 * `scrollToIndex` silently desync — so the row's content is clamped with
 * `numberOfLines` rather than allowed to grow.
 */
export const SHIFT_ROW_HEIGHT = 76;

type Props = {
    shift: Shift;
    onPress: (shiftId: number) => void;
    /** Render the date line. Hidden on Home "Today", where the header already says Today. */
    showDate?: boolean;
    /** Hide the drill-down chevron when the row is not navigable. */
    showChevron?: boolean;
};

/**
 * One shift row — the single row definition shared by the Home feed and the
 * Roster feed.
 *
 * ## The three-slot contract
 *
 * The brief specifies the row as Left / Centre / Right, and the slots have
 * different jobs, so they are built differently:
 *
 * | Slot | Content | Sizing |
 * |------|---------|--------|
 * | Left | start and end time | fixed `TIMES_WIDTH`, never shrinks |
 * | Centre | location + department | `flex: 1` and **`minWidth: 0`** |
 * | Right | status badge + chevron | intrinsic, never shrinks |
 *
 * The `minWidth: 0` on the centre is not optional. A flex child's default
 * `min-width` is `auto`, meaning it refuses to shrink below its content's
 * intrinsic width — so a long branch name would push the chevron off the right
 * edge of the screen instead of ellipsising. Zeroing the minimum is what turns
 * "overflow" into "truncate", which is the only acceptable failure mode in a
 * fixed-width list row.
 *
 * ## Why the chevron is inside the Pressable, not beside it
 *
 * The whole row is one touch target, so the chevron is a purely visual
 * affordance. It is rendered with no `accessibilityLabel` (making `AppIcon`
 * treat it as decorative) and `pointerEvents="none"` inside `AppIcon`, so a tap
 * on the chevron hits the row's `Pressable` rather than being swallowed by the
 * glyph (V9).
 *
 * ## Why `onPress` receives the id
 *
 * The row is memoised and rendered as a list item, so its `onPress` must not
 * close over a per-item arrow function created by the parent — that would be a
 * new function identity on every render and would discard the `memo`. The row
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

    const locationLine = shift.branch?.name ?? 'Unassigned branch';
    const departmentLine = [shift.department?.name, shift.position?.name]
        .filter(Boolean)
        .join(' · ');
    const notes = shift.notes?.trim() ? shift.notes.trim() : null;

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
                    backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.surface,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radius.md,
                    opacity: pressed ? 0.9 : 1,
                },
            ]}>
            {/* ── Left slot: the time bounds, bold. Fixed width, never shrinks. ── */}
            <View style={[styles.times, { gap: theme.spacing.xxs }]}>
                <AppText variant="time" numberOfLines={1}>
                    {formatTime(shift.start_time)}
                </AppText>
                <AppText variant="caption" color="textMuted" numberOfLines={1}>
                    {formatTime(shift.end_time)}
                </AppText>
            </View>

            {/* ── Centre slot: location + department. Flexes, truncates. ── */}
            <View style={[styles.details, { gap: theme.spacing.xxs }]}>
                <AppText variant="bodyStrong" numberOfLines={1}>
                    {locationLine}
                </AppText>

                {departmentLine ? (
                    <AppText variant="caption" color="textSecondary" numberOfLines={1}>
                        {departmentLine}
                    </AppText>
                ) : (
                    <AppText variant="caption" color="textMuted" numberOfLines={1}>
                        {formatDuration(minutes)}
                    </AppText>
                )}

                {showDate ? (
                    <AppText variant="caption" color="textMuted" numberOfLines={1}>
                        {formatDate(shift.date)} · {formatDuration(minutes)}
                    </AppText>
                ) : null}

                {notes ? (
                    <AppText variant="caption" color="textMuted" numberOfLines={1}>
                        {notes}
                    </AppText>
                ) : null}
            </View>

            {/* ── Right slot: status + drill-down affordance. Intrinsic width. ── */}
            <View style={[styles.trailing, { gap: theme.spacing.xs }]}>
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

/** Fixed so the centre slot's truncation point does not wander row to row. */
const TIMES_WIDTH = 56;

const row: ViewStyle = {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    // `minHeight` is applied inline, scaled by the OS text size (see the component
    // body). Keeping the *base* out of this static style is what stops the two from
    // silently disagreeing.
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    width: '100%',
};

const styles = StyleSheet.create({
    row,
    times: {
        alignItems: 'flex-start',
        width: TIMES_WIDTH,
    },
    details: {
        flex: 1,
        // See the component docblock: without this the centre refuses to
        // shrink and pushes the chevron off-screen instead of truncating.
        minWidth: 0,
    },
    trailing: {
        alignItems: 'flex-end',
    },
    chevron: {
        // The glyph is decorative; the row is the touch target.
        pointerEvents: 'none',
    },
});

import { StyleSheet, View } from 'react-native';

import { radiusRoles } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { useTheme } from '../../theme/useTheme';
import { SHIFT_ROW_HEIGHT } from '../ShiftCard';
import { SkeletonGroup, SkeletonRect } from './Skeleton';

/** Mirrors the `WeekDayStrip` cell height so the strip does not resize on load. */
const DAY_CELL_HEIGHT = 64;

/** Mirrors the `WeekDayStrip` cell radius (14) so the placeholder matches. */
const DAY_CELL_RADIUS = 14;

/**
 * Re-exported from [`ShiftCard`](src/components/ShiftCard/ShiftCard.tsx:1) rather
 * than redeclared: the skeleton exists to match the real row's height, so a second
 * literal here is a value that can silently drift from the card it is imitating.
 */
export { SHIFT_ROW_HEIGHT };

/**
 * Roster-specific skeleton compositions.
 *
 * These are separated from the generic `SkeletonScreen` compositions because
 * they must match *this* screen's geometry exactly. A roster skeleton built
 * from the generic `SkeletonCard` would have the wrong row height and the whole
 * list would jump the moment real data arrived — which is the one thing a
 * skeleton exists to prevent.
 *
 * The four pieces are independent so the screen can swap in exactly the region
 * that is reloading: a week change replaces the day strip and the rows but
 * leaves the week-navigation header live, because that header is still valid
 * and interactive during a fetch.
 */

/**
 * Seven compact day columns, mirroring [`WeekDayStrip`](../WeekDayStrip/WeekDayStrip.tsx:1).
 *
 * Plain `View`s in a row rather than a nested `FlatList`: this placeholder is
 * itself rendered on the loading path, and mounting a second virtualised list
 * to represent a list that has not loaded yet is cost with no benefit.
 *
 * Every column is rendered rather than an `Array.from(...).map` over a
 * *server* collection — this is a fixed literal count of seven, matching the
 * strip's own `DAYS_PER_WEEK`, so it is outside the scope of V1.
 */
export function SkeletonDayStrip(): React.JSX.Element {
    const theme = useTheme();

    return (
        <SkeletonGroup>
            <View
                style={styles.strip}
                accessibilityRole="progressbar"
                accessibilityLabel="Loading days"
                testID="skeleton-day-strip">
                {[0, 1, 2, 3, 4, 5, 6].map(index => (
                    <SkeletonRect
                        key={index}
                        height={DAY_CELL_HEIGHT}
                        radius={DAY_CELL_RADIUS}
                        style={styles.dayCell}
                    />
                ))}
            </View>
            {/* Spacer stands in for the strip's `useWindowDimensions` width and
                is intentionally collapsed; the `flex: 1` cells above divide
                whatever width the parent has, exactly as the real strip does. */}
            <View style={{ height: theme.spacing.xs }} />
        </SkeletonGroup>
    );
}

/**
 * One shift-row placeholder at the real `ShiftCard` height: a time block, two
 * text lines, and the chevron slot.
 */
export function SkeletonShiftCard(): React.JSX.Element {
    const theme = useTheme();

    return (
        <View style={[styles.shiftRow, { gap: spacing.md }]}>
            {/* Left slot — the time bounds column. */}
            <View style={[styles.times, { gap: spacing.xxs }]}>
                <SkeletonRect
                    width={44}
                    height={theme.typography.lineHeight.lg}
                    radius={radiusRoles.micro.sm}
                />
                <SkeletonRect
                    width={30}
                    height={theme.typography.lineHeight.sm}
                    radius={radiusRoles.micro.sm}
                />
            </View>

            {/* Centre slot — location + department. */}
            <View style={[styles.grow, { gap: spacing.xs }]}>
                <SkeletonRect
                    width="70%"
                    height={theme.typography.lineHeight.md}
                    radius={radiusRoles.micro.sm}
                />
                <SkeletonRect
                    width="45%"
                    height={theme.typography.lineHeight.sm}
                    radius={radiusRoles.micro.sm}
                />
            </View>
        </View>
    );
}

/**
 * A day divider plus its shift rows, mirroring one `RosterDayGroup` section.
 */
export function SkeletonRosterGroup({ rows = 2 }: { rows?: number }): React.JSX.Element {
    const theme = useTheme();

    return (
        <SkeletonGroup>
            <View
                style={{ gap: spacing.sm }}
                accessibilityRole="progressbar"
                accessibilityLabel="Loading shifts"
                testID="skeleton-roster-group">
                <SkeletonRect
                    width="40%"
                    height={theme.typography.lineHeight.md}
                    radius={radiusRoles.micro.sm}
                />
                {Array.from({ length: rows }).map((_, index) => (
                    <SkeletonShiftCard key={index} />
                ))}
            </View>
        </SkeletonGroup>
    );
}

/**
 * Full-screen roster skeleton — the **first mount** state only.
 *
 * Per the view-state table, a week *change* keeps the header and day strip
 * live (the user's context must not vanish mid-interaction), so this composite
 * is used exclusively when there is no previous week to fall back on.
 */
export function RosterSkeleton(): React.JSX.Element {
    return (
        <View style={[styles.screen, { gap: spacing.lg }]} testID="roster-skeleton">
            <SkeletonDayStrip />
            <SkeletonRosterGroup />
            <SkeletonRosterGroup />
        </View>
    );
}

const styles = StyleSheet.create({
    screen: {
        width: '100%',
    },
    strip: {
        flexDirection: 'row',
        // Matches the real strip's inter-cell gap so the placeholder does not
        // resize when the week loads.
        gap: 6,
        width: '100%',
    },
    dayCell: {
        flex: 1,
    },
    shiftRow: {
        alignItems: 'center',
        flexDirection: 'row',
        height: SHIFT_ROW_HEIGHT,
    },
    times: {
        alignItems: 'flex-start',
    },
    grow: {
        flex: 1,
        // Load-bearing: without `minWidth: 0` a flex child will not shrink
        // below its content, and the placeholder would force the row wider
        // than the real one.
        minWidth: 0,
    },
});

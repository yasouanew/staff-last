import { StyleSheet, View } from 'react-native';

import { radiusRoles } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { avatarSizes } from '../../theme/sizing';
import { useTheme } from '../../theme/useTheme';
import { AppCard } from '../AppCard/AppCard';
import { SkeletonCircle, SkeletonGroup, SkeletonPill, SkeletonRect, SkeletonText } from './Skeleton';

/**
 * Skeleton compositions that mirror real screen wireframes.
 *
 * Each composition is a geometric **no-op swap**: when data arrives it replaces
 * the skeleton and nothing moves, because the placeholders already occupy the
 * real elements' final coordinates. That is the whole point — a skeleton that
 * does not match its content's geometry just relocates the layout jump.
 *
 * Every composition is announced to assistive tech as a **single** loading
 * region (`accessibilityRole="progressbar"`), while the shapes themselves are
 * hidden, so a screen reader does not read thirty anonymous boxes.
 */

/**
 * One card-shaped placeholder, mirroring a shift/leave row inside an
 * [`AppCard`](../AppCard/AppCard.tsx:1): avatar, two text lines, and a badge.
 */
export function SkeletonCard(): React.JSX.Element {
    const theme = useTheme();

    return (
        <AppCard padded={false}>
            <View style={[styles.cardBody, { padding: spacing.md, gap: spacing.sm }]}>
                <View style={styles.row}>
                    <SkeletonCircle size={avatarSizes.md} />
                    <View style={[styles.grow, { gap: spacing.xs }]}>
                        {/* Title line at the real `subtitle` line height, then a
                            body line — matching a two-tier list row. */}
                        <SkeletonText lines={1} lineHeight={theme.typography.lineHeight.lg} style={styles.titleBar} />
                        <SkeletonRect width="45%" height={theme.typography.lineHeight.md} />
                    </View>
                    <SkeletonPill width={64} />
                </View>
            </View>
        </AppCard>
    );
}

/**
 * A list of card placeholders — the default state for Home, Leave and Roster
 * while their first page loads.
 */
export function SkeletonList({ count = 3, gap = spacing.sm }: { count?: number; gap?: number }): React.JSX.Element {
    return (
        <SkeletonGroup>
            <View
                style={{ gap }}
                accessibilityRole="progressbar"
                accessibilityLabel="Loading"
                testID="skeleton-list">
                {Array.from({ length: count }).map((_, index) => (
                    <SkeletonCard key={index} />
                ))}
            </View>
        </SkeletonGroup>
    );
}

/**
 * A single list-row placeholder, mirroring
 * [`AppListItem`](../AppListItem/AppListItem.tsx:1): square leading slot, one
 * full line, one short line.
 */
export function SkeletonRow(): React.JSX.Element {
    const theme = useTheme();

    return (
        <View style={[styles.row, { paddingVertical: spacing.sm }]}>
            <SkeletonRect width={spacing.xl} height={spacing.xl} radius={radiusRoles.micro.sm} />
            <View style={[styles.grow, { gap: spacing.xxs }]}>
                <SkeletonRect height={theme.typography.lineHeight.md} />
                <SkeletonRect width="50%" height={theme.typography.lineHeight.md} />
            </View>
        </View>
    );
}

/**
 * A header-shaped placeholder, mirroring the title block of
 * [`AppHeader`](../AppHeader/AppHeader.tsx:1): a title line plus an optional
 * supporting line.
 */
export function SkeletonHeader(): React.JSX.Element {
    const theme = useTheme();

    return (
        <SkeletonGroup>
            <View style={{ gap: spacing.xs }} accessibilityRole="progressbar" accessibilityLabel="Loading">
                <SkeletonRect width="55%" height={theme.typography.lineHeight.xl} />
                <SkeletonRect width="35%" height={theme.typography.lineHeight.sm} />
            </View>
        </SkeletonGroup>
    );
}

/**
 * The generic multi-row skeleton for a flat list screen.
 *
 * Composed from [`SkeletonRow`](#skeletonrow) rather than re-inventing it, so a
 * screen's skeleton state and its loaded state share one row geometry.
 */
export function SkeletonRows({ count = 6 }: { count?: number }): React.JSX.Element {
    return (
        <SkeletonGroup>
            <View accessibilityRole="progressbar" accessibilityLabel="Loading" testID="skeleton-rows">
                {Array.from({ length: count }).map((_, index) => (
                    <SkeletonRow key={index} />
                ))}
            </View>
        </SkeletonGroup>
    );
}

/**
 * A detail-screen placeholder: one large record block over a field matrix.
 *
 * Mirrors the first paint of Shift Detail and Leave Detail — a hero strip the
 * height of a status header, then a card of label/value rows. The hero bar is
 * `macro.lg`-radiused to match `StatusScaffold`'s own corner, so the swap to real
 * content is a no-op reposition rather than a visible reflow.
 */
export function SkeletonDetail(): React.JSX.Element {
    return (
        <SkeletonGroup>
            <View
                style={{ gap: spacing.lg }}
                accessibilityRole="progressbar"
                accessibilityLabel="Loading"
                testID="skeleton-detail">
                <SkeletonRect width="100%" height={140} radius={radiusRoles.macro.lg} />
                <AppCard>
                    <View>
                        {Array.from({ length: 4 }).map((_, index) => (
                            <SkeletonRow key={index} />
                        ))}
                    </View>
                </AppCard>
            </View>
        </SkeletonGroup>
    );
}

const styles = StyleSheet.create({
    cardBody: {
        width: '100%',
    },
    titleBar: {
        width: '70%',
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    grow: {
        flex: 1,
        // Keeps long placeholder bars from establishing a min-content width.
        minWidth: 0,
    },
});

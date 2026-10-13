import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pressable, RefreshControl, SectionList, StyleSheet, View } from 'react-native';

import { AppCard } from '../../../components/AppCard';
import { AppHeader } from '../../../components/AppHeader';
import { AppIcon, ChevronLeftGlyph, ChevronRightGlyph } from '../../../components/AppIcon';
import { AppText } from '../../../components/AppText';
import { EmptyState } from '../../../components/EmptyState';
import { ErrorView } from '../../../components/ErrorView';
import { ScreenContainer } from '../../../components/ScreenContainer';
import { RosterSkeleton, SkeletonRosterGroup } from '../../../components/Skeleton';
import type { WeekDay } from '../../../components/WeekDayStrip';
import { WeekDayStrip } from '../../../components/WeekDayStrip';
import type { RosterStackParamList } from '../../../navigation/types';
import { scaleRowHeight, useRowScale } from '../../../hooks';
import { lineHeight, spacing } from '../../../theme';
import { useTheme } from '../../../theme/useTheme';
import {
    formatDate,
    formatDayMonth,
    getDayOfMonth,
    getMonthShort,
    getWeekdayShort,
    isSameApiDate,
    todayApiDate,
} from '../../../utils/date';
import { isCompanyAccessLocked } from '../../../utils/errors';
import { ShiftCard, SHIFT_ROW_HEIGHT } from '../../../components/ShiftCard';
import { useMyRosterWeek } from '../hooks';

type Props = NativeStackScreenProps<RosterStackParamList, 'MyRoster'>;

/** The one global gutter, applied per element rather than by the container. */
const GUTTER = 20;

/** Gap between shift cards within a day group, per the 2026 spec. */
const CARD_GAP = spacing.sm;

export function MyRosterScreen({ navigation }: Props): React.JSX.Element {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const week = useMyRosterWeek();

    /*
     * `SectionList`'s `getItemLayout` is fed from `layoutIndex` below, whose offsets
     * must match the rendered row and group-header heights. The text-driven parts
     * grow with the OS text size, so they are scaled by the same factor the shared
     * `ShiftCard` uses — otherwise a large accessibility text setting silently
     * desyncs the scrollbar and `scrollToIndex`. The fixed margins are not scaled.
     */
    const scale = useRowScale();
    const scaledHeaderBlock =
        scaleRowHeight(GROUP_HEADER_TEXT_HEIGHT, scale) + GROUP_HEADER_MARGIN_TOP + GROUP_HEADER_MARGIN_BOTTOM;
    const scaledRowBlock = scaleRowHeight(SHIFT_ROW_HEIGHT, scale) + CARD_GAP;

    const openShift = useCallback(
        (shiftId: number): void => {
            navigation.navigate('ShiftDetail', { shiftId });
        },
        [navigation],
    );

    /**
     * The seven day cells, built once per week change.
     *
     * This relies on `useMyRosterWeek`'s `days` being memoised on the week: the
     * cells are compared by identity in `DayCell`'s `memo`, so rebuilding them on
     * every render (which an un-memoised `days` forced) re-rendered the whole
     * strip on unrelated state changes.
     */
    const dayCells = useMemo<WeekDay[]>(
        () =>
            week.days.map(date => ({
                date,
                weekday: getWeekdayShort(date),
                day: getDayOfMonth(date),
                month: getMonthShort(date),
                isToday: isSameApiDate(date, todayApiDate()),
            })),
        [week.days],
    );

    /**
     * `SectionList` sections, one per day that has shifts.
     *
     * The grouping is produced by
     * [`sectionizeShifts`](src/features/roster/utils/sectionizeShifts.ts:1) inside
     * the hook, so the ordering rule has a single definition. `sections` is empty
     * when there are no shifts, which the list renders as its `ListEmptyComponent`
     * rather than as an empty day group.
     */
    const sections = useMemo(
        () =>
            week.groups.map(group => ({
                date: group.date,
                title: formatDate(group.date, { withWeekday: true }),
                data: group.shifts,
            })),
        [week.groups],
    );

    /**
     * Flattened prefix sums for `getItemLayout`.
     *
     * A `SectionList`'s `getItemLayout` receives an index into the *flattened*
     * list — sections and their headers interleaved with rows — so the offsets
     * cannot be computed from a single row height. Precomputing the prefix
     * lengths once per week change keeps the lookup O(1) at scroll time instead
     * of re-walking the sections on every frame of a fling.
     */
    const layoutIndex = useMemo(() => {
        const map = new Map<number, { length: number; offset: number; index: number }>();
        let cursor = 0;
        let flat = 0;

        sections.forEach(section => {
            map.set(flat, { length: scaledHeaderBlock, offset: cursor, index: flat });
            cursor += scaledHeaderBlock;
            flat += 1;

            section.data.forEach(() => {
                map.set(flat, { length: scaledRowBlock, offset: cursor, index: flat });
                cursor += scaledRowBlock;
                flat += 1;
            });
        });

        return map;
    }, [sections, scaledHeaderBlock, scaledRowBlock]);

    const refreshControl = (
        <RefreshControl
            refreshing={week.isRefreshing}
            onRefresh={week.refresh}
            tintColor={theme.colors.primary}
        />
    );

    const weekLabel = `${formatDayMonth(week.weekStart)} – ${formatDayMonth(week.weekEnd)}`;

    // ── First mount: nothing to preserve, so the whole screen is a skeleton ──
    if (week.isLoading) {
        return (
            <ScreenContainer hasHeader>
                <AppHeader title="My Roster" subtitle={weekLabel} />
                <RosterSkeleton />
            </ScreenContainer>
        );
    }

    if (week.isError && isCompanyAccessLocked(week.error)) {
        return (
            <ScreenContainer hasHeader>
                <AppHeader title="My Roster" />
                <AppCard>
                    <View style={{ gap: theme.spacing.xs }}>
                        <AppText variant="subtitle">Access paused</AppText>
                        <AppText variant="body" color="textSecondary">
                            Your company's subscription needs attention. Ask your
                            administrator to restore access.
                        </AppText>
                    </View>
                </AppCard>
            </ScreenContainer>
        );
    }

    if (week.isError) {
        return (
            <ScreenContainer hasHeader>
                <AppHeader title="My Roster" />
                <ErrorView error={week.error} onRetry={week.refresh} />
            </ScreenContainer>
        );
    }

    if (week.employeeId === null) {
        return (
            <ScreenContainer hasHeader>
                <AppHeader title="My Roster" />
                <EmptyState
                    title="No employee profile"
                    description="Your account is not linked to an employee record yet, so there is no roster to show."
                />
            </ScreenContainer>
        );
    }

    /*
     * `hasHeader={false}`: this branch renders **no** `AppHeader` — the week
     * navigator is the screen's header and scrolls away with the content.
     *
     * `withGutter={false}`: the container's 16pt gutter is deliberately dropped so
     * each element owns the 20pt spec gutter itself. The previous build kept the
     * container gutter and cancelled it on the strip with a negative
     * `marginHorizontal`, which is exactly what clipped the selected day pill at
     * the left edge. With no negative margin anywhere, the clip cannot recur.
     *
     * `scrollable` stays false because the `SectionList` is the scroller and must
     * not be nested inside a `ScrollView`.
     */
    return (
        <ScreenContainer hasHeader={false} scrollable={false} withGutter={false}>
            <SectionList
                sections={sections}
                keyExtractor={shift => String(shift.id)}
                renderItem={({ item }) => (
                    <View style={styles.rowWrap}>
                        <ShiftCard shift={item} onPress={openShift} showDate={false} />
                    </View>
                )}
                renderSectionHeader={({ section }) => (
                    <DayGroupHeader title={section.title} count={section.data.length} />
                )}
                getItemLayout={(_, index) =>
                    layoutIndex.get(index) ?? {
                        length: scaledRowBlock,
                        offset: scaledRowBlock * index,
                        index,
                    }
                }
                /*
                 * Group headers are in-flow, not sticky: the spec gives them a
                 * `marginTop` of 24, and a sticky header cannot carry a top margin
                 * without exposing the row scrolling beneath it.
                 */
                stickySectionHeadersEnabled={false}
                initialNumToRender={12}
                maxToRenderPerBatch={10}
                windowSize={9}
                /*
                 * `removeClippedSubviews` is pinned off, matching `ScreenContainer`
                 * and `LeaveListScreen`. Android defaults it on, and it detaches
                 * off-screen children — which breaks the card shadows and any
                 * absolutely positioned overlay inside a row. The windowing below
                 * already bounds what is mounted.
                 */
                removeClippedSubviews={false}
                refreshControl={refreshControl}
                ListHeaderComponent={
                    <View>
                        <WeekNav
                            label={weekLabel}
                            onPrevious={week.goToPreviousWeek}
                            onNext={week.goToNextWeek}
                            onToday={week.goToToday}
                        />
                        <WeekDayStrip
                            days={dayCells}
                            selectedDate={week.selectedDate}
                            onSelect={week.selectDate}
                        />
                        <RosterSummary
                            publishedCount={week.publishedRosters.length}
                            totalShifts={week.totalShifts}
                            unavailable={week.rostersError !== null}
                        />
                    </View>
                }
                ListEmptyComponent={
                    // A week change keeps the header, nav and strip live and
                    // replaces only the feed region — the user's selected week
                    // must not vanish mid-interaction.
                    week.isRefreshing ? (
                        <View style={{ paddingTop: theme.spacing.md, paddingHorizontal: GUTTER }}>
                            <SkeletonRosterGroup />
                        </View>
                    ) : (
                        <View style={{ paddingHorizontal: GUTTER }}>
                            <EmptyState
                                title="No shifts this week"
                                description="Nothing is scheduled for the selected week. Try another week, or check back once the roster is published."
                            />
                        </View>
                    )
                }
                /*
                 * The list is the top-level view here, so it — not the container —
                 * owns the top safe-area inset. Applied as tail padding on the
                 * content container rather than as a `SafeAreaView`: the inset is
                 * then part of the scrollable area, so the nav row slides under the
                 * transparent status bar and leaves the viewport cleanly.
                 */
                contentContainerStyle={{
                    paddingTop: insets.top,
                    paddingBottom: theme.spacing.xxl,
                }}
                showsVerticalScrollIndicator={false}
            />
        </ScreenContainer>
    );
}

/**
 * Week navigator: prev / next chevrons flanking the centred range label.
 *
 * The range is the screen's title and the "Tap for this week" caption sits
 * beneath it, so the whole centre block is one touch target that jumps to the
 * current week. Each chevron is a 40×40 squircle on `surfaceMuted` with an 18pt
 * `inkPrimary` glyph, and each carries an explicit `accessibilityLabel` — an
 * unlabelled chevron announces nothing.
 */
function WeekNav({
    label,
    onPrevious,
    onNext,
    onToday,
}: {
    label: string;
    onPrevious: () => void;
    onNext: () => void;
    onToday: () => void;
}): React.JSX.Element {
    const theme = useTheme();

    return (
        <View style={[styles.weekNav, { marginHorizontal: GUTTER }]}>
            <NavButton label="Previous week" icon={ChevronLeftGlyph} onPress={onPrevious} />

            <Pressable
                onPress={onToday}
                accessibilityRole="button"
                accessibilityLabel="Jump to this week"
                style={styles.weekLabel}>
                <AppText variant="title" numberOfLines={1}>
                    {label}
                </AppText>
                <AppText variant="caption" style={{ color: theme.tokens.colors.inkTertiary }}>
                    Tap for this week
                </AppText>
            </Pressable>

            <NavButton label="Next week" icon={ChevronRightGlyph} onPress={onNext} />
        </View>
    );
}

function NavButton({
    label,
    icon,
    onPress,
}: {
    label: string;
    icon: typeof ChevronLeftGlyph;
    onPress: () => void;
}): React.JSX.Element {
    const theme = useTheme();

    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={label}
            style={({ pressed }) => [
                styles.navButton,
                {
                    backgroundColor: theme.tokens.colors.surfaceMuted,
                    opacity: pressed ? 0.7 : 1,
                },
            ]}>
            <AppIcon icon={icon} sizePoints={18} color="text" />
        </Pressable>
    );
}

/**
 * Day group header: the day label on the left, the shift count on the right.
 *
 * In-flow rather than sticky (see the list's `stickySectionHeadersEnabled`), so
 * it carries the spec's `marginTop` 24 / `marginBottom` 8 and the 20pt gutter.
 */
function DayGroupHeader({ title, count }: { title: string; count: number }): React.JSX.Element {
    const { colors } = useTheme().tokens;

    return (
        <View style={styles.groupHeader}>
            <AppText variant="heading" style={{ color: colors.inkPrimary }} numberOfLines={1}>
                {title}
            </AppText>
            <AppText variant="caption" style={{ color: colors.inkTertiary }} numberOfLines={1}>
                {count} shift{count === 1 ? '' : 's'}
            </AppText>
        </View>
    );
}

/**
 * Week summary banner: which published roster covers the selected week, plus a
 * total shift count.
 *
 * Three states, not two. The published-roster line comes from a *separate*
 * request from the shifts it summarises, so "none published" and "could not
 * check" are genuinely different answers — and rendering the second as the first
 * told the employee their roster was not published when the app had simply
 * failed to ask. `unavailable` carries that third state, and both lines move
 * together: the card never mixes a fact from the failed request with a fact from
 * the successful one, so it cannot imply the week is empty.
 */
function RosterSummary({
    publishedCount,
    totalShifts,
    unavailable,
}: {
    publishedCount: number;
    totalShifts: number;
    unavailable: boolean;
}): React.JSX.Element {
    const { colors, radius, shadows } = useTheme().tokens;

    return (
        <View
            style={[
                styles.summary,
                {
                    backgroundColor: colors.surface,
                    borderRadius: radius.rLg,
                    ...shadows.shadowCard,
                },
            ]}>
            <AppText variant="bodyStrong" style={{ color: colors.inkPrimary }} numberOfLines={1}>
                {unavailable
                    ? 'Roster status unavailable'
                    : publishedCount > 0
                        ? `${publishedCount} published roster${publishedCount === 1 ? '' : 's'}`
                        : 'No published roster yet'}
            </AppText>
            <AppText variant="caption" style={{ color: colors.inkSecondary }} numberOfLines={1}>
                {unavailable
                    ? 'Could not check for a published roster.'
                    : `${totalShifts} shift${totalShifts === 1 ? '' : 's'} in this week`}
            </AppText>
        </View>
    );
}

/**
 * *Derived*, not hand-tuned: `getItemLayout` is only an optimisation while it
 * agrees with what actually rendered, and a literal that drifts from the
 * stylesheet silently corrupts scroll position. The value mirrors the sum used
 * above, so changing a token changes the layout math with it.
 */
const GROUP_HEADER_TEXT_HEIGHT = lineHeight.heading; // 22
const GROUP_HEADER_MARGIN_TOP = spacing.xl; // 24
const GROUP_HEADER_MARGIN_BOTTOM = spacing.xs; // 8

const styles = StyleSheet.create({
    weekNav: {
        alignItems: 'center',
        flexDirection: 'row',
        gap: spacing.sm,
        marginBottom: spacing.sm,
    },
    navButton: {
        alignItems: 'center',
        // A 40×40 squircle, per the spec.
        borderRadius: 12,
        height: 40,
        justifyContent: 'center',
        width: 40,
    },
    weekLabel: {
        alignItems: 'center',
        flex: 1,
        justifyContent: 'center',
    },
    groupHeader: {
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: GROUP_HEADER_MARGIN_TOP,
        marginBottom: GROUP_HEADER_MARGIN_BOTTOM,
        paddingHorizontal: GUTTER,
    },
    rowWrap: {
        paddingHorizontal: GUTTER,
        paddingBottom: CARD_GAP,
    },
    summary: {
        marginHorizontal: GUTTER,
        marginVertical: spacing.md,
        padding: spacing.md,
        gap: spacing.xxs,
    },
});

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useMemo } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { AppCard } from '../../../components/AppCard';
import { AppIcon, ChevronRightGlyph } from '../../../components/AppIcon';
import { AppText } from '../../../components/AppText';
import { EmptyState } from '../../../components/EmptyState';
import { ErrorView } from '../../../components/ErrorView';
import { GreetingHeader } from '../../../components/GreetingHeader';
import { NotificationBell } from '../../../components/NotificationBell';
import { ScreenContainer } from '../../../components/ScreenContainer';
import { SummaryHeroCard } from '../../../components/SummaryHeroCard';
import type { HomeStackParamList } from '../../../navigation/types';
import { scaleRowHeight, useRowScale } from '../../../hooks';
import { componentRadius, lineHeight, radiusRoles, spacing, useTheme } from '../../../theme';
import { formatDate, formatDurationParts, formatTime } from '../../../utils/date';
import { isCompanyAccessLocked } from '../../../utils/errors';
import { useSessionStore } from '../../auth/store/sessionStore';
import { useLocalUnreadCount, useUnreadCount } from '../../notifications/hooks';
import type { Shift } from '../../shifts/types';
import { HomeSkeleton } from '../components/HomeSkeleton';
import { ShiftCard, SHIFT_ROW_HEIGHT } from '../components/ShiftCard';
import { useHomeDashboard } from '../hooks';

type Props = NativeStackScreenProps<HomeStackParamList, 'Home'>;

/**
 * One row of the Home feed.
 *
 * A **discriminated union** rather than a list of groups-each-containing-a-list.
 * The brief forbids nested mapping over server collections, and the shape that
 * violation takes is `groups.map(group => <>{group.shifts.map(...)}</>)` — a
 * nested un-virtualised loop whose outer body is not virtualised either. By
 * flattening sections and rows into a single `FeedRow[]`, one `FlatList`
 * renders both, every row is windowed, and `SectionList`'s extra machinery
 * (sticky headers) is not needed because these section titles should scroll
 * away with their content.
 */
type FeedRow =
    | { kind: 'section'; id: string; title: string; caption: string }
    | { kind: 'shift'; id: string; shift: Shift };

export function HomeScreen({ navigation }: Props): React.JSX.Element {
    const theme = useTheme();
    const firstName = useSessionStore(state => state.user?.name.split(' ')[0] ?? 'there');
    const dashboard = useHomeDashboard();

    /*
     * `getItemLayout` is only correct while the constants below match what actually
     * rendered. Both the section header's line height and a shift row's height grow
     * with the OS text size (the row's text is capped, but the *geometry* scales with
     * it — see `ShiftCard`), so the offsets fed to the list are scaled by the same
     * factor. Without this, a user with large accessibility text gets a scrollbar and
     * `scrollToIndex` that are quietly wrong.
     */
    const scale = useRowScale();
    const scaledSectionHeight = scaleRowHeight(SECTION_HEIGHT, scale);
    const scaledRowBlock = scaleRowHeight(SHIFT_ROW_HEIGHT, scale) + spacing.sm;

    /**
     * Unread count for the header bell.
     *
     * Same precedence as [`AppTabBar`](src/navigation/stacks/AppTabs.tsx:97): the
     * local inbox is authoritative because it stays correct with no network and
     * reflects a read the user just performed, while the server count only fills
     * the pre-hydration gap so the dot does not flicker off on launch.
     */
    const serverUnread = useUnreadCount();
    const localUnreadCount = useLocalUnreadCount();
    const unreadCount = localUnreadCount ?? serverUnread.data?.count ?? 0;

    const openNotifications = useCallback((): void => {
        navigation.navigate('Notifications');
    }, [navigation]);

    /**
     * Built once and threaded into every `GreetingHeader` below.
     *
     * Home renders its header from five mutually exclusive branches (loading,
     * locked, error, no-employee, empty) plus the populated `TodayHero`. Sharing
     * one node keeps the bell from silently disappearing in an edge state.
     */
    const notificationsBell = (
        <NotificationBell count={unreadCount} onPress={openNotifications} />
    );

    const goToRoster = useCallback((): void => {
        const parent = navigation.getParent();
        parent?.navigate('RosterTab' as never);
    }, [navigation]);

    const openShift = useCallback(
        (shiftId: number): void => {
            navigation.navigate('ShiftDetail', { shiftId });
        },
        [navigation],
    );

    /**
     * The hero's eyebrow: the full weekday and date.
     *
     * Derived from the same `dashboard.today` value the feed header used to
     * carry, but promoted out of the section row and into the greeting block —
     * "where am I in the week" belongs to the page hero, not to a list label.
     * Rendered at `overline` size, which uppercases, so it reads as a masthead
     * rule rather than a second heading.
     */
    const dayEyebrow = useMemo(
        () => formatDate(dashboard.today, { withWeekday: true }),
        [dashboard.today],
    );

    /**
     * Flatten today's shifts into the union feed.
     *
     * The array is small and bounded (`per_page=10`) but is still rendered by a
     * `FlatList` because it is a server collection (V1): the count is a server
     * decision, not a client one, and hard-coding an assumption that "today has
     * at most ten rows" is exactly the assumption that breaks on a double shift
     * plus a swap. Windowing also keeps the row identity work off the render
     * path once the list grows.
     */
    const feed = useMemo<FeedRow[]>(() => {
        const rows: FeedRow[] = [
            {
                kind: 'section',
                id: 'section-today',
                title: 'Today',
                caption: `${dashboard.todayShifts.length} scheduled`,
            },
        ];

        dashboard.todayShifts.forEach(shift => {
            rows.push({ kind: 'shift', id: `shift-${shift.id}`, shift });
        });

        return rows;
    }, [dashboard.todayShifts]);

    /**
     * Cumulative offsets for the feed, precomputed once per data change.
     *
     * The previous `getItemLayout` multiplied a single constant by the index,
     * which is only correct when *every* row is the same height — and this feed
     * mixes a section header with shift rows. The result was a silent scroll
     * desync the moment a header sat between rows. Accumulating here costs one
     * pass over a bounded array and makes the layout exact, so `getItemLayout`
     * stays a pure O(1) lookup on the scroll path.
     */
    const feedLayout = useMemo(() => {
        let offset = 0;

        return feed.map((row, index) => {
            const length = row.kind === 'section' ? scaledSectionHeight : scaledRowBlock;
            const entry = { index, length, offset };
            offset += length;

            return entry;
        });
    }, [feed, scaledSectionHeight, scaledRowBlock]);

    const refreshControl = (
        <RefreshControl
            refreshing={dashboard.isRefreshing}
            onRefresh={dashboard.refresh}
            tintColor={theme.colors.primary}
        />
    );

    // ── Loading: first mount only, never a re-fetch (V6) ─────────────────────
    if (dashboard.isLoading) {
        return (
            <ScreenContainer hasHeader>
                <GreetingHeader
                    eyebrow={dayEyebrow}
                    greeting={`Good morning, ${firstName}`}
                    subtitle="Here is your day at a glance"
                    action={notificationsBell}
                />
                <HomeSkeleton />
            </ScreenContainer>
        );
    }

    // ── Locked: the company's subscription lapsed — not the user's problem ──
    if (dashboard.isError && isCompanyAccessLocked(dashboard.error)) {
        return (
            <ScreenContainer hasHeader>
                <GreetingHeader
                    eyebrow={dayEyebrow}
                    greeting={`Good morning, ${firstName}`}
                    subtitle="Here is your day at a glance"
                    action={notificationsBell}
                />
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

    // ── Error: the primary source failed ────────────────────────────────────
    if (dashboard.isError) {
        return (
            <ScreenContainer hasHeader>
                <GreetingHeader
                    eyebrow={dayEyebrow}
                    greeting={`Good morning, ${firstName}`}
                    subtitle="Here is your day at a glance"
                    action={notificationsBell}
                />
                <ErrorView error={dashboard.error} onRetry={dashboard.refresh} />
            </ScreenContainer>
        );
    }

    // ── No linked employee record: cannot own shifts ────────────────────────
    if (dashboard.employeeId === null) {
        return (
            <ScreenContainer hasHeader>
                <GreetingHeader
                    eyebrow={dayEyebrow}
                    greeting={`Good morning, ${firstName}`}
                    subtitle="Here is your day at a glance"
                    action={notificationsBell}
                />
                <EmptyState
                    title="No employee profile"
                    description="Your account is not linked to an employee record yet, so there are no shifts to show."
                />
            </ScreenContainer>
        );
    }

    // ── Empty: loaded successfully, nothing scheduled ───────────────────────
    if (dashboard.isEmpty) {
        /*
         * The empty state is refreshable, unlike the four branches above it.
         *
         * "Nothing scheduled" is a *conclusion the user will want to re-check* —
         * a shift can be published while they are looking at it — so the pull
         * gesture must work here, not only on the populated feed. The loading,
         * locked, error and no-employee branches are deliberately left without
         * one: the first is transient, the error branch already offers an
         * explicit retry, and the other two are not states a refresh can change.
         */
        return (
            <ScreenContainer hasHeader refreshControl={refreshControl}>
                <GreetingHeader
                    eyebrow={dayEyebrow}
                    greeting={`Good morning, ${firstName}`}
                    subtitle="Here is your day at a glance"
                    action={notificationsBell}
                />
                <EmptyState
                    title="Nothing scheduled"
                    description="You have no shifts today or in the coming week."
                />
            </ScreenContainer>
        );
    }

    return (
        <ScreenContainer hasHeader={false} scrollable={false}>
            <FlatList
                data={feed}
                keyExtractor={row => row.id}
                renderItem={({ item }) =>
                    item.kind === 'section' ? (
                        <SectionHeader title={item.title} caption={item.caption} />
                    ) : (
                        <View style={styles.rowWrap}>
                            <ShiftCard shift={item.shift} onPress={openShift} showDate={false} />
                        </View>
                    )
                }
                // Rows are uniformly `SHIFT_ROW_HEIGHT` and headers are a fixed
                // block too, so the precomputed cumulative offsets let the list
                // answer scroll positions without measuring (V5).
                getItemLayout={(_, index) => feedLayout[index] ?? { index, length: 0, offset: 0 }}
                initialNumToRender={8}
                maxToRenderPerBatch={8}
                windowSize={7}
                removeClippedSubviews
                refreshControl={refreshControl}
                ListHeaderComponent={
                    <View style={{ gap: spacing.lg, paddingBottom: spacing.md }}>
                        <TodayHero
                            eyebrow={dayEyebrow}
                            greeting={`Good morning, ${firstName}`}
                            minutes={dashboard.todayMinutes}
                            shifts={dashboard.todayShifts}
                            action={notificationsBell}
                        />
                    </View>
                }
                ListFooterComponent={
                    <NextUpPreview
                        shift={dashboard.nextShift}
                        onPress={openShift}
                        onViewRoster={goToRoster}
                    />
                }
                contentContainerStyle={[
                    styles.content,
                    { paddingBottom: theme.spacing.xxl },
                ]}
                showsVerticalScrollIndicator={false}
            />
        </ScreenContainer>
    );
}

/**
 * The non-scrolling "Today" hero.
 *
 * Mounted as the list's `ListHeaderComponent` rather than pinned outside the
 * scroller. Pinning it would permanently consume roughly a third of a small
 * viewport and leave the shift list scrolling in a letterbox; as a header it is
 * visible on arrival and yields the screen once the user scrolls — the
 * behaviour the brief's "non-scrollable" means in practice, since the card
 * itself never scrolls internally.
 */
function TodayHero({
    eyebrow,
    greeting,
    minutes,
    shifts,
    action,
}: {
    /** Masthead rule above the greeting — the weekday and date. */
    eyebrow: string;
    greeting: string;
    minutes: number;
    shifts: Shift[];
    /** Trailing slot threaded from the screen — the notification bell. */
    action?: React.ReactNode;
}): React.JSX.Element {
    const { hours, minutes: remainder } = formatDurationParts(minutes);
    const activeShift = shifts[0];

    return (
        <View style={{ gap: spacing.lg }}>
            <GreetingHeader
                eyebrow={eyebrow}
                greeting={greeting}
                subtitle="Here is your day at a glance"
                action={action}
            />
            <SummaryHeroCard
                eyebrow="Worked today"
                hours={hours}
                minutes={remainder}
                status={activeShift?.status}
                statusLabel={activeShift ? 'Clocked in' : 'Not clocked in'}
                footnote={
                    shifts.length === 0
                        ? 'No shift scheduled today.'
                        : `${shifts.length} shift${shifts.length === 1 ? '' : 's'} scheduled.`
                }
            />
        </View>
    );
}

/**
 * A section title row inside the feed.
 *
 * Deliberately **left-weighted**: a short brand accent rule hangs beside the
 * heading so the eye is pulled to the section edge rather than to a centred
 * block. That asymmetry is what separates a modern dashboard section from a
 * plain list label, and it costs one 3pt view. The heading is set at
 * `headerMedium` — a full step above the row's own `subtitle` used elsewhere —
 * so "Today" reads as a region of the page, not as another row.
 */
function SectionHeader({ title, caption }: { title: string; caption: string }): React.JSX.Element {
    const theme = useTheme();

    return (
        <View style={styles.sectionHeader}>
            <View
                style={[
                    styles.sectionRule,
                    {
                        backgroundColor: theme.colors.primary,
                        borderRadius: radiusRoles.pill.full,
                    },
                ]}
            />
            <View style={styles.sectionText}>
                <AppText variant="headerMedium" numberOfLines={1} ellipsizeMode="tail">
                    {title}
                </AppText>
                <AppText variant="caption" color="textMuted" numberOfLines={1}>
                    {caption}
                </AppText>
            </View>
        </View>
    );
}

/**
 * The "Next up" low-elevation footer.
 *
 * Deliberately on `surfaceSunken` rather than as another elevated card: it is a
 * *preview* of context the user will act on later, not a row they can act on
 * now, and giving it card elevation would imply parity with today's shifts that
 * it does not have. The old hairline top rule is gone — a soft rounded panel
 * reads as a distinct region without needing a divider to announce it.
 */
function NextUpPreview({
    shift,
    onPress,
    onViewRoster,
}: {
    shift: Shift | null;
    onPress: (shiftId: number) => void;
    onViewRoster: () => void;
}): React.JSX.Element {
    const theme = useTheme();

    if (shift === null) {
        return (
            <View
                style={[
                    styles.nextUp,
                    {
                        backgroundColor: theme.colors.surfaceSunken,
                        borderRadius: componentRadius.section,
                        marginTop: spacing.xl,
                    },
                ]}>
                <AppText variant="overline" color="textMuted">
                    NEXT UP
                </AppText>
                <AppText variant="body" color="textSecondary">
                    No upcoming shifts this week.
                </AppText>
                <Pressable onPress={onViewRoster} accessibilityRole="button">
                    <AppText variant="bodyStrong" color="primary">
                        View full roster
                    </AppText>
                </Pressable>
            </View>
        );
    }

    return (
        <View
            style={[
                styles.nextUp,
                {
                    backgroundColor: theme.colors.surfaceSunken,
                    borderRadius: componentRadius.section,
                    marginTop: spacing.xl,
                },
            ]}>
            <View style={styles.nextUpHead}>
                <AppText variant="overline" color="textMuted">
                    NEXT UP
                </AppText>
                <Pressable onPress={onViewRoster} accessibilityRole="button">
                    <AppText variant="caption" color="primary">
                        Full roster
                    </AppText>
                </Pressable>
            </View>

            <Pressable
                onPress={() => onPress(shift.id)}
                accessibilityRole="button"
                accessibilityLabel={`Next shift ${formatDate(shift.date)}`}
                style={[styles.nextUpRow, { gap: spacing.sm }]}>
                <View style={{ flex: 1, gap: spacing.xxs }}>
                    <AppText variant="bodyStrong" numberOfLines={1}>
                        {formatDate(shift.date, { withWeekday: true })}
                    </AppText>
                    <AppText variant="caption" color="textSecondary" numberOfLines={1}>
                        {formatTime(shift.start_time)} – {formatTime(shift.end_time)} ·{' '}
                        {shift.branch?.name ?? 'Unassigned branch'}
                    </AppText>
                </View>
                <AppIcon icon={ChevronRightGlyph} size="small" color="textMuted" />
            </Pressable>
        </View>
    );
}

/**
 * Exact rendered height of a section header, derived from the tokens that build
 * it rather than hand-tuned.
 *
 * `getItemLayout` is only a win while it is *true*: a constant that drifts from
 * the rendered block silently corrupts scroll position and `scrollToIndex`. The
 * sum below is the same list of values the stylesheet uses — the two must be
 * changed together, which is why they sit next to each other.
 */
const SECTION_HEIGHT =
    spacing.md + lineHeight.xl + spacing.xxs + lineHeight.sm + spacing.sm;

const styles = StyleSheet.create({
    content: {
        paddingTop: 0,
    },
    rowWrap: {
        paddingBottom: spacing.sm,
    },
    sectionHeader: {
        alignItems: 'center',
        flexDirection: 'row',
        gap: spacing.sm,
        paddingBottom: spacing.sm,
        paddingTop: spacing.md,
    },
    /**
     * The accent rule. Fixed height so it aligns optically with the cap-height of
     * the heading beside it rather than with the heading's line box.
     */
    sectionRule: {
        height: 18,
        width: 3,
    },
    sectionText: {
        flex: 1,
        gap: spacing.xxs,
        // A flex child refuses to shrink below its intrinsic width by default,
        // which would push a long caption past the gutter instead of truncating.
        minWidth: 0,
    },
    nextUp: {
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.lg,
    },
    nextUpHead: {
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    nextUpRow: {
        alignItems: 'center',
        flexDirection: 'row',
        minHeight: 44,
    },
});

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { useCallback, useContext, useMemo } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppCard } from '../../../components/AppCard';
import { AppIcon, CalendarGlyph } from '../../../components/AppIcon';
import { AppText } from '../../../components/AppText';
import { BentoStatCard } from '../../../components/BentoStatCard';
import { EmptyState } from '../../../components/EmptyState';
import { ErrorView } from '../../../components/ErrorView';
import { NotificationBell } from '../../../components/NotificationBell';
import { ShiftCard } from '../../../components/ShiftCard';
import type { HomeStackParamList } from '../../../navigation/types';
import { useTheme } from '../../../theme';
import { formatDate, formatDurationParts, formatTime } from '../../../utils/date';
import { isCompanyAccessLocked } from '../../../utils/errors';
import { useSessionStore } from '../../auth/store/sessionStore';
import { useLocalUnreadCount, useUnreadCount } from '../../notifications/hooks';
import type { Shift } from '../../shifts/types';
import { HomeSkeleton } from '../components/HomeSkeleton';
import { useHomeDashboard } from '../hooks';

type Props = NativeStackScreenProps<HomeStackParamList, 'Home'>;

/**
 * The hero gradient, per scheme.
 *
 * A subtle vertical wash from a lifted brand blue into the brand anchor. The two
 * stops are the spec's literal values rather than the theme's diagonal
 * `gradients.primary` preset, because the hero is a *vertical* light-fall and the
 * preset travels corner-to-corner. Dark mode uses a deeper, less luminous pair so
 * the hero does not glare above the dark body it slides over.
 */
const HERO_GRADIENT_LIGHT: [string, string] = ['#2260C2', '#1B4FA0'];
const HERO_GRADIENT_DARK: [string, string] = ['#1E4E9E', '#142F5E'];

/**
 * Home dashboard (spec Screen 4).
 *
 * ## Structure
 *
 * The screen is a fixed **hero** above a scrolling **body**:
 *
 * ```
 *  ┌───────────────────────────┐
 *  │  hero (gradient, fixed)   │  ← owns the top inset, bleeds under the status bar
 *  ├───────────────────────────┤
 *  │  body (ScrollView)        │  ← marginTop -16, rounded top corners
 *  │   • Worked today (Bento)  │
 *  │   • Today section         │
 *  │   • shift cards           │
 *  │   • Next up               │
 *  └───────────────────────────┘
 * ```
 *
 * The body is pulled up 16pt and given 28pt top corners, so it reads as a raised
 * sheet sliding over the hero rather than as a second stacked block. That overlap
 * is the whole "layered depth" of the Bento layout, and it is why the hero is a
 * sibling of the scroller rather than its `ListHeaderComponent`.
 *
 * ## Why a ScrollView, not a FlatList
 *
 * The previous build virtualised the feed. The Bento layout is a small, bounded
 * composition — a stat tile, a section header, at most a handful of shift cards
 * (`per_page=10`) and a preview — so a plain `ScrollView` renders it in one pass
 * and removes the `getItemLayout` bookkeeping that only existed to keep a
 * virtualised list honest. The list is not a growing server collection here; it is
 * "today", which is bounded by definition.
 */
export function HomeScreen({ navigation }: Props): React.JSX.Element {
    const theme = useTheme();
    const firstName = useSessionStore(state => state.user?.name.split(' ')[0] ?? 'there');
    const dashboard = useHomeDashboard();

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
     * Rendered at micro size, which uppercases, so it reads as a masthead rule
     * rather than as a second heading.
     */
    const dayEyebrow = useMemo(
        () => formatDate(dashboard.today, { withWeekday: true }),
        [dashboard.today],
    );

    const greeting = `Good morning, ${firstName}`;

    /**
     * Built once and threaded into every branch below.
     *
     * Home renders its hero from five mutually exclusive branches (loading,
     * locked, error, no-employee, empty) plus the populated body. Sharing one node
     * keeps the bell from silently disappearing in an edge state.
     */
    const notificationsBell = (
        <NotificationBell count={unreadCount} onPress={openNotifications} />
    );

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
            <HomeShell dateLine={dayEyebrow} greeting={greeting} action={notificationsBell}>
                <HomeSkeleton />
            </HomeShell>
        );
    }

    // ── Locked: the company's subscription lapsed — not the user's problem ──
    if (dashboard.isError && isCompanyAccessLocked(dashboard.error)) {
        return (
            <HomeShell dateLine={dayEyebrow} greeting={greeting} action={notificationsBell}>
                <AppCard>
                    <View style={{ gap: theme.spacing.xs }}>
                        <AppText variant="subtitle">Access paused</AppText>
                        <AppText variant="body" color="textSecondary">
                            Your company's subscription needs attention. Ask your
                            administrator to restore access.
                        </AppText>
                    </View>
                </AppCard>
            </HomeShell>
        );
    }

    // ── Error: the primary source failed ────────────────────────────────────
    if (dashboard.isError) {
        return (
            <HomeShell dateLine={dayEyebrow} greeting={greeting} action={notificationsBell}>
                <ErrorView error={dashboard.error} onRetry={dashboard.refresh} />
            </HomeShell>
        );
    }

    // ── No linked employee record: cannot own shifts ────────────────────────
    if (dashboard.employeeId === null) {
        return (
            <HomeShell dateLine={dayEyebrow} greeting={greeting} action={notificationsBell}>
                <EmptyState
                    title="No employee profile"
                    description="Your account is not linked to an employee record yet, so there are no shifts to show."
                />
            </HomeShell>
        );
    }

    // ── Empty: loaded successfully, nothing scheduled ───────────────────────
    if (dashboard.isEmpty) {
        /*
         * The empty state is refreshable, unlike the four branches above it.
         *
         * "Nothing scheduled" is a *conclusion the user will want to re-check* — a
         * shift can be published while they are looking at it — so the pull gesture
         * must work here, not only on the populated body.
         */
        return (
            <HomeShell
                dateLine={dayEyebrow}
                greeting={greeting}
                action={notificationsBell}
                refreshControl={refreshControl}>
                <EmptyState
                    title="Nothing scheduled"
                    description="You have no shifts today or in the coming week."
                />
            </HomeShell>
        );
    }

    const { hours } = formatDurationParts(dashboard.todayMinutes);
    const activeShift = dashboard.todayShifts[0];
    const shiftCount = dashboard.todayShifts.length;

    return (
        <HomeShell
            dateLine={dayEyebrow}
            greeting={greeting}
            action={notificationsBell}
            refreshControl={refreshControl}>
            <BentoStatCard
                label="Worked today"
                hours={hours}
                status={activeShift ? activeShift.status : 'inactive'}
                statusLabel={activeShift ? 'Clocked in' : 'Not clocked in'}
                subtext={`${shiftCount} shift${shiftCount === 1 ? '' : 's'} scheduled.`}
            />

            <SectionHeader title="Today" caption={`${shiftCount} scheduled`} />

            <View style={styles.shiftList}>
                {dashboard.todayShifts.map(shift => (
                    <ShiftCard key={shift.id} shift={shift} onPress={openShift} showDate={false} />
                ))}
            </View>

            <NextUpCard
                shift={dashboard.nextShift}
                onPress={openShift}
                onViewRoster={goToRoster}
            />
        </HomeShell>
    );
}

/**
 * The fixed gradient hero.
 *
 * Owns the **top** inset: the fill runs behind the status bar/notch rather than
 * starting below it, which is what makes it read as a hero instead of a coloured
 * box. A screen that mounts it must not also apply `insets.top`.
 */
function HomeHero({
    dateLine,
    greeting,
    action,
}: {
    /** Masthead rule above the greeting — the weekday and date. */
    dateLine: string;
    greeting: string;
    /** Trailing slot — the notification bell. */
    action?: React.ReactNode;
}): React.JSX.Element {
    const insets = useSafeAreaInsets();
    const theme = useTheme();

    return (
        <LinearGradient
            colors={theme.isDark ? HERO_GRADIENT_DARK : HERO_GRADIENT_LIGHT}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={[styles.hero, { paddingTop: insets.top + 20 }]}>
            <View style={styles.heroTopRow}>
                <AppText style={styles.heroDate} numberOfLines={1}>
                    {dateLine}
                </AppText>
                {action}
            </View>

            <AppText style={styles.heroGreeting} numberOfLines={2} ellipsizeMode="tail">
                {greeting}
            </AppText>

            <AppText style={styles.heroSubline}>Here is your day at a glance</AppText>
        </LinearGradient>
    );
}

/**
 * Hero + overlapping body shell.
 *
 * The body is a `ScrollView` pulled up 16pt with 28pt top corners, so it slides
 * over the hero's lower edge. Its bottom padding reserves the tab bar's measured
 * height plus the home-indicator inset, so the last card is never trapped behind
 * the bar.
 */
function HomeShell({
    dateLine,
    greeting,
    action,
    refreshControl,
    children,
}: {
    dateLine: string;
    greeting: string;
    action?: React.ReactNode;
    refreshControl?: React.ReactElement;
    children: React.ReactNode;
}): React.JSX.Element {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
    const surfaceRaised = theme.tokens.colors.surfaceRaised;

    return (
        <View style={[styles.root, { backgroundColor: surfaceRaised }]}>
            <HomeHero dateLine={dateLine} greeting={greeting} action={action} />

            <ScrollView
                style={[styles.body, { backgroundColor: surfaceRaised }]}
                contentContainerStyle={[
                    styles.bodyContent,
                    { paddingBottom: insets.bottom + 24 + tabBarHeight },
                ]}
                refreshControl={refreshControl}
                showsVerticalScrollIndicator={false}>
                {children}
            </ScrollView>
        </View>
    );
}

/**
 * A section title row inside the body.
 *
 * Left-weighted: the label leads and the count is right-aligned in the tertiary
 * ink tier, so the row reads as a region header rather than as another card.
 */
function SectionHeader({ title, caption }: { title: string; caption: string }): React.JSX.Element {
    const { colors } = useTheme().tokens;

    return (
        <View style={styles.sectionHeader}>
            <AppText variant="title" style={{ color: colors.inkPrimary }} numberOfLines={1}>
                {title}
            </AppText>
            <AppText variant="caption" style={{ color: colors.inkTertiary }} numberOfLines={1}>
                {caption}
            </AppText>
        </View>
    );
}

/**
 * The "Next up" module.
 *
 * A proper card on `surfaceMuted` rather than a bare grey strip: it is a
 * *preview* of context the user will act on later, so it gets a real surface and
 * a real header row, but a muted fill rather than card elevation — it must not
 * imply parity with today's shifts.
 */
function NextUpCard({
    shift,
    onPress,
    onViewRoster,
}: {
    shift: Shift | null;
    onPress: (shiftId: number) => void;
    onViewRoster: () => void;
}): React.JSX.Element {
    const { colors, radius } = useTheme().tokens;

    return (
        <View
            style={[
                styles.nextUp,
                { backgroundColor: colors.surfaceMuted, borderRadius: radius.rLg },
            ]}>
            <View style={styles.nextUpHead}>
                <AppText variant="micro" style={{ color: colors.inkTertiary }}>
                    NEXT UP
                </AppText>
                <Pressable onPress={onViewRoster} accessibilityRole="button">
                    <AppText variant="bodyStrong" style={{ color: colors.primary }}>
                        Full roster
                    </AppText>
                </Pressable>
            </View>

            {shift === null ? (
                <View style={styles.nextUpEmpty}>
                    <AppIcon icon={CalendarGlyph} size="medium" color="textMuted" />
                    <AppText variant="body" style={{ color: colors.inkSecondary }}>
                        No upcoming shifts this week.
                    </AppText>
                </View>
            ) : (
                <Pressable
                    onPress={() => onPress(shift.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Next shift ${formatDate(shift.date)}`}
                    style={styles.nextUpRow}>
                    <View style={styles.nextUpText}>
                        <AppText
                            variant="bodyStrong"
                            style={{ color: colors.inkPrimary }}
                            numberOfLines={1}>
                            {formatDate(shift.date, { withWeekday: true })}
                        </AppText>
                        <AppText
                            variant="body"
                            style={{ color: colors.inkSecondary }}
                            numberOfLines={1}>
                            {formatTime(shift.start_time)} – {formatTime(shift.end_time)} ·{' '}
                            {shift.branch?.name ?? 'Unassigned branch'}
                        </AppText>
                    </View>
                </Pressable>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
    },
    hero: {
        // Full-bleed: the gradient runs edge to edge and under the status bar.
        paddingHorizontal: 20,
        paddingBottom: 28,
        // Rounded lower edge so the hero reads as a surface the body slides over.
        borderBottomLeftRadius: 28,
        borderBottomRightRadius: 28,
    },
    heroTopRow: {
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    heroDate: {
        fontSize: 11,
        lineHeight: 14,
        fontWeight: '600',
        letterSpacing: 0.8,
        textTransform: 'uppercase',
        color: 'rgba(255, 255, 255, 0.75)',
    },
    heroGreeting: {
        fontSize: 28,
        lineHeight: 34,
        fontWeight: '700',
        color: '#FFFFFF',
        marginTop: 8,
    },
    heroSubline: {
        fontSize: 15,
        lineHeight: 22,
        fontWeight: '400',
        color: 'rgba(255, 255, 255, 0.85)',
        marginTop: 4,
    },
    body: {
        flex: 1,
        // Pull the body up over the hero's lower edge for the layered overlap.
        marginTop: -16,
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
    },
    bodyContent: {
        paddingHorizontal: 20,
        paddingTop: 20,
    },
    shiftList: {
        gap: 12,
    },
    sectionHeader: {
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 28,
        marginBottom: 12,
    },
    nextUp: {
        gap: 12,
        marginTop: 28,
        padding: 16,
    },
    nextUpHead: {
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    nextUpEmpty: {
        alignItems: 'center',
        gap: 8,
        paddingVertical: 8,
    },
    nextUpRow: {
        minHeight: 44,
        justifyContent: 'center',
    },
    nextUpText: {
        gap: 2,
    },
});

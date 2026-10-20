import { NavigationContext, useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { useCallback, useContext, useMemo } from 'react';
import { Pressable, RefreshControl, ScrollView, StatusBar, StyleSheet, View } from 'react-native';
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
 * Gap between the status bar and the hero's first row, in points.
 *
 * Matches the `spacing.sm` (12) breathing room
 * [`AppHeader`](src/components/AppHeader/AppHeader.tsx:34) gives its content row
 * below `insets.top`, so Home's masthead sits at the same optical height as every
 * other screen's title. It is intentionally *not* a larger number: the hero's
 * first row is a 40pt bell alongside an 11pt date, both vertical-centre aligned,
 * so a bigger offset reads as a dead band rather than as padding.
 */
const HERO_TOP_GAP = 12;

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
 *  │  body (ScrollView)        │  ← marginTop -16, square top corners
 *  │   • Worked today (Bento)  │
 *  │   • Today section         │
 *  │   • shift cards           │
 *  │   • Next up               │
 *  └───────────────────────────┘
 * ```
 *
 * The body is pulled up 16pt and its **top** corners are square, so it tucks
 * *underneath* the hero's rounded lower edge rather than in front of it. The
 * visible curve therefore belongs entirely to the hero, and the hero's own top
 * edge stays flush with the physical display edge. Rounding the body's top
 * corners as well — the earlier treatment — draws two curves that meet with a
 * sliver of canvas between them, which is what read as a "floating card" on iOS.
 *
 * The hero is a sibling of the scroller rather than its `ListHeaderComponent`
 * because it must be pinned: only a sibling can sit above the scrolling body
 * while the body slides beneath its lower edge.
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
 * The status-bar treatment this screen requires.
 *
 * The hero is brand blue in **both** schemes, so the glyphs drawn over it must be
 * light regardless of the app's appearance. The app-level
 * [`ThemedStatusBar`](App.tsx:98) derives its style from `theme.isDark`, which is
 * right for white/charcoal screens but paints *dark* glyphs over this hero in
 * light mode — the illegible pairing this screen used to have.
 *
 * ## Why this is focus-gated rather than simply mounted
 *
 * React Native resolves overlapping `<StatusBar>` components by mount order, and a
 * bottom-tab navigator keeps every visited tab **mounted** after the first visit.
 * An unconditionally rendered bar here would therefore keep forcing white glyphs
 * on the Roster, Leave and Account tabs — all of which are light-surfaced — as soon
 * as the user had opened Home once. Gating on `useIsFocused` mounts the bar only
 * while this route is the active one; leaving Home unmounts it and React Native
 * falls back to the app-level bar, which derives from the scheme again.
 *
 * `animated` keeps the flip from stepping, and `backgroundColor` is omitted
 * because RN 0.87 is edge-to-edge — the hero's own gradient is what shows behind
 * the bar. Android's bar is transparent and edge-to-edge too, so `light-content`
 * is equally correct there and keeps the two platforms identical.
 */

/**
 * The focused half of [`HeroStatusBar`](src/features/home/screens/HomeScreen.tsx:1).
 *
 * Split into its own component so `useIsFocused` is only ever *called* where a
 * navigator exists — branching around a hook inside one component would break the
 * Rules of Hooks.
 */
function FocusedStatusBar(): React.JSX.Element | null {
    const isFocused = useIsFocused();

    return isFocused ? <StatusBar barStyle="light-content" animated /> : null;
}

/**
 * Pins the status bar to `light-content` while Home is the active route.
 *
 * Mounts the bar only when the hero is actually on screen, so the other tabs keep
 * the app-level, scheme-derived bar — see the note above on why an unconditional
 * mount is wrong in a tab navigator.
 */
function HeroStatusBar(): React.JSX.Element | null {
    /*
     * `useIsFocused` reads `NavigationContext` and throws when it is absent, so the
     * context is consulted *before* the hook is reached. No navigator means this
     * component was mounted in isolation (a preview or a unit mount), where the
     * screen is by definition the only surface on display.
     */
    const hasNavigator = useContext(NavigationContext) !== undefined;

    if (!hasNavigator) {
        return <StatusBar barStyle="light-content" animated />;
    }

    return <FocusedStatusBar />;
}

/**
 * The fixed gradient hero.
 *
 * Owns the **top** inset: the fill runs behind the status bar/notch rather than
 * starting below it, which is what makes it read as a hero instead of a coloured
 * box. A screen that mounts it must not also apply `insets.top`.
 *
 * ## Geometry
 *
 * ```
 * ┌─────────────────────────────┐  ← physical top edge of the display
 * │  (status bar / notch / DI)  │     gradient paints behind it
 * │  DATE                    (bell)
 * │  Good morning, Alex
 * │  Here is your day at a glance
 * ╰─────────────────────────────╯  ← only the *bottom* corners are rounded
 * ```
 *
 * Two rules make this work on iOS and must not be relaxed:
 *
 * 1. **No top radius.** `borderTopLeftRadius`/`borderTopRightRadius` are never set
 *    here. Before they were introduced indirectly by the body's rounded sheet,
 *    the pairing of two curves left a white sliver at the very top of the screen
 *    on notched devices, which is the "floating card" artefact. The hero is a
 *    full-bleed surface; only its lower edge is a curve.
 * 2. **`insets.top` is padding, not margin.** The gradient's own box starts at
 *    y=0 and the inset is added to its top padding, so date and bell clear the
 *    Dynamic Island while the fill still spans the whole bar. Using a margin (or
 *    a sibling spacer) would leave the canvas visible above the gradient.
 *
 * Inside a bottom-tab stack the screen area already starts at the display edge,
 * so `insets.top` is the *real* status-bar height (~59pt on a Dynamic Island
 * iPhone, 24pt on Android). On devices without a notch it is 0 and the 20pt
 * content offset below is all the header needs.
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
        <>
            {/*
             * Scoped to this screen: mounted with the hero, released with it. The
             * app-level bar resumes the moment the user leaves Home.
             */}
            <HeroStatusBar />

            <LinearGradient
                colors={theme.isDark ? HERO_GRADIENT_DARK : HERO_GRADIENT_LIGHT}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                /*
                 * Edge to edge: y=0 is the physical top of the display, and the
                 * inset pushes only the *content* down — never the fill.
                 *
                 * The `+ HERO_TOP_GAP` is the single content offset below the
                 * status bar, matching the `insets.top + spacing.sm` contract in
                 * [`AppHeader`](src/components/AppHeader/AppHeader.tsx:34). This is
                 * the **only** place the inset is consumed on this screen; see the
                 * note on `HomeShell` about the automatic content inset.
                 */
                style={[styles.hero, { paddingTop: insets.top + HERO_TOP_GAP }]}>
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
        </>
    );
}

/**
 * Hero + overlapping body shell.
 *
 * The body is a `ScrollView` pulled up 16pt so it slides *under* the hero's
 * rounded lower edge. Its top corners are square on purpose — see
 * [`HomeHero`](src/features/home/screens/HomeScreen.tsx:1) for why two rounded
 * edges meeting is what produced the floating-card look on iOS.
 *
 * All top-edge geometry lives in the hero. This shell applies **no** top inset of
 * its own: the hero owns it, and repeating it here would push the date line down
 * by a second status-bar height.
 *
 * Its bottom padding reserves the tab bar's measured height plus the
 * home-indicator inset, so the last card is never trapped behind the bar.
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
                /*
                 * Suppress iOS's automatic content inset.
                 *
                 * This is the defect this screen shipped with. `HomeShell` is a
                 * plain `View` directly under the native-stack screen container, and
                 * that container's scroll view applies `contentInsetAdjustmentBehavior
                 * = automatic` on iOS — silently adding `insets.top` to the content
                 * on top of the hero's own `insets.top` padding. The visible result
                 * was an empty band *above* the date line and the bell pushed toward
                 * the header's lower edge, while Android (which has no such
                 * automatic adjustment) rendered correctly.
                 *
                 * The working screens escaped it by accident of construction:
                 * [`ScreenContainer`](src/components/ScreenContainer/ScreenContainer.tsx:195)
                 * passes `contentInset`, which on iOS disables the automatic
                 * adjustment, and its non-scrollable path supplies `paddingTop`
                 * explicitly. The hero follows that contract — it is the one and only
                 * inset consumer here — so the scroller must not add a second.
                 *
                 * `bottom` is still set explicitly to the tab-bar reservation the
                 * content container already carries, so the inset dictionary is
                 * well-formed on both platforms.
                 */
                contentInset={{ bottom: 0, left: 0, right: 0, top: 0 }}
                scrollIndicatorInsets={{ bottom: 0 }}
                automaticallyAdjustContentInsets={false}
                contentInsetAdjustmentBehavior="never"
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
        /*
         * A flex root under an iOS native-stack screen sizes itself from the
         * *container* width/height, which is not necessarily the screen dimensions.
         * Claiming the full width and pinning both x=0 and y=0 removes the horizontal
         * and vertical offsets the iOS native-stack container can silently apply.
         *
         * `left: 0` + `width: '100%'` fix the horizontal axis (the original fix).
         * `top: 0` fixes the vertical axis: without it the iOS screen container can
         * shift the hero down, leaving a gap between the physical top edge and the
         * gradient — the white/grey band visible in the screenshot. Android never
         * shows this because its edge-to-edge mode does not add such offsets.
         */
        width: '100%',
        left: 0,
        top: 0,
    },
    hero: {
        /*
         * Full-bleed on all four sides.
         *
         * `paddingTop` is applied inline from `insets.top` (see `HomeHero`), so the
         * gradient's own box starts at y=0 and paints behind the status bar /
         * Dynamic Island. Nothing may be added above it in the tree — a sibling
         * spacer, a parent `SafeAreaView`, or a top margin on `root` would each
         * leave the canvas visible as the white band this screen used to show.
         */
        // Stretch rather than measure: the gradient must span the full root width
        // with no horizontal margin of its own. The gutter lives in
        // `paddingHorizontal`, which paints *inside* the fill.
        alignSelf: 'stretch',
        width: '100%',
        marginHorizontal: 0,
        paddingHorizontal: 20,
        paddingBottom: 28,
        /*
         * Rounded **lower** edge only, so the hero reads as a surface the body
         * slides over. The top corners are deliberately never rounded: a radius at
         * the top would lift the fill off the display edge and reintroduce the
         * floating-card look on notched iPhones.
         */
        borderBottomLeftRadius: 28,
        borderBottomRightRadius: 28,
        // No `borderTop*Radius` — see above.
    },
    heroTopRow: {
        width: '100%',
        // The bell must never be pushed outside the hero. The row is a single
        // line, so the date yields space (`heroDate` flexes) rather than the
        // trailing control being clipped or wrapped off the right edge.
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    heroDate: {
        // Absorbs the leftover width and may shrink below its content width so a
        // long weekday+date string truncates with `numberOfLines={1}` instead of
        // displacing the bell past the right gutter.
        flex: 1,
        minWidth: 0,
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
        // Pull the body up under the hero's lower edge for the layered overlap.
        marginTop: -16,
        /*
         * Square top corners.
         *
         * The body tucks *behind* the hero rather than in front of it, so the only
         * curve at the seam is the hero's 28pt lower edge. Rounding both surfaces
         * produced two arcs meeting over a hairline of canvas — the "card floating
         * below the status bar" artefact on iOS. Keeping this square also lets the
         * body's own fill run flush to the hero, so a sub-pixel gap during a push
         * transition shows `surfaceRaised` rather than the raw window background.
         */
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

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View, type ListRenderItemInfo } from 'react-native';

import { AppHeader } from '../../../components/AppHeader';
import { AppIcon } from '../../../components/AppIcon';
import { CalendarOffGlyph, SunGlyph } from '../../../components/AppIcon/glyphs';
import { AppText } from '../../../components/AppText';
import { ErrorView } from '../../../components/ErrorView';
import { FilterChip } from '../../../components/FilterChip';
import { FloatingActionButton } from '../../../components/FloatingActionButton';
import { SkeletonList } from '../../../components/Skeleton';
import { ScreenContainer } from '../../../components/ScreenContainer';
import { StatusBadge } from '../../../components/StatusBadge';
import type { LeaveStackParamList } from '../../../navigation/types';
import { useTheme } from '../../../theme/useTheme';
import type { LeaveRequestStatus } from '../../../types/api';
import { formatDate } from '../../../utils/date';
import { useLeaveRequests } from '../hooks';
import type { LeaveRequest } from '../types';
import { dayPartLabel, decisionDate, formatLeaveRange, formatTotalDays } from '../utils/leaveRequest';

type Props = NativeStackScreenProps<LeaveStackParamList, 'LeaveList'>;

type FilterKey = LeaveRequestStatus | 'all';

/**
 * Filters offered above the feed. `all` maps to "no filter" rather than a status,
 * because the API treats an absent `status` as "every status" — inventing an `all`
 * value would send an invalid enum and return a 422.
 */
const FILTERS: readonly { key: FilterKey; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'pending', label: 'Pending' },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' },
];

const PAGE_SIZE = 20;

/** The spec's 14pt sun prefix on the day-part row. */
const DAY_PART_ICON_SIZE = 14;

/**
 * My Leave (spec Screen 8).
 *
 * `GET /leave-requests` is auto-scoped to the token's employee (spec §0.5), so no
 * `employee_id` is passed anywhere in this screen — see
 * [`useLeaveRequests`](src/features/leave/hooks/useLeaveRequests.ts:1).
 *
 * There is no balance endpoint — only `total_days` per request is shown, never an
 * authoritative balance (spec Screen 8 §5). There is no cancel action (gap G6), which
 * is why nothing in this feed offers one.
 *
 * ## Card shape
 *
 * Each request is a flat card (no status accent strip — status is carried by the
 * shared [`StatusBadge`](src/components/StatusBadge/StatusBadge.tsx:1) alone) with
 * three rows: type + status, the full date range + decision date, and the day-part.
 * The date range is collapsed by
 * [`formatLeaveRange`](src/features/leave/utils/leaveRequest.ts:1) so a single-day
 * request no longer renders the same date twice and truncates.
 */
export function LeaveListScreen({ navigation }: Props): React.JSX.Element {
    const theme = useTheme();
    const [status, setStatus] = useState<FilterKey>('all');
    const [page, setPage] = useState(1);
    const [allItems, setAllItems] = useState<LeaveRequest[]>([]);

    const listParams = useMemo(
        () => ({
            status: status === 'all' ? undefined : status,
            per_page: PAGE_SIZE,
            page,
        }),
        [status, page],
    );
    const query = useLeaveRequests(listParams);
    const pendingQuery = useLeaveRequests({ status: 'pending', per_page: 1, page: 1 });

    // Refetch when the screen regains focus — e.g. after the create modal closes —
    // so a newly submitted request appears without a manual pull-to-refresh. The
    // initial focus is skipped because the mount already fetches; only a *return*
    // to the screen needs a refresh.
    useEffect(() => {
        const unsubscribe = navigation.addListener('focus', () => {
            if (query.isPending) {
                return;
            }

            void query.refetch();
            void pendingQuery.refetch();
        });

        return unsubscribe;
        // `query` / `pendingQuery` are the hook results from `useLeaveRequests`; the
        // listener reads `.isPending` and `.refetch` from them. Depending on the whole
        // objects (rather than destructured members) is what the exhaustive-deps rule
        // expects and keeps the closure in sync with the latest render.
    }, [navigation, query, pendingQuery]);

    // Reset accumulation when the filter changes.
    useEffect(() => {
        setPage(1);
        setAllItems([]);
    }, [status]);

    // Accumulate pages for infinite scroll, deduped by id.
    useEffect(() => {
        const fresh = query.data?.data;

        if (!fresh) {
            return;
        }

        setAllItems(previous => {
            if (page === 1) {
                return fresh;
            }

            const seen = new Set(previous.map(item => item.id));
            const appended = fresh.filter(item => !seen.has(item.id));

            return [...previous, ...appended];
        });
    }, [query.data, page]);

    const pendingTotal = pendingQuery.data?.meta.total ?? 0;
    const hasMore = query.data ? query.data.meta.current_page < query.data.meta.last_page : false;

    const handleRefresh = (): void => {
        setPage(1);
        void query.refetch();
        void pendingQuery.refetch();
    };

    const handleEndReached = (): void => {
        if (hasMore && !query.isFetching && !query.isPending) {
            setPage(current => current + 1);
        }
    };

    const handleOpenRequest = useCallback(
        (leaveRequestId: number): void => {
            navigation.navigate('LeaveDetail', { leaveRequestId });
        },
        [navigation],
    );

    const handleCreate = useCallback((): void => {
        navigation.navigate('CreateLeaveRequest');
    }, [navigation]);

    const header = <AppHeader title="Leave" subtitle="Your leave requests." />;

    if (query.isPending && page === 1 && allItems.length === 0) {
        return (
            <ScreenContainer hasHeader>
                {header}
                {/* Card-shaped placeholders matching the row footprint, so the
                    first paint and the loaded list share one geometry. */}
                <SkeletonList count={3} />
            </ScreenContainer>
        );
    }

    if (query.isError && allItems.length === 0) {
        return (
            <ScreenContainer hasHeader>
                {header}
                <ErrorView error={query.error} onRetry={() => void query.refetch()} />
            </ScreenContainer>
        );
    }

    return (
        <ScreenContainer hasHeader scrollable={false}>
            {header}

            <View style={styles.body}>
                <FilterChipRow
                    selected={status}
                    onSelect={setStatus}
                    pendingTotal={pendingTotal}
                />

                <FlatList<LeaveRequest>
                    data={allItems}
                    keyExtractor={request => String(request.id)}
                    testID="leave-list"
                    style={styles.list}
                    contentContainerStyle={[
                        styles.listContent,
                        { paddingHorizontal: theme.screenGutter, gap: theme.spacing.sm },
                    ]}
                    refreshing={query.isRefetching}
                    onRefresh={handleRefresh}
                    onEndReached={handleEndReached}
                    onEndReachedThreshold={0.5}
                    initialNumToRender={8}
                    maxToRenderPerBatch={8}
                    windowSize={7}
                    // Android only: iOS clipping would cut the card's drop shadow off
                    // at the cell bounds and make rows look flat.
                    removeClippedSubviews={theme.isDark ? false : undefined}
                    renderItem={({ item }: ListRenderItemInfo<LeaveRequest>) => (
                        <LeaveRow request={item} onPress={handleOpenRequest} />
                    )}
                    ListEmptyComponent={<LeaveEmptyState filter={status} />}
                    ListFooterComponent={
                        // Appending a page is still content loading, so it gets the
                        // same card skeleton rather than dropping back to a spinner.
                        query.isFetching && page > 1 ? <SkeletonList count={2} /> : undefined
                    }
                />
            </View>

            <FloatingActionButton
                onPress={handleCreate}
                accessibilityLabel="Request leave"
                testID="leave-fab"
            />
        </ScreenContainer>
    );
}

/**
 * The horizontal filter scroller.
 *
 * `flexGrow: 0` is load-bearing: a `FlatList` defaults to `flex: 1` inside a column
 * parent, which would let the chip row swallow the whole viewport and leave the feed
 * with nothing. `showsHorizontalScrollIndicator={false}` is required by the brief and
 * is also correct — a scrollbar under a single row of pills looks like a layout bug.
 */
function FilterChipRow({
    selected,
    onSelect,
    pendingTotal,
}: {
    selected: FilterKey;
    onSelect: (key: FilterKey) => void;
    pendingTotal: number;
}): React.JSX.Element {
    const counts = useMemo<Partial<Record<FilterKey, number>>>(
        () => ({ pending: pendingTotal }),
        [pendingTotal],
    );

    return (
        <View style={styles.chipRow}>
            <FlatList
                data={FILTERS}
                horizontal
                keyExtractor={filter => filter.key}
                testID="leave-filters"
                style={styles.chipStrip}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{
                    paddingHorizontal: 20,
                    gap: 8,
                }}
                // Four short labels; there is nothing to defer.
                initialNumToRender={FILTERS.length}
                renderItem={({ item }: ListRenderItemInfo<{ key: FilterKey; label: string }>) => (
                    <FilterChip
                        label={item.label}
                        selected={item.key === selected}
                        count={counts[item.key]}
                        onPress={() => onSelect(item.key)}
                        testID={`leave-filter-${item.key}`}
                    />
                )}
            />
        </View>
    );
}

/**
 * One leave request.
 *
 * A flat card — the previous 4pt status accent strip is gone. Status is carried by
 * the shared `StatusBadge` alone, which is the same pill every other surface uses,
 * so a leave card and a shift card can no longer disagree about what "pending"
 * looks like.
 */
function LeaveRow({
    request,
    onPress,
}: {
    request: LeaveRequest;
    onPress: (leaveRequestId: number) => void;
}): React.JSX.Element {
    const theme = useTheme();
    const range = formatLeaveRange(request.start_date, request.end_date);
    const dayPart = dayPartLabel(request.start_session, request.end_session);
    const decided = decisionDate(request);
    const decisionLabel =
        decided === null
            ? null
            : `${request.status === 'approved' ? 'Approved' : 'Rejected'} ${formatDate(decided)}`;

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${request.leave_type?.name ?? 'Leave'}, ${range}, ${dayPart}, ${request.status}, ${formatTotalDays(request.total_days)}`}
            testID={`leave-card-${request.id}`}
            onPress={() => onPress(request.id)}
            style={({ pressed }) => [
                styles.card,
                theme.tokens.shadows.shadowCard,
                {
                    backgroundColor: theme.colors.surface,
                    borderRadius: theme.tokens.radius.rLg,
                },
                pressed ? { backgroundColor: theme.colors.surfaceMuted } : null,
            ]}>
            {/* Row 1 — type + status pill. */}
            <View style={styles.cardTopRow}>
                <AppText variant="bodyStrong" color="text" numberOfLines={1} style={styles.cardType}>
                    {request.leave_type?.name ?? 'Leave'}
                </AppText>
                <StatusBadge status={request.status} />
            </View>

            {/* Row 2 — full date range + decision date. */}
            <View style={styles.cardDateRow}>
                <AppText
                    variant="body"
                    color="textSecondary"
                    numberOfLines={2}
                    style={styles.cardRange}>
                    {range}
                </AppText>
                {decisionLabel !== null ? (
                    <AppText variant="caption" color="textMuted" numberOfLines={1}>
                        {decisionLabel}
                    </AppText>
                ) : null}
            </View>

            {/* Row 3 — day-part with a sun prefix. */}
            <View style={styles.cardDayPartRow}>
                <AppIcon icon={SunGlyph} sizePoints={DAY_PART_ICON_SIZE} color="textMuted" />
                <AppText variant="caption" color="textMuted" numberOfLines={1}>
                    {dayPart}
                </AppText>
            </View>
        </Pressable>
    );
}

/**
 * Per-filter empty state.
 *
 * A 48pt calendar-off mark over a single line naming the filter, centred with the
 * spec's 80pt top margin. Deliberately not the shared `EmptyState`: that component
 * carries a title, a description and a call to action, and this state needs one
 * line — the FAB is already the call to action.
 */
function LeaveEmptyState({ filter }: { filter: FilterKey }): React.JSX.Element {
    const label = filter === 'all' ? 'No leave requests.' : `No ${filter} requests.`;

    return (
        <View style={styles.empty}>
            <AppIcon icon={CalendarOffGlyph} sizePoints={48} color="textMuted" />
            <AppText variant="body" color="textSecondary" align="center">
                {label}
            </AppText>
        </View>
    );
}

const styles = StyleSheet.create({
    body: {
        flex: 1,
    },
    chipRow: {
        flexGrow: 0,
        marginTop: 16,
    },
    chipStrip: {
        flexGrow: 0,
    },
    list: {
        flex: 1,
    },
    listContent: {
        paddingTop: 12,
        // Clears the FAB, which floats over the last row. Without this the final
        // card sits underneath the button and its status badge is unreachable.
        paddingBottom: 120,
    },
    card: {
        padding: 16,
        gap: 8,
    },
    cardTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    cardType: {
        flex: 1,
        minWidth: 0,
    },
    cardDateRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
    },
    cardRange: {
        flex: 1,
        minWidth: 0,
    },
    cardDayPartRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    empty: {
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 80,
        gap: 12,
    },
});

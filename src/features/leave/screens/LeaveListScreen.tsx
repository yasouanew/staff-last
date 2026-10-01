import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View, type ListRenderItemInfo } from 'react-native';

import { AppHeader } from '../../../components/AppHeader';
import { AppText } from '../../../components/AppText';
import { EmptyState } from '../../../components/EmptyState';
import { ErrorView } from '../../../components/ErrorView';
import { FilterChip } from '../../../components/FilterChip';
import { FloatingActionButton } from '../../../components/FloatingActionButton';
import { SkeletonList } from '../../../components/Skeleton';
import { ScreenContainer } from '../../../components/ScreenContainer';
import { StatusBadge } from '../../../components/StatusBadge';
import type { LeaveStackParamList } from '../../../navigation/types';
import { scaleRowHeight, useRowScale } from '../../../hooks';
import { borderWidths, componentRadius, useTheme } from '../../../theme';
import type { Colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';
import type { LeaveRequestStatus } from '../../../types/api';
import { formatDate, formatRelative } from '../../../utils/date';
import { useLeaveRequests } from '../hooks';
import type { LeaveRequest } from '../types';
import { formatTotalDays, sessionLabel } from '../utils/leaveRequest';

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

/**
 * Accent-strip colour by status.
 *
 * The strip is the card's second, non-textual encoding of status: it is legible at a
 * glance while scrolling, before the `StatusBadge` label is read. `*Strong` rather
 * than the soft tone because the stripe is a 4pt sliver — a soft tint on a 4pt sliver
 * against white reads as "no stripe at all".
 *
 * Keyed by a `Record` over the status union so adding a status to the API without
 * adding it here fails the build rather than silently rendering an unaccented card.
 */
const STATUS_ACCENT: Record<LeaveRequestStatus, keyof Colors> = {
    approved: 'successStrong',
    pending: 'warningStrong',
    rejected: 'dangerStrong',
};

/**
 * Fixed row height, in points.
 *
 * `LeaveRow` clamps its content so this stays true: the widest card is position line
 * + date/days line + sessions line + a two-line reason clamped to `numberOfLines={2}`,
 * which at the `caption`/`bodyStrong` metrics tops out around 88pt including padding
 * and the badge. 96 gives that a margin and still divides evenly by 8 (the grid unit).
 *
 * The card's own `marginBottom` is *not* part of this figure — `ItemSeparatorComponent`
 * and `contentContainerStyle.gap` sit outside the item, and `getItemLayout` measures
 * the item only. Putting the gap inside this number instead would make the list drift
 * by one gap per screen.
 */
export const LEAVE_ROW_HEIGHT = 96;

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
 */
export function LeaveListScreen({ navigation }: Props): React.JSX.Element {
    const theme = useTheme();
    /*
     * The row height is a `getItemLayout` contract, so it is scaled by the same
     * factor [`LeaveRow`](#leaverow) applies — see [`useRowScale`](src/hooks/useRowScale.ts:1).
     */
    const scale = useRowScale();
    const rowBlock = scaleRowHeight(LEAVE_ROW_HEIGHT, scale) + theme.spacing.sm;
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

    /*
     * The chip row is a sibling of the feed rather than its `ListHeaderComponent`.
     *
     * Inside the header it would unmount once the user scrolled past it, taking the
     * selected filter off screen while its results were still on screen — the filter
     * would become invisible but still applied, which is the single most confusing
     * state a filtered list can be in. As a sibling it also has to be wrapped by the
     * screen rather than the list, so it never inherits the list's scroll offset.
     */
    const header = (
        <AppHeader
            title="Leave"
            subtitle={
                pendingTotal > 0
                    ? `${pendingTotal} awaiting a decision`
                    : 'Your leave requests.'
            }
        />
    );

    if (query.isPending && page === 1 && allItems.length === 0) {
        return (
            <ScreenContainer hasHeader>
                {header}
                {/* Card-shaped placeholders matching `LeaveRow`'s footprint, so the
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
                    /*
                     * Every row is a fixed height, so the list can compute offsets
                     * without measuring. This is what keeps `onEndReached` and the
                     * scrollbar honest during a fast fling on a long feed.
                     */
                    getItemLayout={(_data, index) => ({
                        length: rowBlock,
                        offset: rowBlock * index,
                        index,
                    })}
                    initialNumToRender={8}
                    maxToRenderPerBatch={8}
                    windowSize={7}
                    // Android only: iOS clipping would cut the card's drop shadow off
                    // at the cell bounds and make rows look flat.
                    removeClippedSubviews={theme.isDark ? false : undefined}
                    renderItem={({ item }: ListRenderItemInfo<LeaveRequest>) => (
                        <LeaveRow request={item} onPress={handleOpenRequest} />
                    )}
                    ListEmptyComponent={
                        <EmptyState
                            title="No leave requests"
                            description={
                                status === 'all'
                                    ? 'You have not submitted any leave requests yet. Tap + to request leave.'
                                    : `You have no ${status} leave requests.`
                            }
                            actionLabel="Request leave"
                            onAction={handleCreate}
                        />
                    }
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
    const theme = useTheme();

    const counts = useMemo<Partial<Record<FilterKey, number>>>(
        () => ({ pending: pendingTotal }),
        [pendingTotal],
    );

    return (
        <View style={{ flexGrow: 0 }}>
            <FlatList
                data={FILTERS}
                horizontal
                keyExtractor={filter => filter.key}
                testID="leave-filters"
                style={styles.chipStrip}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{
                    paddingHorizontal: theme.screenGutter,
                    paddingVertical: theme.spacing.xs,
                    gap: theme.spacing.xs,
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
 * The accent strip is a sibling of the card body inside a clipping wrapper, not a
 * `borderLeftWidth` on the card. A left border follows the rounded corner and so
 * tapers into nothing at the top-left and bottom-left radii; a strip drawn across the
 * full height and then clipped by the wrapper's `overflow: 'hidden'` keeps a constant
 * 4pt width while still stopping at the corner.
 */
function LeaveRow({
    request,
    onPress,
}: {
    request: LeaveRequest;
    onPress: (leaveRequestId: number) => void;
}): React.JSX.Element {
    const theme = useTheme();
    // Matches the scaled `getItemLayout` block on the feed (see the screen body).
    const scale = useRowScale();
    const cardHeight = scaleRowHeight(LEAVE_ROW_HEIGHT, scale);
    const dates = `${formatDate(request.start_date)} – ${formatDate(request.end_date)}`;
    const sessions = sessionLabel(
        request.start_date,
        request.end_date,
        request.start_session,
        request.end_session,
    );
    const attachmentCount = request.attachments?.length ?? 0;
    const accent = STATUS_ACCENT[request.status];

    return (
        <View
            style={[
                styles.cardShell,
                {
                    minHeight: cardHeight,
                    backgroundColor: theme.colors.surface,
                    // The card *role*, not a raw step: this is what guarantees a leave
                    // card and an `AppCard` can never drift to different corners.
                    borderRadius: componentRadius.card,
                    borderWidth: borderWidths.hairline,
                    // `hairline` in light (matching `AppCard`) and the elevation ring in
                    // dark, where a hairline border would read as a grey outline.
                    borderColor: theme.isDark ? theme.darkElevation.ring : theme.colors.hairline,
                    ...theme.shadows.low,
                },
            ]}>
            <View style={[styles.accent, { backgroundColor: theme.colors[accent] }]} />

            <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${request.leave_type?.name ?? 'Leave'}, ${dates}, ${request.status
                    }, ${formatTotalDays(request.total_days)}`}
                testID={`leave-card-${request.id}`}
                onPress={() => onPress(request.id)}
                style={({ pressed }) => [
                    styles.cardBody,
                    pressed ? { backgroundColor: theme.colors.surfaceMuted } : null,
                ]}>
                <View style={[styles.cardText, { gap: spacing.xxs }]}>
                    <AppText variant="bodyStrong" numberOfLines={1}>
                        {request.leave_type?.name ?? 'Leave'}
                    </AppText>
                    <AppText variant="caption" color="textSecondary" numberOfLines={1}>
                        {dates} · {formatTotalDays(request.total_days)}
                    </AppText>
                    <AppText variant="caption" color="textMuted" numberOfLines={1}>
                        {sessions}
                        {attachmentCount > 0
                            ? ` · ${attachmentCount} attachment${attachmentCount === 1 ? '' : 's'}`
                            : ''}
                    </AppText>
                    {request.reason ? (
                        <AppText variant="caption" color="textSecondary" numberOfLines={1}>
                            {request.reason}
                        </AppText>
                    ) : null}
                </View>

                <View style={styles.cardTrailing}>
                    <StatusBadge status={request.status} />
                    <AppText variant="caption" color="textMuted" numberOfLines={1}>
                        {formatRelative(request.created_at)}
                    </AppText>
                </View>
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    body: {
        flex: 1,
        paddingTop: spacing.xs,
    },
    chipStrip: {
        flexGrow: 0,
    },
    list: {
        flex: 1,
    },
    listContent: {
        paddingTop: spacing.xs,
        // Clears the FAB, which floats over the last row. Without this the final
        // card sits underneath the button and its status badge is unreachable.
        paddingBottom: spacing.huge + spacing.xxl,
    },
    cardShell: {
        flexDirection: 'row',
        overflow: 'hidden',
        height: LEAVE_ROW_HEIGHT,
    },
    accent: {
        width: spacing.xxs,
    },
    cardBody: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        // The left edge is flush with the strip, so only the right side needs the
        // card's own inset.
        paddingVertical: spacing.sm,
        minWidth: 0,
    },
    cardText: {
        flex: 1,
        minWidth: 0,
    },
    /** Status badge over its timestamp, right-aligned and never squeezed. */
    cardTrailing: {
        alignItems: 'flex-end',
        flexShrink: 0,
        gap: spacing.xxs,
    },
});


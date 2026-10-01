import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { AppHeader } from '../../../components/AppHeader';
import { AppText } from '../../../components/AppText';
import { EmptyState } from '../../../components/EmptyState';
import { ErrorView } from '../../../components/ErrorView';
import { SkeletonRows } from '../../../components/Skeleton';
import { ScreenContainer } from '../../../components/ScreenContainer';
import { spacing, useTheme } from '../../../theme';
import { formatRelative } from '../../../utils/date';
import { useInbox, useMarkAllNotificationsRead, useMarkNotificationRead } from '../hooks';
import type { InboxItem } from '../utils/inboxMerge';

type Props = {
    navigation: { goBack: () => void };
};

/**
 * Notifications (spec Screen 10).
 *
 * ## Rendered from the local inbox, not from the network
 *
 * This screen reads [`useInbox`](src/features/notifications/hooks/useInbox.ts:1), which
 * renders from AsyncStorage and treats `GET /notifications` as a reconciler. The
 * practical consequences:
 *
 * - It works with no connectivity, showing the last known notifications instead of an
 *   error screen.
 * - A notification that arrived while the app was closed is present even if the tray
 *   entry was dismissed, because the background handler persisted it.
 * - Read state is written locally first, so tapping a row works offline and never
 *   waits on a round trip.
 *
 * `ErrorView` is therefore reserved for the one case where it is honest: the screen has
 * nothing to show *and* the request failed. When rows exist but the sync is stale, a
 * quiet banner is shown instead — a stale notification list is still useful, and
 * replacing it with a full-screen retry prompt would hide information the user needs.
 */
export function NotificationsScreen({ navigation }: Props): React.JSX.Element {
    const theme = useTheme();
    const inbox = useInbox(30);
    const markRead = useMarkNotificationRead();
    const markAllRead = useMarkAllNotificationsRead();

    const notifications = inbox.items;
    const hasUnread = notifications.some(item => item.read_at === null);
    const showErrorState = inbox.isStale && notifications.length === 0 && !inbox.isInitialLoading;

    if (inbox.isInitialLoading) {
        return (
            <ScreenContainer hasHeader>
                <AppHeader title="Notifications" onBack={() => navigation.goBack()} />
                <SkeletonRows count={6} />
            </ScreenContainer>
        );
    }

    if (showErrorState) {
        return (
            <ScreenContainer hasHeader>
                <AppHeader title="Notifications" onBack={() => navigation.goBack()} />
                <ErrorView
                    error={{
                        kind: 'network',
                        message: 'Notifications could not be loaded and none are stored on this device.',
                    }}
                    onRetry={inbox.retry}
                />
            </ScreenContainer>
        );
    }

    return (
        <ScreenContainer hasHeader scrollable={false}>
            <AppHeader
                title="Notifications"
                onBack={() => navigation.goBack()}
                action={
                    hasUnread ? (
                        <Pressable
                            accessibilityRole="button"
                            onPress={() => markAllRead.mutate()}
                            disabled={markAllRead.isPending}
                            hitSlop={theme.spacing.sm}
                        >
                            <AppText variant="bodyStrong" color="textLink">
                                Mark all read
                            </AppText>
                        </Pressable>
                    ) : undefined
                }
            />

            {inbox.isStale ? <SyncNotice /> : null}

            {notifications.length === 0 ? (
                <EmptyState
                    title="Nothing yet"
                    description="Shift changes, roster updates and leave decisions will show up here."
                />
            ) : (
                <FlatList
                    data={notifications}
                    keyExtractor={item => item.id}
                    renderItem={({ item }) => (
                        <NotificationRow
                            notification={item}
                            onPress={() => {
                                if (item.read_at === null) {
                                    markRead.mutate(item.id);
                                }
                            }}
                        />
                    )}
                    contentContainerStyle={[
                        styles.list,
                        { padding: theme.screenGutter, gap: theme.spacing.sm },
                    ]}
                    refreshing={inbox.isRefetching}
                    onRefresh={inbox.retry}
                />
            )}
        </ScreenContainer>
    );
}

/**
 * Shown when there are rows on screen but the last sync failed.
 *
 * A banner rather than an error state, deliberately: it explains *why* the list may be
 * out of date without taking the list away.
 */
function SyncNotice(): React.JSX.Element {
    const theme = useTheme();

    return (
        <View
            style={[
                styles.notice,
                {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radius.md,
                    marginHorizontal: theme.screenGutter,
                    paddingHorizontal: theme.spacing.md,
                    paddingVertical: theme.spacing.sm,
                },
            ]}
            accessibilityRole="alert"
        >
            <AppText variant="caption" color="textSecondary">
                Showing notifications stored on this device. They will re-sync when you are back online.
            </AppText>
        </View>
    );
}

function NotificationRow({
    notification,
    onPress,
}: {
    notification: InboxItem;
    onPress: () => void;
}): React.JSX.Element {
    const theme = useTheme();
    const unread = notification.read_at === null;

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={unread ? `${notification.title}, unread` : notification.title}
            onPress={onPress}
            disabled={!unread}
            style={[
                styles.row,
                {
                    backgroundColor: unread ? theme.colors.primarySoft : theme.colors.surface,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radius.md,
                    borderWidth: 1,
                    padding: theme.spacing.md,
                    gap: theme.spacing.xxs,
                },
            ]}
        >
            <View style={styles.rowHeader}>
                <AppText variant="bodyStrong" numberOfLines={1} style={styles.title}>
                    {notification.title}
                </AppText>
                {notification.pending ? (
                    <AppText variant="caption" color="textMuted">
                        Queued
                    </AppText>
                ) : null}
                {unread ? (
                    <View
                        style={[
                            styles.dot,
                            { backgroundColor: theme.colors.primary, borderRadius: theme.radius.full },
                        ]}
                        accessibilityLabel="Unread"
                    />
                ) : null}
            </View>

            <AppText variant="body" color="textSecondary">
                {notification.body}
            </AppText>

            <AppText variant="caption" color="textMuted">
                {formatRelative(notification.created_at)}
            </AppText>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    list: {
        paddingBottom: spacing.xxl,
    },
    notice: {
        borderWidth: 1,
    },
    row: {
        width: '100%',
    },
    rowHeader: {
        alignItems: 'center',
        flexDirection: 'row',
        gap: spacing.xs,
    },
    title: {
        flex: 1,
    },
    dot: {
        height: 8,
        width: 8,
    },
});

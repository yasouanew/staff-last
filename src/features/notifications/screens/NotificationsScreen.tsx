import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { AppIcon } from '../../../components/AppIcon';
import { BellOffGlyph } from '../../../components/AppIcon/glyphs';
import { AppText } from '../../../components/AppText';
import { ErrorView } from '../../../components/ErrorView';
import { ScreenContainer } from '../../../components/ScreenContainer';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { SkeletonRows } from '../../../components/Skeleton';
import { useTheme } from '../../../theme/useTheme';
import { useInbox, useMarkAllNotificationsRead, useMarkNotificationRead } from '../hooks';
import { NotificationCard } from '../components';
import type { InboxItem } from '../utils/inboxMerge';
import { routeForNotification } from '../utils/notificationRouting';

type Props = {
    navigation: {
        goBack: () => void;
        navigate: (name: string, params?: object) => void;
    };
};

/** The spec's empty-state mark. */
const EMPTY_ICON_SIZE = 56;

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
 *
 * ## Typed feed
 *
 * Each card is a [`NotificationCard`](src/features/notifications/components/NotificationCard.tsx:1),
 * which differentiates roster/shift events from leave events by icon and tile colour,
 * and renders a clear read/unread state. Tapping a card marks it read and routes to
 * the relevant screen via [`routeForNotification`](src/features/notifications/utils/notificationRouting.ts:1).
 */
export function NotificationsScreen({ navigation }: Props): React.JSX.Element {
    const theme = useTheme();
    const inbox = useInbox(30);
    const markRead = useMarkNotificationRead();
    const markAllRead = useMarkAllNotificationsRead();

    const notifications = inbox.items;
    const hasUnread = notifications.some(item => item.read_at === null);
    const showErrorState = inbox.isStale && notifications.length === 0 && !inbox.isInitialLoading;

    const handleOpen = (item: InboxItem): void => {
        if (item.read_at === null) {
            markRead.mutate(item.id);
        }

        const route = routeForNotification(item.data);
        navigation.navigate(route.screen, route.params);
    };

    if (inbox.isInitialLoading) {
        return (
            <ScreenContainer hasHeader>
                <ScreenHeader title="Notifications" onBack={() => navigation.goBack()} />
                <SkeletonRows count={6} />
            </ScreenContainer>
        );
    }

    if (showErrorState) {
        return (
            <ScreenContainer hasHeader>
                <ScreenHeader title="Notifications" onBack={() => navigation.goBack()} />
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
        <ScreenContainer hasHeader scrollable={false} withGutter={false}>
            <ScreenHeader
                title="Notifications"
                onBack={() => navigation.goBack()}
                action={
                    hasUnread ? (
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Mark all read"
                            onPress={() => markAllRead.mutate()}
                            disabled={markAllRead.isPending}
                            hitSlop={theme.spacing.sm}>
                            <AppText variant="bodyStrong" color="textLink">
                                Mark all read
                            </AppText>
                        </Pressable>
                    ) : undefined
                }
            />

            {inbox.isStale ? <SyncNotice /> : null}

            {notifications.length === 0 ? (
                <NotificationsEmptyState />
            ) : (
                <FlatList
                    data={notifications}
                    keyExtractor={item => item.id}
                    testID="notifications-list"
                    renderItem={({ item }) => (
                        <NotificationCard
                            notification={item}
                            onPress={() => handleOpen(item)}
                            testID={`notification-${item.id}`}
                        />
                    )}
                    contentContainerStyle={styles.list}
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
                    borderColor: theme.tokens.colors.borderHairline,
                    borderRadius: theme.tokens.radius.rMd,
                },
            ]}
            accessibilityRole="alert">
            <AppText variant="caption" color="textSecondary">
                Showing notifications stored on this device. They will re-sync when you are back online.
            </AppText>
        </View>
    );
}

/**
 * The zero-data state.
 *
 * A 56pt bell-off mark over a heading and a single explanatory line, centred with the
 * spec's 120pt top margin. Deliberately not the shared `EmptyState`: that component
 * carries a call to action, and there is nothing for the user to do here.
 */
function NotificationsEmptyState(): React.JSX.Element {
    return (
        <View style={styles.empty} testID="notifications-empty">
            <AppIcon icon={BellOffGlyph} sizePoints={EMPTY_ICON_SIZE} color="textMuted" />
            <AppText variant="heading" color="text" align="center">
                You're all caught up
            </AppText>
            <AppText variant="body" color="textSecondary" align="center">
                New roster and leave updates will appear here.
            </AppText>
        </View>
    );
}

const styles = StyleSheet.create({
    list: {
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 32,
        gap: 12,
    },
    notice: {
        marginHorizontal: 20,
        marginTop: 16,
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderWidth: 1,
    },
    empty: {
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 120,
        paddingHorizontal: 20,
        gap: 12,
    },
});

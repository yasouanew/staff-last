import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
    interpolateColor,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';

import { AppIcon, type IconComponent } from '../../../components/AppIcon';
import { CalendarDaysGlyph, CheckCircleGlyph } from '../../../components/AppIcon/glyphs';
import { AppText } from '../../../components/AppText';
import { useTheme } from '../../../theme/useTheme';
import { formatRelative } from '../../../utils/date';
import type { InboxItem } from '../utils/inboxMerge';
import { notificationKind, type NotificationKind } from '../utils/notificationKind';

/**
 * One notification in the feed.
 *
 * ## Type differentiation
 *
 * The leading tile is chosen by [`notificationKind`](src/features/notifications/utils/notificationKind.ts:1):
 * a calendar glyph on an `infoSoft` tile for roster/shift events, a check-circle on
 * a `successSoft` tile for leave events. That is what makes a leave decision
 * visually distinct from a shift change before the title is read.
 *
 * ## Read / unread
 *
 * An unread card is `surface` with a 1px `primary` border at 0.2 opacity and an 8×8
 * `primary` dot at the top-right. A read card is plain `surface` with no dot. The
 * background animates between the two over 200ms when the card is tapped, so the
 * state change is visible rather than instantaneous.
 *
 * ## Why the whole card is the target
 *
 * Tapping anywhere marks the row read and routes to the relevant screen. A read row
 * is still tappable (it routes), but it no longer carries the unread modifier in its
 * accessibility label.
 */
export type NotificationCardProps = {
    notification: InboxItem;
    onPress: () => void;
    testID?: string;
};

/** The spec's icon tile. */
const TILE_SIZE = 40;
/** The spec's tile radius. */
const TILE_RADIUS = 12;
/** The spec's glyph size inside the tile. */
const TILE_GLYPH = 20;
/** The spec's unread dot. */
const DOT_SIZE = 8;
/** The spec's read/unread transition. */
const TRANSITION_MS = 200;

/** Kind → glyph and colour tokens. */
const KIND_PRESENTATION: Record<
    NotificationKind,
    { icon: IconComponent; tile: 'infoSoft' | 'successSoft'; glyph: 'primary' | 'success' }
> = {
    roster: { icon: CalendarDaysGlyph, tile: 'infoSoft', glyph: 'primary' },
    leave: { icon: CheckCircleGlyph, tile: 'successSoft', glyph: 'success' },
};

export function NotificationCard({
    notification,
    onPress,
    testID,
}: NotificationCardProps): React.JSX.Element {
    const theme = useTheme();
    const unread = notification.read_at === null;
    const kind = notificationKind(notification.type);
    const presentation = KIND_PRESENTATION[kind];

    // 0 = read, 1 = unread. Drives the border tint and the dot's opacity.
    const progress = useSharedValue(unread ? 1 : 0);

    useEffect(() => {
        progress.value = withTiming(unread ? 1 : 0, { duration: TRANSITION_MS });
    }, [progress, unread]);

    const animatedStyle = useAnimatedStyle(() => ({
        borderColor: interpolateColor(
            progress.value,
            [0, 1],
            ['rgba(0,0,0,0)', theme.colors.primary],
        ),
        borderWidth: 1,
        opacity: 1,
    }));

    const dotStyle = useAnimatedStyle(() => ({
        opacity: progress.value,
    }));

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={unread ? `${notification.title}, unread` : notification.title}
            onPress={onPress}
            testID={testID}
            style={({ pressed }) => [
                styles.card,
                theme.tokens.shadows.shadowCard,
                {
                    backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.surface,
                    borderRadius: theme.tokens.radius.rLg,
                },
            ]}>
            <Animated.View
                pointerEvents="none"
                style={[
                    StyleSheet.absoluteFill,
                    { borderRadius: theme.tokens.radius.rLg },
                    animatedStyle,
                ]}
            />

            <View
                style={[
                    styles.tile,
                    { backgroundColor: theme.colors[presentation.tile], borderRadius: TILE_RADIUS },
                ]}>
                <AppIcon
                    icon={presentation.icon}
                    sizePoints={TILE_GLYPH}
                    color={presentation.glyph}
                />
            </View>

            <View style={styles.body}>
                <AppText variant="bodyStrong" color="text" numberOfLines={1}>
                    {notification.title}
                </AppText>
                <AppText variant="body" color="textSecondary" numberOfLines={3}>
                    {notification.body}
                </AppText>
                <AppText variant="caption" color="textMuted" style={styles.timestamp}>
                    {formatRelative(notification.created_at)}
                </AppText>
            </View>

            {unread ? (
                <Animated.View
                    pointerEvents="none"
                    testID={testID !== undefined ? `${testID}-unread-dot` : undefined}
                    style={[
                        styles.dot,
                        { backgroundColor: theme.colors.primary },
                        dotStyle,
                    ]}
                />
            ) : null}
        </Pressable>
    );
}

const styles = StyleSheet.create({
    card: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        padding: 16,
        gap: 12,
    },
    tile: {
        width: TILE_SIZE,
        height: TILE_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
        flexGrow: 0,
        flexShrink: 0,
    },
    body: {
        flex: 1,
        // Without this a long body pushes the unread dot off the card.
        minWidth: 0,
    },
    timestamp: {
        marginTop: 4,
    },
    dot: {
        position: 'absolute',
        top: 4,
        right: 4,
        width: DOT_SIZE,
        height: DOT_SIZE,
        borderRadius: DOT_SIZE / 2,
    },
});

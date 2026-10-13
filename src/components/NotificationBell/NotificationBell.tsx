import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '../../theme/useTheme';
import { AppIcon, BellGlyph } from '../AppIcon';

/**
 * Notification bell — the Home hero's entry point to the inbox.
 *
 * ## Why this exists
 *
 * [`NotificationsScreen`](src/features/notifications/screens/NotificationsScreen.tsx:39)
 * is registered in [`HomeStack`](src/navigation/stacks/HomeStack.tsx:34) but had no
 * affordance that navigated to it. The Home hero reserves a trailing slot for
 * exactly this control, so the bell lives here as a component rather than inline
 * in the screen: Home renders its header from several branches (loading, locked,
 * error, empty, populated) and a shared component is what keeps the bell from
 * vanishing in an edge state.
 *
 * ## The glass disc
 *
 * The bell sits on the hero's brand gradient, so it is painted as a 40×40
 * translucent disc (`rgba(255,255,255,0.15)`) with a 20pt white glyph. The disc
 * gives the glyph a defined hit area against a busy gradient without introducing
 * a second opaque colour, which is what keeps the hero reading as one surface.
 *
 * ## The dot is not colour-only
 *
 * The count is folded into the button's `accessibilityLabel`, so a screen reader
 * announces "Notifications, 3 unread" even though the visual marker is a bare dot.
 * The dot's 2pt white ring lifts it off the disc so the two never read as a single
 * shape.
 */
export type NotificationBellProps = {
    /** Unread count. The dot renders only when this is greater than zero. */
    count?: number;
    onPress: () => void;
};

/** Diameter of the glass disc, in points. */
const DISC_SIZE = 40;

/** Diameter of the unread dot, in points. */
const DOT_SIZE = 10;

export function NotificationBell({ count = 0, onPress }: NotificationBellProps): React.JSX.Element {
    const theme = useTheme();
    const hasUnread = count > 0;

    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={hasUnread ? `Notifications, ${count} unread` : 'Notifications'}
            // The disc is 40pt; hitSlop lifts the touch target to the 44pt floor
            // without growing the visible control.
            hitSlop={4}
            testID="home-notifications-bell"
            style={({ pressed }) => [
                styles.button,
                {
                    // The glass disc sits on the hero gradient. In dark mode the
                    // spec dims it to `rgba(255,255,255,0.10)` so it does not
                    // glare against the darker hero.
                    backgroundColor: theme.isDark
                        ? 'rgba(255, 255, 255, 0.10)'
                        : 'rgba(255, 255, 255, 0.15)',
                    opacity: pressed ? 0.7 : 1,
                },
            ]}>
            <AppIcon icon={BellGlyph} sizePoints={20} color="onPrimary" />

            {hasUnread ? (
                <View
                    style={[
                        styles.dot,
                        {
                            backgroundColor: theme.colors.danger,
                            // A white ring separates the dot from the disc.
                            borderColor: theme.colors.onPrimary,
                        },
                    ]}
                    // The count is already announced by the button label.
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                />
            ) : null}
        </Pressable>
    );
}

const styles = StyleSheet.create({
    button: {
        alignItems: 'center',
        justifyContent: 'center',
        width: DISC_SIZE,
        height: DISC_SIZE,
        borderRadius: DISC_SIZE / 2,
        // Glass fill is applied inline so it can differ per scheme; see the
        // component body.
    },
    dot: {
        position: 'absolute',
        // Anchored to the disc's top-right corner, offset outward so it overlaps
        // the corner rather than sitting inside it.
        top: -2,
        right: -2,
        width: DOT_SIZE,
        height: DOT_SIZE,
        borderRadius: DOT_SIZE / 2,
        borderWidth: 2,
    },
});

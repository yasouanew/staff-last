import { Pressable, StyleSheet, View } from 'react-native';

import { radiusRoles } from '../../theme/radius';
import { spacing } from '../../theme/spacing';
import { useTheme } from '../../theme/useTheme';
import { AppIcon, BellGlyph } from '../AppIcon';

/**
 * Notification bell — the Home header's entry point to the inbox.
 *
 * ## Why this exists
 *
 * [`NotificationsScreen`](src/features/notifications/screens/NotificationsScreen.tsx:39)
 * is registered in [`HomeStack`](src/navigation/stacks/HomeStack.tsx:34) but had no
 * affordance that navigated to it. [`GreetingHeader`](src/components/GreetingHeader/GreetingHeader.tsx:43)
 * already reserves a trailing `action` slot for exactly this control, so the bell
 * lives here as a component rather than inline in the screen: Home renders its
 * header from five different branches (loading, locked, error, empty, populated)
 * and a shared component is what keeps the bell from vanishing in an edge state.
 *
 * ## Colour
 *
 * The glyph is painted `onPrimary` because the hero header's default fill is the
 * brand `primary`. The unread dot's ring is the same `primary` token, which lifts
 * the dot off the bell's dome so the two never read as a single shape.
 *
 * ## The dot is not colour-only
 *
 * The count is folded into the button's `accessibilityLabel`, so a screen reader
 * announces "Notifications, 3 unread" even though the visual marker is a bare dot.
 */
export type NotificationBellProps = {
    /** Unread count. The dot renders only when this is greater than zero. */
    count?: number;
    onPress: () => void;
};

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
            // The header already reserves a 44pt floor for this slot; hitSlop just
            // makes the bell forgiving to tap without growing the header.
            hitSlop={spacing.sm}
            testID="home-notifications-bell"
            style={styles.button}>
            <AppIcon icon={BellGlyph} size="medium" color="onPrimary" />

            {hasUnread ? (
                <View
                    style={[
                        styles.dot,
                        {
                            backgroundColor: theme.colors.danger,
                            borderColor: theme.colors.primary,
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
    },
    dot: {
        position: 'absolute',
        // Anchored to the bell's top-right corner so it overlaps the icon's
        // bounding box rather than sitting inside the dome.
        top: 0,
        right: 0,
        width: DOT_SIZE,
        height: DOT_SIZE,
        borderRadius: radiusRoles.pill.full,
        // A brand-coloured ring separates the dot from the dome on the header fill.
        borderWidth: 2,
    },
});

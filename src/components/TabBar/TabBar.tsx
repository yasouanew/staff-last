import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../theme/useTheme';
import type { IconComponent } from '../AppIcon/AppIcon';
import { TabBarItem } from './TabBarItem';

/**
 * Bottom tab bar.
 *
 * ## Why a presentational bar
 *
 * The navigator's default bar cannot express this app's slot geometry (five equal
 * fifths, a 24pt icon over a micro caption, an absolute unread badge), so the bar
 * is rendered by the app. Keeping it a *presentational* component — it takes a
 * list of items and knows nothing about React Navigation — means the same bar can
 * be rendered in a test or a preview without a navigator, and the navigation
 * wiring lives in one place ([`AppTabs`](src/navigation/stacks/AppTabs.tsx:1)).
 *
 * ## Geometry
 *
 * The content band is a constant 64pt; `insets.bottom` is *added* as padding so
 * the bar clears the swipe-home indicator without compressing the slots on
 * devices that have one. Content scrolls underneath, which is why
 * [`ScreenContainer`](src/components/ScreenContainer/ScreenContainer.tsx:1)
 * reserves the bar's measured height at the bottom of every tab screen.
 *
 * ## Separation, not framing
 *
 * The bar floats over scrolling content, so its top edge only needs to *separate*:
 * a single `borderHairline` rule, no full border and no shadow. In dark mode the
 * hairline is a lightened ring, since a darkened line on a dark surface is
 * invisible.
 */
export type TabBarItemModel = {
    /** Stable identity — the route key. */
    key: string;
    icon: IconComponent;
    label: string;
    focused: boolean;
    onPress: () => void;
    /** Unread count; renders the overlay badge when > 0. */
    badgeCount?: number;
    testID?: string;
};

export type TabBarProps = {
    items: TabBarItemModel[];
};

/** Height of the bar's content band, excluding the safe-area inset. */
export const TAB_BAR_HEIGHT = 64;

export function TabBar({ items }: TabBarProps): React.JSX.Element {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const { colors } = theme.tokens;

    return (
        <View
            style={[
                styles.bar,
                {
                    backgroundColor: colors.surface,
                    borderTopColor: colors.borderHairline,
                    paddingBottom: insets.bottom,
                },
            ]}>
            <View style={styles.slots}>
                {items.map(item => (
                    <TabBarItem
                        key={item.key}
                        icon={item.icon}
                        label={item.label}
                        focused={item.focused}
                        onPress={item.onPress}
                        badgeCount={item.badgeCount}
                        testID={item.testID}
                    />
                ))}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    bar: {
        // Locked to the absolute bottom edge of the display.
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        borderTopWidth: StyleSheet.hairlineWidth,
    },
    slots: {
        flexDirection: 'row',
        alignItems: 'stretch',
        height: TAB_BAR_HEIGHT,
    },
});

import { createBottomTabNavigator, type BottomTabBarProps } from '@react-navigation/bottom-tabs';

import type { IconComponent } from '../../components/AppIcon';
import {
    CalendarCheckGlyph,
    CalendarDaysGlyph,
    HomeGlyph,
    SunGlyph,
    UserGlyph,
} from '../../components/AppIcon/glyphs';
import { TabBar, type TabBarItemModel } from '../../components/TabBar';
import { useLocalUnreadCount, useUnreadCount } from '../../features/notifications/hooks';
import { AvailabilityScreen } from '../../features/availability/screens';
import { AccountStack } from './AccountStack';
import { HomeStack } from './HomeStack';
import { LeaveStack } from './LeaveStack';
import { RosterStack } from './RosterStack';
import type { AppTabParamList } from '../types';

const Tab = createBottomTabNavigator<AppTabParamList>();

/**
 * Presentation for each of the five tab slots.
 *
 * Each entry is a **distinct** glyph chosen to be readable at 24pt without its
 * label, which is the whole point of a tab bar icon:
 *
 *  - Home — a roof, the universal "start here".
 *  - Roster — a calendar with day marks, i.e. a *schedule* rather than a date.
 *  - Availability — a sun, standing for the hours you are willing to work.
 *  - Leave — a calendar with a tick, i.e. a date that has been *approved*.
 *  - Account — a person, the identity surface.
 *
 * Roster and Leave are both calendars, so they are differentiated by the day
 * marks versus the tick rather than by colour: at a glance the pair reads as
 * "what I work" and "what I have booked off", and neither collapses into the
 * other when the bar is in its inactive (all-grey) state.
 *
 * These references are stable module-scope constants. Building them inline would
 * mint a new component type per render and remount the icon subtree every time
 * the unread count changes.
 */
type TabPresentation = {
    icon: IconComponent;
    label: string;
};

const TAB_PRESENTATION: Record<keyof AppTabParamList, TabPresentation> = {
    HomeTab: { icon: HomeGlyph, label: 'Home' },
    RosterTab: { icon: CalendarDaysGlyph, label: 'Roster' },
    AvailabilityTab: { icon: SunGlyph, label: 'Availability' },
    LeaveTab: { icon: CalendarCheckGlyph, label: 'Leave' },
    AccountTab: { icon: UserGlyph, label: 'Account' },
};

/**
 * Custom bottom tab bar.
 *
 * The bar itself is the presentational [`TabBar`](src/components/TabBar/TabBar.tsx:1);
 * this function is the *navigation adapter* that turns React Navigation's
 * `state`/`descriptors`/`navigation` into the bar's item model. Keeping the two
 * apart means the bar can be rendered in a test or a preview without a navigator,
 * and the navigation wiring lives in exactly one place.
 *
 * ## Unread badge
 *
 * The Home slot carries the unread count. The local inbox is authoritative: the
 * badge is exactly the surface that must not go blank when connectivity drops, and
 * it has to reflect a read the user performed a second ago. The server count only
 * fills the pre-hydration gap so the badge does not flicker off.
 */
export function AppTabBar({ state, descriptors, navigation }: BottomTabBarProps): React.JSX.Element {
    const serverUnread = useUnreadCount();
    const localCount = useLocalUnreadCount();
    const unreadCount = localCount ?? serverUnread.data?.count ?? 0;

    const items: TabBarItemModel[] = state.routes.map((route, index) => {
        const focused = state.index === index;
        const presentation = TAB_PRESENTATION[route.name as keyof AppTabParamList];

        const onPress = (): void => {
            const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
            });

            if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name);
            }
        };

        return {
            key: route.key,
            icon: presentation.icon,
            label: presentation.label,
            focused,
            onPress,
            badgeCount: route.name === 'HomeTab' ? unreadCount : 0,
            testID: descriptors[route.key]?.options.tabBarButtonTestID,
        };
    });

    return <TabBar items={items} />;
}

/**
 * Hoisted so the navigator receives one stable component reference. Defining it
 * inline in `tabBar` would create a new component type on every render and
 * destroy the whole tab bar subtree — including its unread badge — each time.
 */
function renderTabBar(props: BottomTabBarProps): React.JSX.Element {
    return <AppTabBar {...props} />;
}

export function AppTabs(): React.JSX.Element {
    return (
        <Tab.Navigator
            tabBar={renderTabBar}
            screenOptions={{
                headerShown: false,
                // The custom bar renders its own labels; suppress the navigator's
                // so they cannot double up.
                tabBarShowLabel: false,
            }}>
            <Tab.Screen name="HomeTab" component={HomeStack} options={{ title: 'Home' }} />
            <Tab.Screen name="RosterTab" component={RosterStack} options={{ title: 'Roster' }} />
            <Tab.Screen name="AvailabilityTab" component={AvailabilityScreen} options={{ title: 'Availability' }} />
            <Tab.Screen name="LeaveTab" component={LeaveStack} options={{ title: 'Leave' }} />
            <Tab.Screen name="AccountTab" component={AccountStack} options={{ title: 'Account' }} />
        </Tab.Navigator>
    );
}

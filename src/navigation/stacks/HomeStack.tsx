import { createNativeStackNavigator } from '@react-navigation/native-stack';

import {
    HomeScreen,
    NotificationsScreen,
    RosterDetailScreen,
    ShiftDetailScreen,
} from '../../features/home/screens';
import { useTheme } from '../../theme';
import type { HomeStackParamList } from '../types';

const Stack = createNativeStackNavigator<HomeStackParamList>();

/**
 * Home stack.
 *
 * Notifications live here rather than in their own tab: the spec's tab list has five
 * entries and notifications are read from Home, the badge, and a push tap — a sixth
 * tab would dilute the primary navigation for a screen users visit reactively.
 */
export function HomeStack(): React.JSX.Element {
    const theme = useTheme();

    return (
        <Stack.Navigator
            screenOptions={{
                headerShown: false,
                /*
                 * A transparent content background, so the screen frame itself never
                 * paints a band above a hero.
                 *
                 * Every screen in this stack owns its top edge: Home through
                 * `HomeHero`'s `paddingTop: insets.top + HERO_TOP_GAP`, the others
                 * through `AppHeader`. `headerShown: false` on the native stack means
                 * the screen frame extends to the display top on both platforms, so
                 * the hero's gradient is the first thing painted there. Anything
                 * opaque on this style would instead show as a pale strip above the
                 * gradient on iOS, where the status-bar region is drawn by the
                 * screen container rather than by Android's edge-to-edge window.
                 */
                contentStyle: { backgroundColor: theme.colors.background },
            }}
        >
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="ShiftDetail" component={ShiftDetailScreen} />
            <Stack.Screen name="RosterDetail" component={RosterDetailScreen} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} />
        </Stack.Navigator>
    );
}

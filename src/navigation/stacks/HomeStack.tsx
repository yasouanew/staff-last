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

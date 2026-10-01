import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { MyRosterScreen, RosterDetailScreen } from '../../features/roster/screens';
import { ShiftDetailScreen } from '../../features/shifts/screens';
import { useTheme } from '../../theme';
import type { RosterStackParamList } from '../types';

const Stack = createNativeStackNavigator<RosterStackParamList>();

/**
 * My Roster stack.
 *
 * `RosterDetail` and `ShiftDetail` are distinct screens from those in the Home stack
 * even where they render similar content: React Navigation resolves a route by name
 * within its own navigator, and sharing a screen across navigators would break
 * back-behaviour (a "back" from a shift opened from Roster must return to Roster,
 * not to Home).
 */
export function RosterStack(): React.JSX.Element {
    const theme = useTheme();

    return (
        <Stack.Navigator
            screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: theme.colors.background },
            }}
        >
            <Stack.Screen name="MyRoster" component={MyRosterScreen} />
            <Stack.Screen name="RosterDetail" component={RosterDetailScreen} />
            <Stack.Screen name="ShiftDetail" component={ShiftDetailScreen} />
        </Stack.Navigator>
    );
}

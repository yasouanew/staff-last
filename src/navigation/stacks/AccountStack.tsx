import { createNativeStackNavigator } from '@react-navigation/native-stack';

import {
    AccountScreen,
    ChangePasswordScreen,
    PreferencesScreen,
    ProfileScreen,
} from '../../features/settings/screens';
import { useTheme } from '../../theme';
import type { AccountStackParamList } from '../types';

const Stack = createNativeStackNavigator<AccountStackParamList>();

/**
 * Account stack.
 *
 * Profile, password and preferences are pushed from Account rather than being tabs:
 * they are infrequent, transactional screens, and flattening them into the tab bar
 * would put destructive actions (sign out everywhere) one tap from the dashboard.
 */
export function AccountStack(): React.JSX.Element {
    const theme = useTheme();

    return (
        <Stack.Navigator
            screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: theme.colors.background },
            }}
        >
            <Stack.Screen name="Account" component={AccountScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
            <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
            <Stack.Screen name="Preferences" component={PreferencesScreen} />
        </Stack.Navigator>
    );
}

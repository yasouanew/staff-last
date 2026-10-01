import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { ForgotPasswordScreen, LoginScreen, ResetPasswordScreen } from '../../features/auth/screens';
import { useTheme } from '../../theme';
import type { AuthStackParamList } from '../types';

const Stack = createNativeStackNavigator<AuthStackParamList>();

/**
 * Unauthenticated stack: Login → Forgot Password → Reset Password.
 *
 * `headerShown: false` throughout — each screen renders its own
 * [`AppHeader`](src/components/AppHeader/AppHeader.tsx:1) so the title can sit inside
 * the scrollable content and respect the screen container's safe-area handling
 * rather than duplicating it in native chrome.
 */
export function AuthStack(): React.JSX.Element {
    const theme = useTheme();

    return (
        <Stack.Navigator
            screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: theme.colors.background },
            }}
        >
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
            <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
        </Stack.Navigator>
    );
}

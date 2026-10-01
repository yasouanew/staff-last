import { createNativeStackNavigator } from '@react-navigation/native-stack';

import {
    CreateLeaveRequestScreen,
    LeaveDetailScreen,
    LeaveListScreen,
} from '../../features/leave/screens';
import { useTheme } from '../../theme';
import type { LeaveStackParamList } from '../types';

const Stack = createNativeStackNavigator<LeaveStackParamList>();

/** Leave stack: list → detail, plus the create form. */
export function LeaveStack(): React.JSX.Element {
    const theme = useTheme();

    return (
        <Stack.Navigator
            screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: theme.colors.background },
            }}
        >
            <Stack.Screen name="LeaveList" component={LeaveListScreen} />
            <Stack.Screen name="LeaveDetail" component={LeaveDetailScreen} />
            <Stack.Screen
                name="CreateLeaveRequest"
                component={CreateLeaveRequestScreen}
                options={{
                    // A half-filled leave request is not worth losing to an accidental
                    // swipe, so this screen is presented modally.
                    presentation: 'modal',
                }}
            />
        </Stack.Navigator>
    );
}

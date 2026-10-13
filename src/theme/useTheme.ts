import { useContext } from 'react';
import { useColorScheme } from 'react-native';

import { usePreferencesStore } from '../features/settings/store/preferencesStore';
import { darkTheme, lightTheme, type Theme } from './theme';
import { ThemeContext } from './tokens';

export type AppearancePreference = 'system' | 'light' | 'dark';

/**
 * Returns the active application theme.
 *
 * ThemeProvider is the authoritative source when mounted.
 * The preferences store is only used as a fallback for isolated components/tests.
 */
export function useTheme(): Theme {
    const context = useContext(ThemeContext);
    const systemScheme = useColorScheme();
    const appearance = usePreferencesStore(state => state.appearance);

    if (context.isHydrated) {
        return context.colorScheme === 'dark' ? darkTheme : lightTheme;
    }

    return resolveTheme(appearance, systemScheme);
}

export function resolveTheme(
    preference: AppearancePreference | undefined,
    systemScheme: 'light' | 'dark' | null | undefined,
): Theme {
    if (preference === 'light') {
        return lightTheme;
    }

    if (preference === 'dark') {
        return darkTheme;
    }

    return systemScheme === 'dark' ? darkTheme : lightTheme;
}

export function getTheme(
    preference?: AppearancePreference,
    systemScheme?: 'light' | 'dark' | null,
): Theme {
    return resolveTheme(preference, systemScheme);
}
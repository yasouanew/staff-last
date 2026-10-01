import { useColorScheme } from 'react-native';

import { usePreferencesStore } from '../features/settings/store/preferencesStore';
import { darkTheme, lightTheme, type Theme } from './theme';

/**
 * Which appearance the app should render.
 *
 * `system` follows the OS. `light`/`dark` are explicit user overrides stored in
 * device-local preferences.
 */
export type AppearancePreference = 'system' | 'light' | 'dark';

/**
 * Returns the active theme for the current colour scheme.
 *
 * Reactivity
 * ----------
 * This is the single point where a colour scheme becomes a theme. It subscribes
 * to two signals:
 *
 *  1. `useColorScheme()` — the OS light/dark setting. RN pushes an update when
 *     the user flips it in Control Centre / Settings, and this hook re-renders.
 *  2. The stored `appearance` preference — lets a user pin the app to light or
 *     dark regardless of the OS.
 *
 * Every component in the app reads tokens through this hook, so no component
 * needs to know either signal exists. When a scheme changes, the tree re-renders
 * and every `theme.colors.*` reference resolves to the other map. That is the
 * entire dark-mode implementation — there is no per-component branching.
 *
 * Return type is `Theme`, which is the *structure* of the light theme. Dark is
 * guaranteed to match it because both are built by the same factory and both
 * colour maps satisfy the same `Colors` interface.
 */
export function useTheme(): Theme {
    const systemScheme = useColorScheme();
    const appearance = usePreferencesStore(state => state.appearance);

    return resolveTheme(appearance, systemScheme);
}

/**
 * Pure resolution, exported separately from the hook so it can be unit-tested
 * without a renderer and reused from non-React code paths.
 */
export function resolveTheme(
    preference: AppearancePreference | undefined,
    systemScheme: 'light' | 'dark' | null | undefined,
): Theme {
    // An explicit user choice always wins over the OS setting.
    if (preference === 'light') {
        return lightTheme;
    }

    if (preference === 'dark') {
        return darkTheme;
    }

    // `system` (or a not-yet-hydrated store) defers to the OS. A `null` scheme
    // means the platform has not reported one yet; light is the safe default
    // because the light palette is the one every asset and contrast check was
    // authored against.
    return systemScheme === 'dark' ? darkTheme : lightTheme;
}

/**
 * Imperative accessor for the theme outside React.
 *
 * Needed by `screenOptions` factories and other callbacks that are not
 * re-evaluated on a scheme change within the same render pass. Prefer
 * [`useTheme`](src/theme/useTheme.ts:1) anywhere a component can re-render.
 */
export function getTheme(preference?: AppearancePreference, systemScheme?: 'light' | 'dark' | null): Theme {
    return resolveTheme(preference, systemScheme);
}

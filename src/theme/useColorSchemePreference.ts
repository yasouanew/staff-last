import { useContext } from 'react';

import { ThemeContext, type ColorSchemePreference, type ResolvedColorScheme } from './tokens';

/**
 * Reads and writes the user's appearance preference.
 *
 * This is the write-side companion to [`useTheme`](src/theme/useTheme.ts:1):
 * `useTheme` returns the resolved token set, while this exposes the raw
 * preference (`light` | `dark` | `system`), the resolved scheme, and the setter
 * that persists a change. A settings screen needs all three — the switch reads
 * `colorScheme`, writes via `setColorScheme`, and disables itself until
 * `isHydrated` so it cannot be toggled before the stored value is known.
 *
 * Outside a [`ThemeProvider`](src/theme/ThemeProvider.tsx:1) the context default
 * is returned: `isHydrated: false` and a no-op setter, so a component rendered
 * in isolation degrades to a disabled control rather than throwing.
 */
export type ColorSchemePreferenceValue = {
    /** The resolved scheme actually rendered — never `system`. */
    colorScheme: ResolvedColorScheme;
    /** The user's raw preference, including `system`. */
    preference: ColorSchemePreference;
    /** Persists a new preference and re-renders the tree. */
    setColorScheme: (preference: ColorSchemePreference) => void;
    /** False until the persisted preference has been read. */
    isHydrated: boolean;
};

export function useColorSchemePreference(): ColorSchemePreferenceValue {
    const { colorScheme, preference, setColorScheme, isHydrated } = useContext(ThemeContext);

    return { colorScheme, preference, setColorScheme, isHydrated };
}

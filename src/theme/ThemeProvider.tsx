import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme, View } from 'react-native';

import { STORAGE_KEYS } from '../config/storageKeys';
import { getItem, setItem } from '../utils/storage';
import {
    ThemeContext,
    darkTokens,
    lightTokens,
    type ColorSchemePreference,
    type ResolvedColorScheme,
    type ThemeContextValue,
    type ThemeTokens,
} from './tokens';

/**
 * Theme provider — the single source of the active colour scheme.
 *
 * ## What it owns
 *
 *  1. **The user's preference** (`light` | `dark` | `system`), persisted to
 *     AsyncStorage under `@app/color-scheme` and hydrated on launch.
 *  2. **The resolved scheme** — `system` is collapsed to the OS setting via
 *     `useColorScheme()`, so consumers only ever see `light` or `dark`.
 *  3. **The assembled token set** for that scheme, exposed as `theme`.
 *
 * ## Why a provider and not just the OS hook
 *
 * The OS hook alone cannot express an explicit user override, and the override
 * must survive a relaunch. Centralising both signals here means every consumer
 * reads one context value and re-renders together when either changes — there
 * is no per-component branching on scheme anywhere in the app.
 *
 * ## The hydration gate
 *
 * Reading the persisted preference is async, so for one frame the app does not
 * know whether the user chose dark. Rendering the light tree and then flipping
 * to dark is the "theme flash" the spec forbids. Until hydration completes the
 * provider paints a bare, background-coloured view (no children), which is
 * visually identical to the splash the app shows anyway and cannot flash.
 *
 * ## Placement
 *
 * Mounted **above** the navigation container in [`App`](App.tsx:1), so the
 * navigator's own theme, the status bar and every screen resolve from the same
 * value.
 */
export type ThemeProviderProps = {
    children: ReactNode;
    /**
     * Seeds the preference before hydration. Used by tests and previews to pin
     * a scheme without touching storage; when supplied, hydration is skipped.
     */
    initialPreference?: ColorSchemePreference;
};

/** Runtime narrowing for a value read back from storage, which is untrusted. */
function isColorSchemePreference(value: unknown): value is ColorSchemePreference {
    return value === 'light' || value === 'dark' || value === 'system';
}

/** Collapses a preference + OS scheme into the scheme actually rendered. */
export function resolveColorScheme(
    preference: ColorSchemePreference,
    systemScheme: 'light' | 'dark' | null | undefined,
): ResolvedColorScheme {
    if (preference === 'light' || preference === 'dark') {
        return preference;
    }

    // `system` (or a not-yet-reported OS scheme) defers to the platform. A
    // `null` scheme means the platform has not answered yet; light is the safe
    // default because every asset and contrast check was authored against it.
    return systemScheme === 'dark' ? 'dark' : 'light';
}

/** Resolves the assembled token set for a scheme. */
export function tokensForScheme(scheme: ResolvedColorScheme): ThemeTokens {
    return scheme === 'dark' ? darkTokens : lightTokens;
}

export function ThemeProvider({
    children,
    initialPreference,
}: ThemeProviderProps): React.JSX.Element {
    const systemScheme = useColorScheme();

    const [preference, setPreference] = useState<ColorSchemePreference>(
        initialPreference ?? 'system',
    );
    // When a preference is seeded the value is already known, so the gate is
    // open from the first frame.
    const [isHydrated, setIsHydrated] = useState(initialPreference !== undefined);

    useEffect(() => {
        if (initialPreference !== undefined) {
            return;
        }

        let cancelled = false;

        void (async () => {
            const stored = await getItem<unknown>(STORAGE_KEYS.colorScheme);

            if (cancelled) {
                return;
            }

            if (isColorSchemePreference(stored)) {
                setPreference(stored);
            }

            setIsHydrated(true);
        })();

        return () => {
            cancelled = true;
        };
    }, [initialPreference]);

    const setColorScheme = useCallback((next: ColorSchemePreference) => {
        // Optimistic: the UI flips immediately, then the write is persisted.
        setPreference(next);
        void setItem(STORAGE_KEYS.colorScheme, next);
    }, []);

    const colorScheme = resolveColorScheme(preference, systemScheme);
    const theme = tokensForScheme(colorScheme);

    const value = useMemo<ThemeContextValue>(
        () => ({ theme, colorScheme, preference, setColorScheme, isHydrated }),
        [theme, colorScheme, preference, setColorScheme, isHydrated],
    );

    if (!isHydrated) {
        // A bare, background-coloured view rather than `null`: it paints the
        // correct canvas colour for the *system* scheme, so the first real frame
        // does not flash a white rectangle on a dark device.
        return (
            <View
                style={{
                    flex: 1,
                    backgroundColor: tokensForScheme(
                        resolveColorScheme('system', systemScheme),
                    ).colors.background,
                }}
            />
        );
    }

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

import { create } from 'zustand';

import { STORAGE_KEYS } from '../../../config/storageKeys';
import { getItem, setItem } from '../../../utils/storage';

/**
 * Device-local preferences.
 *
 * These are client state, not server state, so they belong in Zustand rather than
 * TanStack Query: nothing here round-trips through the API and nothing is cached per
 * company. They are persisted to the same namespaced AsyncStorage prefix as the
 * session so a single `clearAppStorage()` wipes the device clean on sign-out.
 *
 * Scope discipline: only genuinely UI-local settings live here. Notification *content*
 * is server state; this store merely records whether the device user opted in.
 */

/**
 * Appearance choice for the theme.
 *
 * `system` defers to the OS light/dark setting; the explicit values pin the app
 * regardless of it. Kept as a local preference (not server state) because it is
 * per-device, not per-account — the same employee may want dark mode on a
 * personal phone and light on a shared tablet.
 */
export type AppearancePreference = 'system' | 'light' | 'dark';

export type Preferences = {
    /** User-level push opt-in. Distinct from OS permission, which is authoritative. */
    pushEnabled: boolean;
    /** Whether the roster list defaults to week view or month view. */
    rosterWeekView: boolean;
    /** Light/dark/system appearance selection consumed by [`useTheme`](src/theme/useTheme.ts:1). */
    appearance: AppearancePreference;
};

const DEFAULT_PREFERENCES: Preferences = {
    // Opt-in by default because the app's core value is shift notification; the OS
    // permission prompt is the real gate.
    pushEnabled: true,
    rosterWeekView: true,
    // Follow the OS by default: a user who has enabled dark mode globally expects
    // every app to honour it without per-app setup.
    appearance: 'system',
};

type PreferencesState = Preferences & {
    /** False until the persisted values load, so the UI does not flash defaults. */
    isHydrated: boolean;
    hydrate: () => Promise<void>;
    setPushEnabled: (enabled: boolean) => Promise<void>;
    setRosterWeekView: (enabled: boolean) => Promise<void>;
    setAppearance: (appearance: AppearancePreference) => Promise<void>;
    reset: () => Promise<void>;
};

export const usePreferencesStore = create<PreferencesState>((set, get) => ({
    ...DEFAULT_PREFERENCES,
    isHydrated: false,

    hydrate: async () => {
        const stored = (await getItem<Partial<Preferences>>(STORAGE_KEYS.preferences)) ?? {};

        set({
            ...DEFAULT_PREFERENCES,
            ...stored,
            // Guard against a value written by an older/newer build: an
            // unrecognised appearance must fall back to `system` rather than
            // propagating `undefined` through the theme resolver.
            appearance: isAppearancePreference(stored.appearance)
                ? stored.appearance
                : DEFAULT_PREFERENCES.appearance,
            isHydrated: true,
        });
    },

    setPushEnabled: async (enabled) => {
        set({ pushEnabled: enabled });
        await persist(get());
    },

    setRosterWeekView: async (enabled) => {
        set({ rosterWeekView: enabled });
        await persist(get());
    },

    setAppearance: async (appearance) => {
        set({ appearance });
        await persist(get());
    },

    reset: async () => {
        set({ ...DEFAULT_PREFERENCES });
        await persist(DEFAULT_PREFERENCES);
    },
}));

/** Persists only the preference fields, never the actions or hydration flag. */
async function persist(state: Preferences): Promise<void> {
    await setItem<Preferences>(STORAGE_KEYS.preferences, {
        pushEnabled: state.pushEnabled,
        rosterWeekView: state.rosterWeekView,
        appearance: state.appearance,
    });
}

/** Runtime narrowing for a value read back from storage, which is untrusted. */
function isAppearancePreference(value: unknown): value is AppearancePreference {
    return value === 'system' || value === 'light' || value === 'dark';
}

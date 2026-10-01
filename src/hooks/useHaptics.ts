import { useCallback, useMemo } from 'react';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

import { useReduceMotion } from '../components/Skeleton/Skeleton';
import { hapticFeedback, reducedMotionSuppressed, type HapticSemantic } from '../theme/haptics';

/**
 * Options passed to every haptic trigger.
 *
 * `enableVibrateFallback` keeps the feedback meaningful on Android hardware that
 * has no dedicated haptic engine (it falls back to a short vibration).
 * `ignoreAndroidSystemSettings` is left `false` so a user who has disabled touch
 * feedback in Android settings is respected — overriding an explicit system
 * preference would be hostile.
 */
const HAPTIC_OPTIONS = {
    enableVibrateFallback: true,
    ignoreAndroidSystemSettings: false,
} as const;

/**
 * Returns a function that fires a haptic pulse for a semantic action.
 *
 * Components ask for intent ("a destructive confirmation") rather than a raw
 * trigger, so the whole app's tactile language can be retuned from
 * [`haptics.ts`](src/theme/haptics.ts:1).
 *
 * Reduced motion suppresses the *decorative* pulses (selection, light press,
 * detents) but keeps the informational ones (success/error), because those
 * convey state rather than flourish — see `reducedMotionSuppressed`.
 *
 * The returned callback is memoised against the reduce-motion flag so it can be
 * safely used inside `useCallback`/`useEffect` dependency arrays without
 * re-running on every render.
 */
export function useHaptics(): (semantic: HapticSemantic) => void {
    const reduceMotion = useReduceMotion();

    return useMemo(
        () =>
            (semantic: HapticSemantic): void => {
                if (reduceMotion && reducedMotionSuppressed.has(semantic)) {
                    return;
                }

                ReactNativeHapticFeedback.trigger(hapticFeedback[semantic], HAPTIC_OPTIONS);
            },
        [reduceMotion],
    );
}

/**
 * Convenience hook for a fixed semantic, for components that always fire the same
 * pulse (a switch toggling, a chip selecting).
 */
export function useHapticTrigger(semantic: HapticSemantic): () => void {
    const trigger = useHaptics();

    return useCallback(() => {
        trigger(semantic);
    }, [trigger, semantic]);
}

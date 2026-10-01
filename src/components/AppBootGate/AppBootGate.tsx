import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { useAppReadiness } from '../../features/app/hooks';

import { SplashScreen, type SplashScreenProps } from '../SplashScreen';

/**
 * Root-level splash gate.
 *
 * Mounts the real application tree immediately and paints the
 * [`SplashScreen`](src/components/SplashScreen/SplashScreen.tsx:1) **over** it as an
 * absolutely positioned overlay. When
 * [`useAppReadiness`](src/features/app/hooks/useAppReadiness.ts:1) reports
 * `isAppReady`, the overlay cross-fades its opacity `1 → 0` and then unmounts.
 *
 * ## Why an overlay, and not `if (loading) return <Splash />`
 *
 * A conditional early-return would mount the navigator only *after* readiness, so
 * the dashboard would begin its own first render — layout, list measurement, and
 * its own data subscriptions — exactly at the moment the fade starts. The user would
 * watch a fade-to-empty followed by content popping in behind it. Because the tree
 * here is mounted from the very first frame, the dashboard has already laid out
 * underneath the opaque splash by the time the fade begins, so the transition
 * reveals finished content instead of causing it. That is precisely the "no visual
 * flash or stutter" requirement.
 *
 * ## Why the fade cannot stutter
 *
 * `opacity` is a composited property, so the animation runs with
 * `useNativeDriver: true` entirely on the UI thread (Phase 3 P4). The JS thread is
 * at its busiest during exactly this window — finishing hydration and the initial
 * network fan-out — and a JS-driven fade would visibly hitch. A native-driver fade
 * cannot, because no JS frame is required to advance it.
 *
 * ## Pointer events during the fade
 *
 * The overlay keeps `pointerEvents="auto"` for the whole animation and is only
 * removed once the animation reports `finished`. Dropping pointer capture the moment
 * the fade starts would let a tap on a half-visible dashboard land on a control the
 * user cannot yet read — the classic "ghost tap" that opens a screen the user never
 * meant to open.
 */

/** Cross-fade duration. Normative: 300ms, opacity interpolation 1 → 0. */
export const SPLASH_FADE_DURATION_MS = 300;

export type AppBootGateProps = {
    /** The application tree rendered underneath the splash. */
    children: React.ReactNode;
    /**
     * Presentation forwarded verbatim to
     * [`SplashScreen`](src/components/SplashScreen/SplashScreen.tsx:1) — the logo
     * source or glyph, its size, and the accessible labels.
     *
     * The gate owns the *timing*; the splash owns the *appearance*. Forwarding one
     * grouped prop, rather than re-declaring each field here, keeps the two from
     * drifting when either gains an option.
     */
    splash?: Omit<SplashScreenProps, 'testID'>;
    testID?: string;
};

export function AppBootGate({ children, splash, testID }: AppBootGateProps): React.JSX.Element {
    const { isAppReady } = useAppReadiness();

    /**
     * `isHidden` is separate from `isAppReady` on purpose: readiness *starts* the
     * fade, removal *finishes* it. Collapsing the two would unmount the overlay at
     * the same instant the animation begins, producing a hard cut rather than a
     * cross-fade.
     */
    const [isHidden, setIsHidden] = useState(false);

    // Starts fully opaque. The splash is the first thing painted, and a value that
    // began below 1 would show the dashboard through it for the first frame.
    const opacity = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (!isAppReady) {
            return;
        }

        const animation = Animated.timing(opacity, {
            toValue: 0,
            duration: SPLASH_FADE_DURATION_MS,
            // Opacity is composited, so the whole fade runs off the JS thread.
            useNativeDriver: true,
        });

        // `finished` guards the unmount: a stopped or interrupted animation must not
        // remove the overlay mid-fade, or the dashboard would appear to cut in.
        animation.start(({ finished }) => {
            if (finished) {
                setIsHidden(true);
            }
        });

        return () => {
            animation.stop();
        };
    }, [isAppReady, opacity]);

    return (
        <View style={styles.root} testID={testID}>
            {/**
             * The app is mounted from frame one — see the note above on why this is
             * an overlay rather than a conditional render.
             */}
            {children}

            {isHidden ? null : (
                <Animated.View
                    // Covers the whole root view; the splash inside sizes itself to
                    // the physical window so the colour bleeds behind the status bar
                    // and the home indicator.
                    style={[StyleSheet.absoluteFill, { opacity }]}
                    // Kept interactive until the overlay is unmounted, so a tap
                    // mid-fade cannot reach a control the user cannot see yet.
                    pointerEvents="auto">
                    <SplashScreen {...splash} />
                </Animated.View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
    },
});

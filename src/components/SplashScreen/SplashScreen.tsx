import { ActivityIndicator, Image, StyleSheet, View, useWindowDimensions } from 'react-native';

import { BrandShieldGlyph, type IconComponent } from '../AppIcon';
import { spacing } from '../../theme/spacing';
import { useTheme } from '../../theme/useTheme';

import type { ImageSourcePropType } from 'react-native';

/**
 * App-level Splash / Loading screen.
 *
 * This is the **global root view**, not a screen inside the navigator: it is what
 * the process shows while the session is being validated and the first roster
 * requests are in flight (see
 * [`useAppReadiness`](src/features/app/hooks/useAppReadiness.ts:1)). It is
 * deliberately outside `NavigationContainer`, because a navigation mount is one of
 * the things it is waiting for.
 *
 * ## Why it is dimensioned rather than `flex: 1`
 *
 * A flex child is bounded by its parent, and at cold start the parent chain is the
 * native root view whose bounds are only known once the first layout pass completes.
 * Sizing the canvas from `useWindowDimensions()` instead means the coloured field
 * covers the **full physical window** — edge to edge, behind the status bar and the
 * home indicator — from the very first frame, and it is that full-screen value the
 * cross-fade dims down to reveal the dashboard through it.
 *
 * ## Why it ignores the safe area (on purpose)
 *
 * The rules for this screen deliberately invert Phase 3 P2 ("safe zones are
 * computed, never assumed"): the *content* is centred on the physical glass, and the
 * background is allowed to bleed under the system bars. A splash that respected the
 * inset would paint two dead bands — one under the status bar, one above the home
 * indicator — which is exactly the "unfinished canvas" artefact the full-bleed
 * treatment exists to remove. No `useSafeAreaInsets()` is read here, and none should
 * be added: the only element that must clear the status bar is the status bar's own
 * content, which belongs to the OS.
 *
 * ## Layout primitives (no web layout systems — Phase 3 P1)
 *
 * ```
 *   ┌───────────────────────────────────────────┐ ← full window width/height
 *   │              (status bar, over the bleed) │
 *   │                                           │
 *   │                ┌─────────┐                │
 *   │                │  LOGO   │                │ ← Element 1: Image / glyph
 *   │                └─────────┘                │
 *   │                   ↕ 24pt                  │ ← `spacing.xl` grid gap
 *   │                   ◜◝◜◝                    │
 *   │                 spinner                   │ ← Element 2: native indicator
 *   │                                           │
 *   │        (home indicator, over the bleed)   │
 *   └───────────────────────────────────────────┘
 * ```
 *
 * `justifyContent: 'center'` + `alignItems: 'center'` lock the column to the
 * geometric centre of that canvas. Vertical rhythm between the two elements is a
 * static `gap: spacing.xl` (24pt) rather than a margin on either child, so the
 * spacing cannot drift when one of them is swapped or measured differently.
 */

/** Structural grid gap between the logo and the spinner. */
export const SPLASH_ELEMENT_GAP = spacing.xl;

export type SplashScreenProps = {
    /**
     * The app logo **asset** — an `Image` source.
     *
     * Mutually exclusive with `logoGlyph`. Passed in rather than imported so the
     * presentation component carries no hard asset dependency: the wordmark can be
     * re-pointed per build flavour, and this file stays trivially testable without an
     * asset mock.
     */
    logoSource?: ImageSourcePropType;
    /**
     * Vector fallback for the logo, used when `logoSource` is absent.
     *
     * Defaults to [`BrandShieldGlyph`](src/components/AppIcon/glyphs.tsx:1) — the same
     * mark the Login hero renders — so the splash and the first authenticated screen
     * cannot disagree about the brand. The app currently ships no raster brand mark,
     * so this is the default path; supplying `logoSource` later changes only the
     * mark, never the layout, the 24pt gap or the fade.
     */
    logoGlyph?: IconComponent;
    /**
     * Intrinsic logo size in points. Both axes are forced equal from this single
     * value so the mark cannot be stretched by an off-ratio asset.
     */
    logoSize?: number;
    /** Accessible name for the logo. Omit only if the logo is purely decorative. */
    logoAccessibilityLabel?: string;
    /**
     * Caption announced to assistive tech (never rendered). A splash with a bare
     * spinner is silent to a screen reader otherwise.
     */
    accessibilityLabel?: string;
    testID?: string;
};

/** Default mark size — a hero-tier slot, independent of the icon presets. */
const DEFAULT_LOGO_SIZE = 96;

export function SplashScreen({
    logoSource,
    logoGlyph: LogoGlyph = BrandShieldGlyph,
    logoSize = DEFAULT_LOGO_SIZE,
    logoAccessibilityLabel,
    accessibilityLabel = 'Starting Staff Scheduler',
    testID,
}: SplashScreenProps): React.JSX.Element {
    const theme = useTheme();
    const { width, height } = useWindowDimensions();

    const logoIsLabelled = logoAccessibilityLabel !== undefined;

    return (
        <View
            testID={testID}
            // One accessible region for the whole splash: a screen reader hears
            // "Starting Staff Scheduler, progress" instead of two anonymous children.
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={accessibilityLabel}
            // The canvas is not a touch surface — taps must not be swallowed while
            // the app is still booting.
            pointerEvents="none"
            style={[
                styles.canvas,
                {
                    width,
                    height,
                    // Deep Ocean Blue brand token: `primary` in light, and the
                    // scheme-aware equivalent in dark. No literal hex.
                    backgroundColor: theme.colors.primary,
                },
            ]}>
            {logoSource !== undefined ? (
                <Image
                    source={logoSource}
                    accessible={logoIsLabelled}
                    accessibilityRole={logoIsLabelled ? 'image' : undefined}
                    accessibilityLabel={logoAccessibilityLabel}
                    // A single dimension for both axes: an asset with an off-ratio
                    // intrinsic size must still occupy an exact square, so the row
                    // below cannot inherit a fractional offset.
                    resizeMode="contain"
                    style={{ width: logoSize, height: logoSize }}
                />
            ) : (
                /**
                 * Vector fallback, occupying the identical square. Colour is
                 * `textInverse` — the fixed light neutral — because the canvas behind
                 * it is brand blue in **both** schemes, so a scheme-relative tint
                 * would go dark-on-dark in dark mode.
                 */
                <View
                    style={{ width: logoSize, height: logoSize }}
                    accessible={logoIsLabelled}
                    accessibilityRole={logoIsLabelled ? 'image' : undefined}
                    accessibilityLabel={logoAccessibilityLabel}>
                    <LogoGlyph size={logoSize} color={theme.colors.textInverse} />
                </View>
            )}

            <ActivityIndicator
                // The native, platform-optimised indicator (UIActivityIndicatorView
                // on iOS, a native progress drawable on Android) — no JS frame loop,
                // so the spinner keeps turning while the JS thread is busy hydrating.
                size="large"
                // High-contrast neutral on top of `colors.primary`. Not a scheme
                // colour: the canvas behind it is brand blue in *both* schemes, so
                // the tint must be the fixed light neutral to stay vivid.
                color={theme.colors.textInverse}
                // The parent already owns the accessible label.
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
            />
        </View>
    );
}

const styles = StyleSheet.create({
    canvas: {
        // Mobile alignment primitives — the inner column is locked to the exact
        // geometric centre of the physical screen on both axes.
        alignItems: 'center',
        justifyContent: 'center',
        // Static 8pt-grid gap; a margin on either child would be measured
        // differently by the two platforms once an asset is involved.
        gap: SPLASH_ELEMENT_GAP,
    },
});

import {
    darkColors,
    lightColors,
    palette,
    type ColorSchemeName,
    type Colors,
} from './colors';
import { createGradients } from './gradients';
import { haptics } from './haptics';
import { motion } from './motion';
import { radius, radiusRoles, componentRadius } from './radius';
import { shadows, elevationSpecs, darkElevation } from './shadows';
import { sizing } from './sizing';
import { spacing, screenGutter, insets, GRID_UNIT } from './spacing';
import { typography } from './typography';

/**
 * The application theme.
 *
 * Shape
 * -----
 * One theme per colour scheme, built by the same factory so the two are
 * guaranteed to have identical structure. `Theme` is the type of the *result*,
 * which means every component that typed against the old single theme object
 * still typechecks — it just resolves to whichever scheme is active.
 *
 * Usage:
 *   `theme.spacing.md`, `theme.colors.textSecondary`,
 *   `theme.typography.variants.headerMedium`, `theme.shadows.low`.
 *
 * Why a plain object and not a React context holds the tokens
 * -----------------------------------------------------------
 * The token *values* are static data, so they live outside React. Only the
 * *selection* between them is reactive, and that selection happens in
 * [`useTheme`](src/theme/useTheme.ts:1) via the OS colour-scheme signal. This
 * keeps tokens importable from non-render code (navigation options, style
 * factories) while still allowing a component to re-render on scheme change.
 *
 * Typography note: variant colours are pinned to the *light* palette inside
 * [`typography.ts`](src/theme/typography.ts:1) because a text style is a static
 * constant. Components that need scheme-correct text colour either let
 * `AppText` apply the scheme's `colors.text*` tokens, or pass an explicit
 * `color` token — see [`AppText`](src/components/AppText/AppText.tsx:1).
 */

/** Everything that is identical across colour schemes. */
const sharedTokens = {
    palette,
    spacing,
    screenGutter,
    insets,
    gridUnit: GRID_UNIT,
    radius,
    radiusRoles,
    componentRadius,
    shadows,
    elevationSpecs,
    sizing,
    typography,
    /** Duration/easing/spring tokens for micro-interactions. */
    motion,
    /** Semantic → trigger haptic mapping. */
    haptics,
} as const;

/**
 * Builds a complete theme for one colour scheme.
 *
 * The return type is annotated rather than inferred so that `lightTheme` and
 * `darkTheme` are structurally identical objects — `Theme` is derived from the
 * light build, and both must satisfy it. Annotating also prevents `as const`
 * from narrowing `colors` back down to whichever literal hexes were passed in.
 */
function createTheme(scheme: ColorSchemeName, colors: Colors): {
    scheme: ColorSchemeName;
    isDark: boolean;
    colors: Colors;
    darkElevation: typeof darkElevation;
    gradients: ReturnType<typeof createGradients>;
} & typeof sharedTokens {
    return {
        scheme,
        isDark: scheme === 'dark',
        colors,
        ...sharedTokens,
        /**
         * Gradient presets are built *from this scheme's* colour tokens, so they
         * re-tint automatically in dark mode. Built inside the factory rather than
         * declared as a constant precisely so there is no second place to keep in
         * sync with the palette.
         */
        gradients: createGradients(colors),
        /**
         * Dark-specific elevation guidance (rings instead of shadows). Present on
         * both schemes so call sites can read it without branching; consumers on
         * the light scheme simply ignore it.
         */
        darkElevation,
    };
}

/** Light theme — the default appearance. */
export const lightTheme = createTheme('light', lightColors);

/** Dark theme — Deep Ocean Blue on charcoal slate. */
export const darkTheme = createTheme('dark', darkColors);

export type Theme = typeof lightTheme;

/**
 * Backwards-compatible default export of the theme.
 *
 * Pre-existing code imports `theme` directly for non-reactive reads (style
 * factories, navigation screen options). That contract is preserved: `theme` is
 * the light scheme. Render-path code should use
 * [`useTheme`](src/theme/useTheme.ts:1) so it follows the OS preference.
 */
export const theme = lightTheme;

/** Resolves a full theme object for an explicit colour scheme. */
export function themeFor(scheme: 'light' | 'dark' | null | undefined): Theme {
    return scheme === 'dark' ? darkTheme : lightTheme;
}

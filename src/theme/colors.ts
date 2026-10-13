/**
 * Colour tokens — "Deep Ocean Blue" brand system.
 *
 * Architecture
 * ------------
 * There are three layers, and every layer has exactly one job:
 *
 *  1. `oceanBlue` / `neutral` / `semantic` — raw ramps. Primitives only; no
 *     component may import these directly. They exist so that a shade can be
 *     referenced twice (e.g. `brand[600]` as both `primaryPressed` and
 *     `textLink`) without duplicating a hex literal.
 *  2. `lightColors` / `darkColors` — the *semantic* token maps. Same key set,
 *     two values. This is the only place a colour scheme is expressed.
 *  3. `palette` — scheme-independent hues used for data (leave-type dots) plus
 *     the raw ramps, exposed for tooling.
 *
 * Light and dark are **structurally identical**: `DarkColors` is
 * `{ [K in keyof Colors]: string }`, so adding a token to light without adding a
 * dark override is a compile error, not a ship-time surprise.
 *
 * Conventions
 * -----------
 * - Colours are 6/8-digit hex or `rgba()` strings. Both are understood natively
 *   by React Native on iOS and Android; no CSS colour functions are used.
 * - Every foreground/background pair used by [`AppText`](src/components/AppText/AppText.tsx:1)
 *   and the shared components clears WCAG AA (>= 4.5:1) at body size, and AA
 *   Large (>= 3:1) for the muted/disabled tiers which are never used for
 *   essential reading.
 */

import { darkColorTokens, lightColorTokens } from './tokens';

/* ------------------------------------------------------------------ *
 * Layer 1 — raw ramps (primitives)
 * ------------------------------------------------------------------ */

/**
 * Deep Ocean Blue brand ramp.
 *
 * `500` is the brand anchor: a saturated but desaturated-enough navy-blue that
 * holds AA contrast against white while still reading as "confident" rather than
 * "corporate default blue". The `50`–`200` end is tinted toward cyan so
 * backgrounds derived from it feel like water rather than lavender.
 */
const oceanBlue = {
    50: lightColorTokens.primarySoft,
    100: '#D3E6F5',
    200: '#A8CDEC',
    300: '#6FABDE',
    400: '#3D86CC',
    500: lightColorTokens.primary,
    600: lightColorTokens.primaryPressed,
    700: '#0F406B',
    800: '#0C3355',
    900: '#082542',
} as const;

/**
 * Vibrant accent blue — used for interactive emphasis (links, active tab,
 * selection affordances). Deliberately brighter than `oceanBlue[500]` so it can
 * carry a 2pt focus ring against either the page background or a filled brand
 * button without disappearing into it.
 */
const accentBlue = {
    300: '#7FC4F5',
    400: '#47A6EC',
    500: '#1E8FE0',
    600: '#1571B8',
    700: '#115A93',
} as const;

/**
 * Neutral ramp.
 *
 * `0` and `1000` are reserved as *true* endpoints (pure white / near-black) for
 * use in the light and dark schemes respectively. Surfaces in dark mode never
 * use `1000`: they start at `900` so shadows have something to fall onto.
 */
const neutral = {
    0: lightColorTokens.surface,
    25: '#FCFDFE',
    50: lightColorTokens.surfaceRaised,
    100: lightColorTokens.surfaceMuted,
    200: lightColorTokens.borderHairline,
    300: '#CBD5E1',
    400: '#94A3B8',
    500: lightColorTokens.inkTertiary,
    600: lightColorTokens.inkSecondary,
    700: '#334155',
    800: '#1E293B',
    900: lightColorTokens.inkPrimary,
    950: '#0D141F',
    1000: '#080C14',
} as const;

/**
 * Deep slate/charcoal tones used to build the dark scheme's surfaces.
 *
 * Kept as a separate ramp from `neutral` because dark surfaces are not simply
 * "inverted neutrals": they carry a faint blue cast (matching the brand hue) so
 * a dark screen looks like the same product rather than a generic grey theme.
 */
const slate = {
    50: '#94A3B8',
    100: '#7C8BA3',
    200: '#5C6B84',
    300: '#45536A',
    400: '#333F53',
    500: '#263243',
    600: '#1E2836',
    700: '#19222E',
    800: '#141C26',
    900: '#101720',
    950: '#0B1017',
} as const;

/**
 * Semantic state ramps.
 *
 * Each state provides a `soft` (tinted background), `base` (the ink/dot colour,
 * AA against `soft`) and `strong` (AA against `soft` for emphasis). "Denied" is
 * a brick red rather than a pure signal red: on a shift-management app a hard
 * `#FF0000` reads as a system error, not a declined leave request.
 */
const semantic = {
    success: {
        soft: lightColorTokens.successSoft,
        base: lightColorTokens.success,
        strong: '#0A6B4A',
    },
    warning: {
        soft: lightColorTokens.warningSoft,
        base: lightColorTokens.warning,
        strong: '#8F5E15',
    },
    danger: {
        soft: lightColorTokens.dangerSoft,
        base: lightColorTokens.danger,
        strong: '#9B2721',
    },
    info: {
        soft: lightColorTokens.infoSoft,
        base: lightColorTokens.info,
        strong: lightColorTokens.primaryPressed,
    },
} as const;

/** Dark-scheme semantic ramps — tinted up so they read on slate, not on white. */
const semanticDark = {
    success: {
        soft: darkColorTokens.successSoft,
        base: darkColorTokens.success,
        strong: '#86EFAC',
    },
    warning: {
        soft: darkColorTokens.warningSoft,
        base: darkColorTokens.warning,
        strong: '#FCD34D',
    },
    danger: {
        soft: darkColorTokens.dangerSoft,
        base: darkColorTokens.danger,
        strong: '#FCA5A5',
    },
    info: {
        soft: darkColorTokens.infoSoft,
        base: darkColorTokens.info,
        strong: '#93C5FD',
    },
} as const;

/* ------------------------------------------------------------------ *
 * Layer 2 — semantic tokens
 * ------------------------------------------------------------------ */

/**
 * The semantic token contract.
 *
 * Declared explicitly — with `string` values, not inferred hex literals — so
 * that `lightColors` and `darkColors` are two *implementations* of one
 * interface rather than two unrelated objects. Components read through this
 * key set, so it is stable and scheme-independent by construction; adding a key
 * here forces both schemes to supply it.
 */
export interface Colors {
    /* ---- Structure ---- */
    background: string;
    surface: string;
    surfaceMuted: string;
    surfaceSunken: string;
    surfaceInverse: string;

    border: string;
    borderStrong: string;
    divider: string;
    /**
     * Hairline rule for separating rows *within* a container. Sits at 0.5–1px and
     * is intentionally fainter than `divider` so a grouped card reads as one
     * surface rather than a stack of boxed rows.
     */
    hairline: string;
    /**
     * The 2026 spec's border token. In dark mode this is the *primary separator*
     * — it replaces shadows entirely, so every elevated component (cards, FAB,
     * tab bar, sticky bars) carries a 1px border in this colour.
     */
    borderHairline: string;

    /* ---- Glass / focus (Soft-UI refinement) ---- */
    /** Translucent fill laid over a blur to build a glassmorphism surface. */
    glassSurface: string;
    /** Lit top edge on a glass surface; substitutes for a shadow on blur. */
    glassBorder: string;
    /** Halo drawn outside a focused control. Accent-tinted, never opaque. */
    focusRing: string;

    /* ---- Text: four contrast tiers ---- */
    text: string;
    textSecondary: string;
    textMuted: string;
    textDisabled: string;
    textInverse: string;
    textLink: string;

    /* ---- Brand / interactive ---- */
    primary: string;
    primaryPressed: string;
    primaryDisabled: string;
    primarySoft: string;
    primaryBorder: string;
    accent: string;
    accentPressed: string;
    onPrimary: string;

    secondary: string;
    secondaryPressed: string;
    onSecondary: string;

    /* ---- Semantic states ---- */
    success: string;
    successSoft: string;
    successStrong: string;

    warning: string;
    warningSoft: string;
    warningStrong: string;

    danger: string;
    dangerSoft: string;
    dangerStrong: string;
    onDanger: string;

    info: string;
    infoSoft: string;
    infoStrong: string;

    /* ---- Gradient stops ---- */
    /**
     * Gradient endpoints are semantic tokens, not raw hexes, so a gradient built
     * from them re-tints automatically in dark mode. Consumed by
     * [`gradients.ts`](src/theme/gradients.ts:1).
     */
    gradientPrimaryFrom: string;
    gradientPrimaryTo: string;
    gradientSurfaceFrom: string;
    gradientSurfaceTo: string;

    /* ---- Utility ---- */
    overlay: string;
    skeleton: string;
    skeletonHighlight: string;
    shadowTint: string;
}

/**
 * The light scheme.
 *
 * Annotated `satisfies Colors` rather than `as const`: it keeps literal hex
 * types (so editors can autocomplete `'#1B5FA8'`) while being validated against
 * the contract above.
 */
export const lightColors = {
    /* ---- Structure -------------------------------------------------- */

    /** App canvas. Soft blue-tinted white so elevated surfaces read as raised. */
    background: neutral[50],
    /** Raised surface: cards, sheets, inputs, tab bar, app header. */
    surface: neutral[0],
    /** Secondary surface for pressed states, inert fills, unselected chips. */
    surfaceMuted: neutral[100],
    /** Grouped/sectioned list well — sits *below* `surface`. */
    surfaceSunken: neutral[200],
    /** Inverted surface, e.g. a dark toast or keyboard-accessory bar. */
    surfaceInverse: neutral[900],

    border: neutral[200],
    borderStrong: neutral[300],
    divider: neutral[200],
    /** Fainter than `divider` — intra-card row separators. */
    hairline: 'rgba(15, 23, 42, 0.08)',
    /** The 2026 spec's border token — the light scheme's `#E4E9F0`. */
    borderHairline: lightColorTokens.borderHairline,

    /* ---- Glass / focus ------------------------------------------------ */

    /** Frosted white; pairs with `BlurView` for the sheet/overlay surface. */
    glassSurface: 'rgba(255, 255, 255, 0.72)',
    /** Bright top edge so glass reads as lit without a drop shadow. */
    glassBorder: 'rgba(255, 255, 255, 0.55)',
    /** Accent-tinted focus halo. */
    focusRing: 'rgba(30, 143, 224, 0.45)',

    /* ---- Text: four tiers of contrast ---------------------------------- */

    /** Tier 1 — headings and primary row content. 15.9:1 on `surface`. */
    text: neutral[900],
    /** Tier 2 — supporting copy, field labels. 7.5:1 on `surface`. */
    textSecondary: neutral[600],
    /** Tier 3 — placeholders, metadata, timestamps. 4.8:1 on `surface`. */
    textMuted: neutral[500],
    /** Tier 4 — disabled/no-op affordances only. 2.9:1, never essential. */
    textDisabled: neutral[400],
    /** Foreground on `primary`/`danger`/`surfaceInverse`. */
    textInverse: neutral[0],
    /** Inline links and text-styled buttons. */
    textLink: oceanBlue[600],

    /* ---- Brand / interactive ---------------------------------------- */

    /** Brand primary — filled buttons, active tab, selected chip. */
    primary: oceanBlue[500],
    primaryPressed: oceanBlue[600],
    primaryDisabled: oceanBlue[200],
    /** Tinted brand wash: unread rows, focus halos, selected day cells. */
    primarySoft: oceanBlue[50],
    /** Richer brand tint for borders on `primarySoft`. */
    primaryBorder: oceanBlue[200],
    /** Vibrant accent used where the brand blue would be too heavy. */
    accent: accentBlue[500],
    accentPressed: accentBlue[600],
    /** Label/icon colour that sits on top of `primary`. */
    onPrimary: neutral[0],

    /** Neutral secondary button. */
    secondary: neutral[100],
    secondaryPressed: neutral[200],
    onSecondary: neutral[800],

    /* ---- Semantic states -------------------------------------------- */

    success: semantic.success.base,
    successSoft: semantic.success.soft,
    successStrong: semantic.success.strong,

    warning: semantic.warning.base,
    warningSoft: semantic.warning.soft,
    warningStrong: semantic.warning.strong,

    danger: semantic.danger.base,
    dangerSoft: semantic.danger.soft,
    dangerStrong: semantic.danger.strong,
    onDanger: neutral[0],

    info: semantic.info.base,
    infoSoft: semantic.info.soft,
    infoStrong: semantic.info.strong,

    /* ---- Gradient stops ------------------------------------------------ */

    /** Brand gradient: deep ocean → vibrant accent. */
    gradientPrimaryFrom: oceanBlue[500],
    gradientPrimaryTo: accentBlue[500],
    /** Subtle surface gradient for hero cards. */
    gradientSurfaceFrom: neutral[0],
    gradientSurfaceTo: neutral[50],

    /* ---- Utility ------------------------------------------------------- */

    /** Scrim behind modals and bottom sheets. */
    overlay: 'rgba(11, 16, 23, 0.48)',
    /** Skeleton placeholder fill and its moving highlight. */
    skeleton: neutral[200],
    skeletonHighlight: neutral[100],
    /** Hairline used for the soft "elevation" ring on cards. */
    shadowTint: neutral[900],
} as const satisfies Colors;

/**
 * Dark scheme.
 *
 * The mapped type is the point: dark mode is not a runtime `switch` over a
 * partial override, it is a *total* mirror. A token added to `lightColors` and
 * forgotten here fails `tsc`.
 *
 * Surface strategy: charcoal-slate (`slate[700]`/`slate[800]`) rather than pure
 * black. Pure black kills shadow contrast entirely — a shadow can only be read
 * against something lighter than itself — so the lowest surface is `slate[950]`
 * and elevations climb from there.
 */
export const darkColors: { [K in keyof Colors]: string } = {
    /* ---- Structure -------------------------------------------------- */

    /** Canvas — deepest surface. Not pure black, so elevation still registers. */
    background: darkColorTokens.background,
    /** Raised surface. One step up from the canvas = perceptible elevation. */
    surface: darkColorTokens.surface,
    /** Pressed/inert fill — sits between `surface` and `background`. */
    surfaceMuted: darkColorTokens.surfaceMuted,
    /** Sectioned well, *below* the canvas in luminance terms. */
    surfaceSunken: slate[900],
    /** Inverted surface: light in dark mode, for a high-contrast toast. */
    surfaceInverse: neutral[100],

    border: slate[500],
    borderStrong: slate[400],
    divider: slate[600],
    /** Fainter than `divider` — intra-card row separators. */
    hairline: 'rgba(255, 255, 255, 0.10)',
    /**
     * The 2026 spec's border token. In dark mode this is the *primary separator*
     * — it replaces shadows entirely, so every elevated component carries a 1px
     * border in this colour.
     */
    borderHairline: darkColorTokens.borderHairline,

    /* ---- Glass / focus ------------------------------------------------ */

    /** Frosted slate; the dark counterpart of the light glass fill. */
    glassSurface: 'rgba(20, 28, 38, 0.62)',
    /** Light top edge on dark glass. */
    glassBorder: 'rgba(255, 255, 255, 0.12)',
    /** Accent-tinted focus halo, lifted for contrast on slate. */
    focusRing: 'rgba(71, 166, 236, 0.55)',

    /* ---- Text: mirrors the four light-mode tiers ----------------------- */

    /** Tier 1. AA on `surface`. */
    text: darkColorTokens.inkPrimary,
    /** Tier 2 — slightly desaturated so it recedes without going grey. */
    textSecondary: darkColorTokens.inkSecondary,
    /** Tier 3 — placeholders and metadata. */
    textMuted: darkColorTokens.inkTertiary,
    /** Tier 4 — disabled only. Never used for essential reading. */
    textDisabled: slate[200],
    /** Foreground on `primary`/`danger`. Dark mode brand fills stay dark-ish. */
    textInverse: neutral[0],
    /** Links — lifted into the accent ramp to stay legible on slate. */
    textLink: accentBlue[300],

    /* ---- Brand / interactive ---------------------------------------- */

    primary: darkColorTokens.primary,
    primaryPressed: darkColorTokens.primaryPressed,
    primaryDisabled: oceanBlue[700],
    primarySoft: darkColorTokens.primarySoft,
    primaryBorder: oceanBlue[700],
    accent: accentBlue[400],
    accentPressed: accentBlue[300],
    onPrimary: neutral[1000],

    secondary: slate[600],
    secondaryPressed: slate[500],
    onSecondary: neutral[50],

    /* ---- Semantic states -------------------------------------------- */

    success: semanticDark.success.base,
    successSoft: semanticDark.success.soft,
    successStrong: semanticDark.success.strong,

    warning: semanticDark.warning.base,
    warningSoft: semanticDark.warning.soft,
    warningStrong: semanticDark.warning.strong,

    danger: semanticDark.danger.base,
    dangerSoft: semanticDark.danger.soft,
    dangerStrong: semanticDark.danger.strong,
    onDanger: neutral[1000],

    info: semanticDark.info.base,
    infoSoft: semanticDark.info.soft,
    infoStrong: semanticDark.info.strong,

    /* ---- Gradient stops ------------------------------------------------ */

    /** Brand gradient re-tinted for slate: lighter blue → lighter accent. */
    gradientPrimaryFrom: oceanBlue[400],
    gradientPrimaryTo: accentBlue[400],
    /** Subtle surface gradient for hero cards. */
    gradientSurfaceFrom: slate[800],
    gradientSurfaceTo: slate[900],

    /* ---- Utility ------------------------------------------------------- */

    /** Heavier scrim: dark-on-dark needs more separation than light-on-light. */
    overlay: 'rgba(0, 0, 0, 0.62)',
    skeleton: slate[700],
    skeletonHighlight: slate[600],
    /** Shadows are always black; only the opacity changes per scheme. */
    shadowTint: '#000000',
} as const;

/* ------------------------------------------------------------------ *
 * Layer 3 — palette (scheme-independent)
 * ------------------------------------------------------------------ */

/**
 * Raw ramps plus fixed data hues. Nothing in the app should read this for UI
 * chrome — `useTheme().colors` is the supported entry point.
 */
export const palette = {
    oceanBlue,
    accentBlue,
    neutral,
    slate,
    semantic,
    semanticDark,
    /**
     * Fixed hues used for leave-type / status dots that arrive from the API as a
     * `color` field. These must stay scheme-independent so a calendar does not
     * change meaning when the user toggles dark mode.
     */
    accents: {
        teal: '#0F766E',
        violet: '#6D28D9',
        pink: '#BE185D',
        amber: '#B45309',
        slate: '#475569',
    },
} as const;

/**
 * Backwards-compatible alias for the light scheme.
 *
 * Retained because the pre-existing modules and tests import `colors` by name.
 * New code should prefer `lightColors` / `darkColors` / `colorsFor(scheme)`.
 */
export const colors = lightColors;

/** Resolves a token map for an explicit colour scheme. */
export function colorsFor(scheme: 'light' | 'dark' | null | undefined): Colors {
    return scheme === 'dark' ? (darkColors as Colors) : (lightColors as Colors);
}

export type ColorSchemeName = 'light' | 'dark';

import { Platform, type ViewStyle } from 'react-native';

import { darkShadowTokens, shadowTokens } from './tokens';

/**
 * Elevation tokens — "soft elevation".
 *
 * Philosophy
 * ----------
 * Shadows here describe *depth*, not decoration. A surface gets a shadow
 * because it floats above the page (header, sheet, FAB, popover) — static cards
 * on a scroll view use a hairline border plus a slightly lighter surface
 * instead. Overshadowing is the fastest way to make a business app look dated.
 *
 * Modelling
 * ---------
 * Every tier is defined as *numbers*, not as a CSS string, so the same
 * definition can be handed to either platform's native shadow API:
 *
 *   - iOS     → `shadowColor` / `shadowOffset {width,height}` / `shadowRadius` /
 *               `shadowOpacity`. All point-based; the offset and radius are
 *               real pt values, and opacity is a 0–1 float.
 *   - Android → `elevation<f>` plus `shadowColor`. Android derives the blur and
 *               offset from the elevation integer and the view's Z position, so
 *               only the elevation step and the tint are forwarded.
 *
 * `blurRadius` and `offsetY` are declared once in `elevationSpecs` — the
 * mathematical source of truth — and then *translated* per platform below. No
 * call site ever branches on `Platform.OS`.
 *
 * Depth reads as: bigger offset + bigger blur + lower opacity = further away.
 * The opacity ceiling is deliberately low (max 0.14) because a hard shadow on a
 * light blue canvas looks like a rendering artefact.
 */

/** The numeric description of one elevation tier, before platform translation. */
export type ElevationSpec = {
    /** Vertical offset in points. 0 = light from directly above (subtle). */
    offsetY: number;
    /** Horizontal offset in points. Non-zero implies a directional light source. */
    offsetX: number;
    /** Blur / spread radius in points. iOS `shadowRadius`. */
    blurRadius: number;
    /** Opacity of the shadow ink, 0–1. Low by design. */
    opacity: number;
    /** Android `elevation` in dp — drives both the shadow and the z-order. */
    androidElevation: number;
};

/**
 * The elevation scale.
 *
 * `low`   — a resting card that needs to separate from the canvas: 2pt drop,
 *           6pt blur, 6% ink. Barely perceptible, which is the point.
 * `medium`— a header or sticky element sitting above scrolling content: 4/12/9%.
 * `high`  — a bottom sheet, dialog or FAB, which must clearly own the top layer:
 *           8/20/14%.
 */
export const elevationSpecs = {
    /** Flush with the page: list rows, sectioned content. */
    none: {
        offsetX: 0,
        offsetY: 0,
        blurRadius: 0,
        opacity: 0,
        androidElevation: 0,
    },
    /**
     * Micro — the subtlest possible lift. Added for the modernised card style:
     * a resting card on a soft canvas should separate from the background
     * without the shadow ever being consciously visible.
     */
    micro: {
        offsetX: 0,
        offsetY: 1,
        blurRadius: 3,
        opacity: 0.05,
        androidElevation: 1,
    },
    /** Resting card / focused input. */
    low: {
        offsetX: 0,
        offsetY: 2,
        blurRadius: 6,
        opacity: 0.06,
        androidElevation: 2,
    },
    /** Sticky header, tab bar, popover. */
    medium: {
        offsetX: 0,
        offsetY: 4,
        blurRadius: 12,
        opacity: 0.09,
        androidElevation: 6,
    },
    /** Bottom sheet, modal, FAB. */
    high: {
        offsetX: 0,
        offsetY: 8,
        blurRadius: 20,
        opacity: 0.14,
        androidElevation: 12,
    },
    /**
     * Glass — a blurred panel floating above scrolling content. Larger blur and
     * offset than `high` so the blur reads as *depth* rather than as a border,
     * which is what separates glassmorphism from a translucent rectangle.
     */
    glass: {
        offsetX: 0,
        offsetY: 12,
        blurRadius: 28,
        opacity: 0.16,
        androidElevation: 14,
    },
} as const satisfies Record<string, ElevationSpec>;

export type ElevationTier = keyof typeof elevationSpecs;

/**
 * Shadow ink. iOS has no ambient-occlusion model, so a shadow must be told what
 * colour it is; near-black with a blue cast matches the palette's neutrals and
 * avoids the muddy brown that pure black produces over a blue-tinted canvas.
 * Android is handed the same tint, which it honours on API 28+.
 */
const SHADOW_INK = shadowTokens.shadowCard.shadowColor;

/**
 * Translates a spec into the platform's native shadow props.
 *
 * Only the properties the platform actually consumes are emitted, so a stray
 * `shadowOffset` never reaches an Android view (where it is ignored but
 * confusing in a style diff).
 */
function resolveElevation(spec: ElevationSpec): ViewStyle {
    if (Platform.OS === 'android') {
        // Android draws the shadow itself. `elevation` also establishes the
        // z-order that shadow-casting depends on.
        return {
            elevation: spec.androidElevation,
            shadowColor: SHADOW_INK,
        } as ViewStyle;
    }

    // iOS (and the web/test renderer, which simply carries the values through).
    return {
        shadowColor: SHADOW_INK,
        shadowOffset: { width: spec.offsetX, height: spec.offsetY },
        shadowOpacity: spec.opacity,
        shadowRadius: spec.blurRadius,
    } as ViewStyle;
}

/**
 * Ready-to-spread elevation styles.
 *
 * Both the new tier names and the original `sm`/`md`/`lg` names are exported,
 * pointing at the same resolved objects, so existing call sites
 * (`theme.shadows.sm` in [`AppHeader`](src/components/AppHeader/AppHeader.tsx:1))
 * keep working unchanged.
 */
export const shadows = {
    /**
     * Card — the 2026 spec's resting-card shadow. Carries both the iOS
     * `shadow*` props and the Android `elevation` integer, so a call site
     * spreads it and never branches on `Platform.OS`.
     */
    card: shadowTokens.shadowCard,
    /**
     * Float — the 2026 spec's floating-surface shadow (sheet, dialog, FAB).
     */
    float: shadowTokens.shadowFloat,

    /** No shadow — for content that sits flat on the canvas. */
    none: resolveElevation(elevationSpecs.none),
    /** Micro lift — resting cards in the refined style. */
    micro: resolveElevation(elevationSpecs.micro),
    /** Low elevation. Legacy alias: `sm`. */
    low: resolveElevation(elevationSpecs.low),
    /** Medium elevation. Legacy alias: `md`. */
    medium: resolveElevation(elevationSpecs.medium),
    /** High elevation. Legacy alias: `lg`. */
    high: resolveElevation(elevationSpecs.high),
    /** Glass panel — blur-backed surface above scrolling content. */
    glass: resolveElevation(elevationSpecs.glass),

    /* ---- Legacy aliases (pre-Phase-1 names) ---- */
    xs: resolveElevation(elevationSpecs.micro),
    sm: resolveElevation(elevationSpecs.low),
    md: resolveElevation(elevationSpecs.medium),
    lg: resolveElevation(elevationSpecs.high),
} as const;

export type Shadows = typeof shadows;
export type ShadowLevel = keyof typeof shadows;

/**
 * A scheme's elevation set, widened to `ViewStyle` values.
 *
 * `Shadows` is derived from the light object and therefore carries literal hex
 * types; a dark set cannot satisfy those literals. This mapped type keeps the
 * same key set while allowing each tier to resolve to a different (zeroed)
 * style, which is what lets `theme.shadows[elevated]` be spread identically in
 * both schemes.
 */
export type ShadowSet = { [K in ShadowLevel]: ViewStyle };

/**
 * Dark-mode elevation.
 *
 * Every tier is zeroed: `shadowOpacity: 0` and `elevation: 0`. A drop shadow is
 * only visible when it is darker than the surface it falls on, and in dark mode
 * a raised surface is *lighter* than the canvas — so a shadow is invisible no
 * matter how strong. The 2026 spec compensates by giving every elevated
 * component a 1px `borderHairline` border instead (see
 * [`AppCard`](src/components/AppCard/AppCard.tsx:1), the tab bar and the FAB).
 *
 * The key set mirrors [`shadows`](src/theme/shadows.ts:1) exactly, so a call
 * site spreads `theme.shadows[elevated]` and gets the correct treatment per
 * scheme with no branch of its own.
 */
export const darkShadows: ShadowSet = {
    card: darkShadowTokens.shadowCard,
    float: darkShadowTokens.shadowFloat,

    none: resolveElevation(elevationSpecs.none),
    micro: resolveElevation(elevationSpecs.none),
    low: resolveElevation(elevationSpecs.none),
    medium: resolveElevation(elevationSpecs.none),
    high: resolveElevation(elevationSpecs.none),
    glass: resolveElevation(elevationSpecs.none),

    xs: resolveElevation(elevationSpecs.none),
    sm: resolveElevation(elevationSpecs.none),
    md: resolveElevation(elevationSpecs.none),
    lg: resolveElevation(elevationSpecs.none),
} as const;

/** Resolves the elevation set for an explicit scheme. */
export function shadowsFor(scheme: 'light' | 'dark' | null | undefined): ShadowSet {
    return scheme === 'dark' ? darkShadows : shadows;
}

/**
 * Dark-mode elevation.
 *
 * A shadow is only visible when it is darker than what it falls on. In dark mode
 * a raised surface is *lighter* than the canvas, so a drop shadow would be
 * invisible no matter how strong. The dark alternative is to lighten the
 * surface and describe the edge with a hairline ring, which is what these tokens
 * express.
 *
 * `ring` is the colour a raised dark surface should be bordered with; it is the
 * dark scheme's equivalent of turning a shadow up.
 */
export const darkElevation = {
    /** Raise the surface by one ramp step instead of casting a shadow. */
    surfaceLift: 1,
    /** Hairline ring colour that reads as a lit top edge on slate. */
    ring: 'rgba(255, 255, 255, 0.08)',
    /** Slightly stronger ring for the highest layer (modals/FABs). */
    ringStrong: 'rgba(255, 255, 255, 0.14)',
    /** Dark shadows are still useful when a surface floats over *content*. */
    scrimShadow: 'rgba(0, 0, 0, 0.55)',
} as const;

export type DarkElevation = typeof darkElevation;

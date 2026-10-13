/**
 * Design tokens — the single source of truth for the 2026 design system.
 *
 * Why this file exists
 * --------------------
 * Before this module the app carried two competing brand blues (`#1E5AA8` and
 * `#2E5FA3`), ad-hoc shadow objects declared inline in screens, and a spacing
 * scale that mixed an 8pt grid with one-off 20pt gutters. Every one of those is
 * a place where two screens can silently disagree.
 *
 * This file is the *only* place a raw value is written down. Every other theme
 * module ([`colors`](src/theme/colors.ts:1), [`spacing`](src/theme/spacing.ts:1),
 * [`radius`](src/theme/radius.ts:1), [`shadows`](src/theme/shadows.ts:1),
 * [`typography`](src/theme/typography.ts:1)) imports from here and re-exports a
 * shaped view of it, so a value can be changed once and every screen follows.
 *
 * Layers
 * ------
 *  1. **Primitive tokens** — `colorTokens`, `radiusTokens`, `spacingTokens`,
 *     `typographyTokens`, `shadowTokens`. Raw, scheme-independent values.
 *  2. **Semantic maps** — `lightColorTokens` / `darkColorTokens` implement the
 *     same `ColorTokens` contract, so a token added to one scheme must be added
 *     to the other or `tsc` fails.
 *  3. **Helpers** — [`getStatusPill`](src/theme/tokens.ts:1) turns a status enum
 *     into the `{ bg, fg }` pair the status pill spec requires.
 *  4. **Provider** — `ThemeProvider` / `useThemeTokens` expose the active token
 *     set through React context for components that prefer a provider over the
 *     OS-scheme hook in [`useTheme`](src/theme/useTheme.ts:1).
 *
 * Conventions
 * -----------
 *  - Colours are 6/8-digit hex or `rgba()` strings; both are understood natively
 *    by React Native on iOS and Android.
 *  - Spacing is a strict 4pt grid. `screenPadding` (20) is the one global
 *    horizontal gutter every screen shares.
 *  - Typography uses the platform system font (SF Pro / Roboto). No bundled
 *    face, so the OS font-size accessibility setting is honoured for free.
 */

import { createContext, useContext } from 'react';
import { type TextStyle, type ViewStyle } from 'react-native';

/* ------------------------------------------------------------------ *
 * Colour tokens
 * ------------------------------------------------------------------ */

/**
 * The semantic colour contract.
 *
 * Declared with `string` values rather than inferred hex literals so the light
 * and dark maps are two *implementations* of one interface. Components read
 * through this key set, so it is stable and scheme-independent by construction.
 */
export interface ColorTokens {
    /* ---- Brand / interactive ---- */
    /** Brand anchor. Filled buttons, active tab, selected chip. */
    primary: string;
    /** Pressed state of `primary`. */
    primaryPressed: string;
    /** Tinted brand wash: unread rows, focus halos, selected day cells. */
    primarySoft: string;

    /* ---- Surfaces ---- */
    /**
     * Screen root canvas. The deepest surface in the scheme — every other
     * surface is layered *above* it. In dark mode this is `#0B0E13`, never pure
     * black, so a raised surface still reads as raised.
     */
    background: string;
    /** Raised surface: cards, sheets, inputs, tab bar, app header. */
    surface: string;
    /** Slightly raised surface for grouped content on the canvas. */
    surfaceRaised: string;
    /** Pressed/inert fill, unselected chips, secondary buttons. */
    surfaceMuted: string;

    /* ---- Ink (text) ---- */
    /** Tier 1 — headings and primary row content. */
    inkPrimary: string;
    /** Tier 2 — supporting copy, field labels. */
    inkSecondary: string;
    /** Tier 3 — placeholders, metadata, timestamps. */
    inkTertiary: string;

    /* ---- Structure ---- */
    /** Hairline rule for separating rows within a container. */
    borderHairline: string;

    /* ---- Semantic states ---- */
    success: string;
    successSoft: string;
    danger: string;
    dangerSoft: string;
    warning: string;
    warningSoft: string;
    info: string;
    infoSoft: string;
}

/**
 * The light scheme — the default appearance.
 *
 * `primary` is the single unified brand blue. The previous `#1E5AA8` / `#2E5FA3`
 * split is gone: both resolve here.
 */
export const lightColorTokens: ColorTokens = {
    primary: '#1B4FA0',
    primaryPressed: '#153D7E',
    primarySoft: '#EAF1FB',

    background: '#F7F9FC',
    surface: '#FFFFFF',
    surfaceRaised: '#F7F9FC',
    surfaceMuted: '#F1F4F9',

    inkPrimary: '#0F1722',
    inkSecondary: '#5B6675',
    inkTertiary: '#8A94A3',

    borderHairline: '#E4E9F0',

    success: '#0E8A5F',
    successSoft: '#DDF3E9',
    danger: '#C4322B',
    dangerSoft: '#FBE7E5',
    warning: '#B7791F',
    warningSoft: '#FFF3DC',
    info: '#1B4FA0',
    infoSoft: '#EAF1FB',
};

/**
 * The dark scheme.
 *
 * The mapped type is the point: dark mode is a *total* mirror, not a runtime
 * `switch` over a partial override. A token added to `lightColorTokens` and
 * forgotten here fails `tsc`.
 *
 * Surfaces are charcoal-slate rather than pure black so a raised surface is
 * perceptibly lighter than the canvas it sits on.
 */
export const darkColorTokens: { [K in keyof ColorTokens]: string } = {
    primary: '#5B8DEF',
    primaryPressed: '#7AA3F2',
    primarySoft: '#1A2438',

    background: '#0B0E13',
    surface: '#10141B',
    surfaceRaised: '#161B24',
    surfaceMuted: '#1C2330',

    inkPrimary: '#F2F5F9',
    inkSecondary: '#A6B0BF',
    inkTertiary: '#6E7889',

    borderHairline: '#232B38',

    success: '#3ECF9A',
    successSoft: '#12281F',
    danger: '#F26D64',
    dangerSoft: '#2E1716',
    warning: '#E5B45C',
    warningSoft: '#2B2210',
    info: '#5B8DEF',
    infoSoft: '#1A2438',
};

/** Scheme-independent colour tokens (the light map is the canonical shape). */
export const colorTokens = lightColorTokens;

/** Resolves a colour-token map for an explicit scheme. */
export function colorTokensFor(scheme: 'light' | 'dark' | null | undefined): ColorTokens {
    return scheme === 'dark' ? (darkColorTokens as ColorTokens) : lightColorTokens;
}

/* ------------------------------------------------------------------ *
 * Radius tokens
 * ------------------------------------------------------------------ */

/**
 * Corner radius scale.
 *
 * Named by size rather than by role so a component can pick the value that
 * matches its visual weight; the role mapping lives in
 * [`radius.ts`](src/theme/radius.ts:1).
 */
export const radiusTokens = {
    /** 10 — small objects nested inside a container: chips, inline inputs. */
    rSm: 10,
    /** 16 — the default card radius. */
    rMd: 16,
    /** 20 — bottom sheets and generously padded panels. */
    rLg: 20,
    /** 28 — full-screen modals, hero surfaces, image headers. */
    rXl: 28,
    /** 999 — fully rounded; clamped to half the shorter dimension. */
    rPill: 999,
} as const;

export type RadiusTokens = typeof radiusTokens;

/* ------------------------------------------------------------------ *
 * Spacing tokens
 * ------------------------------------------------------------------ */

/**
 * Spacing scale — a strict 4pt grid.
 *
 * Rule: every value that separates two elements comes from this object. If a
 * screen needs a gap that is not here, the layout is wrong, not the scale.
 */
export const spacingTokens = {
    /** 4 — half-step. Icon-to-label gap inside a control, badge insets. */
    xs: 4,
    /** 8 — base unit. Inside chips, between stacked lines in a tight group. */
    sm: 8,
    /** 12 — gap between compact siblings in a row. */
    md: 12,
    /** 16 — default card interior padding. */
    lg: 16,
    /** 24 — between form groups and between content sections. */
    xl: 24,
    /** 32 — between major page regions. */
    xxl: 32,
    /** 48 — hero and empty-state breathing room. */
    xxxl: 48,
} as const;

/**
 * Global horizontal screen padding.
 *
 * Every screen, header and tab bar aligns on this one vertical rule. It is a
 * named token rather than a scale step because it is a *layout contract*, not a
 * gap: changing it re-gutters the whole app at once.
 */
export const screenPadding = 20;

export type SpacingTokens = typeof spacingTokens;

/* ------------------------------------------------------------------ *
 * Typography tokens
 * ------------------------------------------------------------------ */

/**
 * A single typographic tier: size, line height, weight and optional tracking.
 *
 * `fontSize`/`lineHeight` are point-based integers. `fontWeight` is the string
 * form React Native requires on Android and accepts on iOS.
 */
export interface TypeToken {
    fontSize: number;
    lineHeight: number;
    fontWeight: TextStyle['fontWeight'];
    letterSpacing?: number;
    textTransform?: TextStyle['textTransform'];
}

/**
 * The type scale.
 *
 * Ordering runs Display → Micro, largest to smallest, so the file reads as the
 * scale itself. The platform system font is used throughout.
 */
export const typographyTokens = {
    /** Display — the single largest line on a screen. */
    display: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
    /** Title — screen titles in a navigation header. */
    title: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
    /** Heading — promoted section headings and modal titles. */
    heading: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
    /** Body — the default reading tier. */
    body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
    /** BodyStrong — body copy that needs to lead a row. */
    bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
    /** Caption — supporting copy: row secondary lines, helper text. */
    caption: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
    /** Micro — tiny uppercase eyebrow / status-pill label. */
    micro: {
        fontSize: 11,
        lineHeight: 14,
        fontWeight: '600',
        letterSpacing: 0.8,
        textTransform: 'uppercase',
    },
} as const satisfies Record<string, TypeToken>;

export type TypographyTokens = typeof typographyTokens;
export type TypeTokenName = keyof typeof typographyTokens;

/* ------------------------------------------------------------------ *
 * Shadow tokens
 * ------------------------------------------------------------------ */

/**
 * A shadow token carries both platform descriptions at once: the iOS
 * `shadow*` props and the Android `elevation` integer. A call site spreads the
 * token and never branches on `Platform.OS`.
 */
export interface ShadowToken extends ViewStyle {
    shadowColor: string;
    shadowOpacity: number;
    shadowRadius: number;
    shadowOffset: { width: number; height: number };
    elevation: number;
}

/**
 * Shadow ink. Near-black with a blue cast so it matches the palette's neutrals
 * and avoids the muddy brown pure black produces over a blue-tinted canvas.
 */
const SHADOW_INK = '#0F1722';

/**
 * The elevation scale.
 *
 * `shadowCard` — a resting card that needs to separate from the canvas: 4pt
 * drop, 12pt blur, 6% ink. Barely perceptible, which is the point.
 * `shadowFloat` — a bottom sheet, dialog or FAB, which must clearly own the top
 * layer: 8pt drop, 24pt blur, 10% ink.
 */
export const shadowTokens = {
    /** Resting card / focused input. */
    shadowCard: {
        shadowColor: SHADOW_INK,
        shadowOpacity: 0.06,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 2,
    },
    /** Bottom sheet, modal, FAB. */
    shadowFloat: {
        shadowColor: SHADOW_INK,
        shadowOpacity: 0.1,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 8 },
        elevation: 6,
    },
} as const satisfies Record<string, ShadowToken>;

export type ShadowTokens = typeof shadowTokens;
export type ShadowTokenName = keyof typeof shadowTokens;

/**
 * The dark-scheme elevation scale.
 *
 * A drop shadow is only visible when it is *darker* than the surface it falls
 * on. In dark mode a raised surface is lighter than the canvas, so a shadow is
 * invisible no matter how strong — the 2026 spec therefore zeroes every shadow
 * in dark mode (`shadowOpacity: 0`, `elevation: 0`) and compensates with a 1px
 * `borderHairline` border on every elevated component. Keeping the same key set
 * as [`shadowTokens`](src/theme/tokens.ts:1) means a call site spreads
 * `theme.shadows[elevated]` and gets the correct treatment per scheme with no
 * branch of its own.
 */
export const darkShadowTokens: { [K in keyof ShadowTokens]: ShadowToken } = {
    shadowCard: {
        shadowColor: '#000000',
        shadowOpacity: 0,
        shadowRadius: 0,
        shadowOffset: { width: 0, height: 0 },
        elevation: 0,
    },
    shadowFloat: {
        shadowColor: '#000000',
        shadowOpacity: 0,
        shadowRadius: 0,
        shadowOffset: { width: 0, height: 0 },
        elevation: 0,
    },
};

/** Resolves a shadow-token map for an explicit scheme. */
export function shadowTokensFor(scheme: 'light' | 'dark' | null | undefined): ShadowTokens {
    return scheme === 'dark' ? (darkShadowTokens as ShadowTokens) : shadowTokens;
}

/* ------------------------------------------------------------------ *
 * Status pill
 * ------------------------------------------------------------------ */

/**
 * The statuses the app renders as a pill.
 *
 * Kept as a union rather than a bare `string` so a typo in a call site is a
 * compile error, while `getStatusPill` still accepts an arbitrary string for
 * values that arrive from the API.
 */
export type StatusPillStatus =
    | 'scheduled'
    | 'approved'
    | 'cancelled'
    | 'rejected'
    | 'pending'
    | 'completed'
    | 'swap_requested'
    | 'draft'
    | 'published'
    | 'active'
    | 'inactive';

/** The resolved colours for one status pill. */
export interface StatusPillColors {
    /** Background — always the matching `*Soft` token. */
    bg: string;
    /** Foreground — the matching solid token, AA against `bg`. */
    fg: string;
}

/**
 * Status → tone. The tone names the semantic family; the colours come from the
 * active scheme's tokens so the pill re-tints in dark mode automatically.
 */
const STATUS_TONES: Record<string, 'info' | 'success' | 'danger' | 'warning' | 'neutral'> = {
    // shifts
    scheduled: 'info',
    completed: 'success',
    cancelled: 'danger',
    swap_requested: 'warning',
    // leave requests
    pending: 'warning',
    approved: 'success',
    rejected: 'danger',
    // rosters
    draft: 'neutral',
    published: 'success',
    // users
    active: 'success',
    inactive: 'neutral',
};

/**
 * Resolves the `{ bg, fg }` pair for a status pill.
 *
 * The spec is fixed: coloured text on the matching `*Soft` background. Unknown
 * values fall back to a neutral grey pair rather than throwing, so a status the
 * backend adds degrades gracefully instead of leaving a blank space.
 *
 * @param status  The raw status enum from the API.
 * @param tokens  The active colour-token map. Defaults to the light scheme so
 *                the helper is usable from non-render code; render code should
 *                pass `useThemeTokens()` (or `useTheme().colors`).
 */
export function getStatusPill(
    status: string,
    tokens: ColorTokens = lightColorTokens,
): StatusPillColors {
    const tone = STATUS_TONES[status] ?? 'neutral';

    switch (tone) {
        case 'info':
            return { bg: tokens.infoSoft, fg: tokens.info };
        case 'success':
            return { bg: tokens.successSoft, fg: tokens.success };
        case 'danger':
            return { bg: tokens.dangerSoft, fg: tokens.danger };
        case 'warning':
            return { bg: tokens.warningSoft, fg: tokens.warning };
        case 'neutral':
        default:
            return { bg: tokens.surfaceMuted, fg: tokens.inkSecondary };
    }
}

/**
 * Geometry for the status pill, per the spec: height 28, horizontal padding 12,
 * radius 999, micro type. Exposed as a token so the pill's shape is not
 * re-derived at each call site.
 */
export const statusPillSpec = {
    height: 28,
    paddingHorizontal: spacingTokens.md,
    radius: radiusTokens.rPill,
    type: typographyTokens.micro,
} as const;

/* ------------------------------------------------------------------ *
 * Assembled token set + provider
 * ------------------------------------------------------------------ */

/** The complete token set for one colour scheme. */
export interface ThemeTokens {
    scheme: 'light' | 'dark';
    isDark: boolean;
    colors: ColorTokens;
    radius: RadiusTokens;
    spacing: SpacingTokens;
    screenPadding: number;
    typography: TypographyTokens;
    shadows: ShadowTokens;
}

/** Builds the complete token set for one colour scheme. */
export function createThemeTokens(scheme: 'light' | 'dark'): ThemeTokens {
    return {
        scheme,
        isDark: scheme === 'dark',
        colors: colorTokensFor(scheme),
        radius: radiusTokens,
        spacing: spacingTokens,
        screenPadding,
        typography: typographyTokens,
        // Dark mode zeroes every shadow and compensates with a hairline border —
        // see [`darkShadowTokens`](src/theme/tokens.ts:1).
        shadows: shadowTokensFor(scheme),
    };
}

/** The light token set — the default appearance. */
export const lightTokens = createThemeTokens('light');

/** The dark token set. */
export const darkTokens = createThemeTokens('dark');

/**
 * The light token set, under the name the 2026 spec uses.
 *
 * `lightTheme` / `darkTheme` are the two `ThemeTokens` implementations the
 * [`ThemeProvider`](src/theme/ThemeProvider.tsx:1) selects between. They are
 * aliases of `lightTokens` / `darkTokens` so there is exactly one object per
 * scheme — a component comparing `theme === lightTheme` and one comparing
 * `theme === lightTokens` are looking at the same reference.
 */
export const lightTheme: ThemeTokens = lightTokens;

/** The dark token set, under the name the 2026 spec uses. */
export const darkTheme: ThemeTokens = darkTokens;

/** Resolves a complete token set for an explicit scheme. */
export function tokensFor(scheme: 'light' | 'dark' | null | undefined): ThemeTokens {
    return scheme === 'dark' ? darkTokens : lightTokens;
}

/**
 * The user's appearance choice.
 *
 * `system` follows the OS light/dark setting; `light`/`dark` pin the app
 * regardless of it. Persisted under `@app/color-scheme` and hydrated on launch.
 */
export type ColorSchemePreference = 'light' | 'dark' | 'system';

/** The resolved scheme actually being rendered. */
export type ResolvedColorScheme = 'light' | 'dark';

/**
 * The value carried by [`ThemeContext`](src/theme/tokens.ts:1).
 *
 * `theme` is the assembled token set for the resolved scheme; `colorScheme` is
 * that scheme as a bare string (for `StatusBar` and React Navigation);
 * `setColorScheme` writes the user's choice and persists it.
 */
export type ThemeContextValue = {
    /** The active token set. */
    theme: ThemeTokens;
    /** The resolved scheme — never `system`. */
    colorScheme: ResolvedColorScheme;
    /** The user's raw preference, including `system`. */
    preference: ColorSchemePreference;
    /** Persists a new preference and re-renders the tree. */
    setColorScheme: (preference: ColorSchemePreference) => void;
    /** False until the persisted preference has been read, so the UI can hold. */
    isHydrated: boolean;
};

/**
 * React context carrying the active theme.
 *
 * Defaults to the light scheme so a component rendered outside a provider (a
 * unit test, a story) still resolves tokens rather than throwing. The real
 * provider lives in [`ThemeProvider`](src/theme/ThemeProvider.tsx:1).
 */
export const ThemeContext = createContext<ThemeContextValue>({
    theme: lightTokens,
    colorScheme: 'light',
    preference: 'system',
    setColorScheme: () => undefined,
    // `false` is the "no provider mounted" sentinel: the real provider never
    // renders its children until hydration completes, so a consumer can only
    // ever observe `isHydrated: true` from a mounted provider. `useTheme` uses
    // this to fall back to the legacy store-based resolution in tests/stories.
    isHydrated: false,
});

/** Reads the active token set from context. */
export function useThemeTokens(): ThemeTokens {
    return useContext(ThemeContext).theme;
}

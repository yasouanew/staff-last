import { type TextStyle } from 'react-native';

import { lightColors } from './colors';

/**
 * Typography tokens.
 *
 * Typeface
 * --------
 * The platform system font is used (SF Pro on iOS, Roboto on Android) rather
 * than a bundled face. It renders crisply at every density, honours the OS
 * font-size accessibility setting, and adds zero asset weight. `fontFamilies`
 * is `undefined` on the platform-handled weights and only names a family where
 * we need one (tabular figures on Android).
 *
 * Line height
 * -----------
 * Every tier pins an explicit `lineHeight` in points. This is not cosmetic:
 * when `lineHeight` is left to the platform, iOS and Android compute it from
 * different metric tables and a multi-line description will clip its descenders
 * on one platform and not the other. Explicit values make the two identical.
 *
 * All sizes and line heights are point-based integers (pt / dp). No `rem`, no
 * percentages, no unitless multipliers.
 */

/* ------------------------------------------------------------------ *
 * Primitives
 * ------------------------------------------------------------------ */

export const fontFamilies = {
    /** Platform default body face. */
    regular: undefined as string | undefined,
    /** Platform default medium weight. */
    medium: undefined as string | undefined,
    /** Platform default semibold weight. */
    semibold: undefined as string | undefined,
    /**
     * Figures that must not shift width as they change (durations, counts,
     * clock times). Android needs the explicit `sans-serif` family name; iOS
     * is handled by the `fontVariant` style below.
     */
    tabular: undefined as string | undefined,
} as const;

/**
 * Numeric weight constants.
 *
 * React Native requires the *string* form on Android and accepts either on iOS;
 * strings are used throughout so one value is correct on both.
 */
export const fontWeight = {
    light: '300',
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    heavy: '800',
} as const;

/**
 * Base font scale. Named by numeric step so the named variants below can be
 * re-tuned in one place without touching a single screen.
 */
export const fontSize = {
    xs: 12,
    sm: 13,
    md: 15,
    lg: 17,
    xl: 20,
    xxl: 24,
    xxxl: 30,
    display: 34,
} as const;

/** Line heights, paired 1:1 with `fontSize` keys. Roughly 1.35–1.5x the font size. */
export const lineHeight = {
    xs: 16,
    sm: 18,
    md: 22,
    lg: 24,
    xl: 28,
    xxl: 32,
    xxxl: 38,
    display: 42,
} as const;

/**
 * Letter-spacing adjustments.
 *
 * Large type needs negative tracking to avoid looking loose; small, all-caps
 * labels need positive tracking to stay legible. Values are points.
 */
export const letterSpacing = {
    tighter: -0.6,
    tight: -0.3,
    normal: 0,
    wide: 0.4,
    wider: 0.8,
} as const;

/* ------------------------------------------------------------------ *
 * Weight strategy
 * ------------------------------------------------------------------ */

/**
 * Which weight each tier uses.
 *
 * The hierarchy rule is: **titles are heavy, body is book/light**. Weight is
 * what creates hierarchy here — not size alone — because a 17pt body and a 17pt
 * title should not look identical. Body copy sits at `regular` (and `light` at
 * the Display end) so that dense shift/time data stays calm to read, while
 * headers jump forward at `semibold`/`bold`.
 */
export const typeWeights = {
    display: fontWeight.bold,
    headerLarge: fontWeight.bold,
    headerMedium: fontWeight.semibold,
    subtitle: fontWeight.semibold,
    body: fontWeight.regular,
    bodyStrong: fontWeight.medium,
    caption: fontWeight.regular,
    label: fontWeight.medium,
    overline: fontWeight.semibold,
} as const;

/* ------------------------------------------------------------------ *
 * Layer 2 — named variants
 * ------------------------------------------------------------------ */

const base: TextStyle = {
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    fontWeight: fontWeight.regular,
    color: lightColors.text,
};

/**
 * The type scale consumed by [`AppText`](src/components/AppText/AppText.tsx:1).
 *
 * Ordering runs Display → Caption, largest to smallest, so the file reads as the
 * scale itself. `AppText` maps `variant` onto these directly.
 */
export const textVariants = {
    /**
     * Display — the single largest line on a screen. Reserved for the app's
     * splash/sign-in wordmark and empty-state headlines. Light-weight at large
     * sizes so it does not shout; negative tracking so it does not look loose.
     */
    display: {
        ...base,
        fontSize: fontSize.display,
        lineHeight: lineHeight.display,
        fontWeight: typeWeights.display,
        letterSpacing: letterSpacing.tighter,
    } satisfies TextStyle,

    /**
     * HeaderLarge — screen titles in a navigation header.
     */
    headerLarge: {
        ...base,
        fontSize: fontSize.xxl,
        lineHeight: lineHeight.xxl,
        fontWeight: typeWeights.headerLarge,
        letterSpacing: letterSpacing.tight,
    } satisfies TextStyle,

    /**
     * HeaderMedium — promoted section headings and modal titles.
     */
    headerMedium: {
        ...base,
        fontSize: fontSize.xl,
        lineHeight: lineHeight.xl,
        fontWeight: typeWeights.headerMedium,
        letterSpacing: letterSpacing.tight,
    } satisfies TextStyle,

    /**
     * Subtitle — section headers inside a screen, card headings, list group
     * labels. Semi-bold so it separates from body without becoming a title.
     */
    subtitle: {
        ...base,
        fontSize: fontSize.lg,
        lineHeight: lineHeight.lg,
        fontWeight: typeWeights.subtitle,
    } satisfies TextStyle,

    /**
     * Body — the default. Regular weight, comfortable measure.
     */
    body: base satisfies TextStyle,

    /**
     * BodyStrong — body copy that needs to lead a row (list item primary lines).
     */
    bodyStrong: {
        ...base,
        fontWeight: typeWeights.bodyStrong,
    } satisfies TextStyle,

    /**
     * Caption — supporting copy: row secondary lines, helper text, field hints.
     */
    caption: {
        ...base,
        fontSize: fontSize.sm,
        lineHeight: lineHeight.sm,
        fontWeight: typeWeights.caption,
        color: lightColors.textSecondary,
    } satisfies TextStyle,

    /**
     * Label — smallest reading tier: metadata, badge text, timestamps. Medium
     * weight compensates for the small size so it stays crisp.
     */
    label: {
        ...base,
        fontSize: fontSize.xs,
        lineHeight: lineHeight.xs,
        fontWeight: typeWeights.label,
        color: lightColors.textMuted,
    } satisfies TextStyle,

    /**
     * Overline — tiny uppercase eyebrow above a heading. Positive tracking is
     * mandatory at this size.
     */
    overline: {
        ...base,
        fontSize: fontSize.xs,
        lineHeight: lineHeight.xs,
        fontWeight: typeWeights.overline,
        letterSpacing: letterSpacing.wider,
        textTransform: 'uppercase',
        color: lightColors.textMuted,
    } satisfies TextStyle,

    /**
     * Time — the hero figure on a shift card. Tabular figures so the column of
     * start times never jitters between rows.
     */
    time: {
        ...base,
        fontSize: fontSize.xxl,
        lineHeight: lineHeight.xxl,
        fontWeight: fontWeight.semibold,
        fontVariant: ['tabular-nums'],
    } satisfies TextStyle,

    /**
     * Numeric — body-sized, tabular. Durations, counts, anything compared
     * vertically.
     */
    numeric: {
        ...base,
        fontVariant: ['tabular-nums'],
    } satisfies TextStyle,

    /**
     * Title — **legacy alias** of `headerMedium`, kept inside the scale (rather
     * than in a side table) so the `TextVariant` union still accepts
     * `variant="title"` at every existing call site. New code should use
     * `headerMedium`; this entry can be deleted once no screen references it.
     */
    title: {
        ...base,
        fontSize: fontSize.xl,
        lineHeight: lineHeight.xl,
        fontWeight: typeWeights.headerMedium,
        letterSpacing: letterSpacing.tight,
    } satisfies TextStyle,
} as const;

/**
 * The pre-Phase-1 variant names that were folded into the scale above. Exposed
 * as a set so tooling can flag remaining usages.
 */
export const legacyVariantNames = ['title'] as const;

export type TextVariant = keyof typeof textVariants;
export type LegacyTextVariant = (typeof legacyVariantNames)[number];

export const typography = {
    fontFamilies,
    fontSize,
    lineHeight,
    letterSpacing,
    fontWeight,
    weights: typeWeights,
    variants: textVariants,
    legacyVariantNames,
} as const;

export type Typography = typeof typography;

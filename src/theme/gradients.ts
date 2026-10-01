import type { Colors } from './colors';

/**
 * Gradient presets.
 *
 * Why a factory and not a constant
 * --------------------------------
 * A gradient's stops must change with the colour scheme — a brand gradient tuned
 * for white will look muddy on slate. The stop *values* therefore live in
 * [`colors.ts`](src/theme/colors.ts:1) as semantic tokens, and this module only
 * describes the *geometry* (direction) and which stops each preset draws from.
 *
 * `createGradients` is called once per scheme inside the theme factory, so
 * `theme.gradients.primary` always resolves to scheme-correct hexes with no
 * per-component branching.
 *
 * Consumption: spread a preset straight into `LinearGradient`
 * (`react-native-linear-gradient`):
 *
 *   <LinearGradient {...theme.gradients.primary} />
 *
 * Note the presets carry `colors` as a tuple, not a bare array, because
 * `LinearGradient` requires at least two stops — the tuple type makes a
 * single-stop gradient a compile error rather than a silent no-op.
 */

/** A `LinearGradient` start/end pair, in unit coordinates (0–1). */
export type GradientPoint = { x: number; y: number };

/** A ready-to-spread `LinearGradient` preset. */
export type GradientPreset = {
    /** Two or more stops, in order. */
    colors: readonly [string, string, ...string[]];
    /** Normalised start point. */
    start: GradientPoint;
    /** Normalised end point. */
    end: GradientPoint;
    /** Optional stop positions (0–1), aligned with `colors`. */
    locations?: readonly number[];
};

/** Reusable directions, so presets stay declarative. */
const directions = {
    /** Top-left → bottom-right. The default for hero surfaces. */
    diagonal: { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
    /** Top → bottom. Reads as light falling on a panel. */
    vertical: { start: { x: 0, y: 0 }, end: { x: 0, y: 1 } },
    /** Left → right. For progress meters and thin accent bars. */
    horizontal: { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } },
    /** Bottom-left → top-right. A warmer, less corporate diagonal. */
    diagonalUp: { start: { x: 0, y: 1 }, end: { x: 1, y: 0 } },
} as const;

/**
 * Builds the scheme's gradient set from resolved colour tokens.
 *
 * @param colors A resolved semantic colour map (light or dark).
 */
export function createGradients(colors: Colors) {
    return {
        /** Filled brand surfaces: primary buttons, the dashboard hero. */
        primary: {
            colors: [colors.gradientPrimaryFrom, colors.gradientPrimaryTo],
            ...directions.diagonal,
        },
        /** Same hue, travelling bottom-left → top-right, for variety in a stack. */
        primaryReverse: {
            colors: [colors.gradientPrimaryTo, colors.gradientPrimaryFrom],
            ...directions.diagonalUp,
        },
        /** Near-neutral sheen for elevated cards; must stay subtle. */
        surface: {
            colors: [colors.gradientSurfaceFrom, colors.gradientSurfaceTo],
            ...directions.vertical,
        },
        /** Translucent scrim that darkens toward the bottom — for text over media. */
        scrim: {
            colors: ['transparent', colors.overlay],
            ...directions.vertical,
            locations: [0.35, 1] as const,
        },
        /** Thin accent rule used under section headers. */
        accentRule: {
            colors: [colors.gradientPrimaryFrom, colors.gradientSurfaceTo],
            ...directions.horizontal,
        },
    } as const satisfies Record<string, GradientPreset>;
}

export type Gradients = ReturnType<typeof createGradients>;
export type GradientName = keyof Gradients;

export const gradientDirections = directions;

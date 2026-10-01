/**
 * Theme barrel.
 *
 * The theme system is layered, and each layer is exported so consumers can be
 * as narrow as they need to be:
 *
 *  - **Tokens** (`colors`, `spacing`, `radius`, `shadows`, `typography`,
 *    `sizing`) — raw values. Prefer reading these through [`useTheme`](src/theme/useTheme.ts:1)
 *    inside components so the active colour scheme is honoured.
 *  - **Themes** (`lightTheme`, `darkTheme`, `theme`, `themeFor`) — assembled
 *    token sets, one per colour scheme.
 *  - **Hook** (`useTheme`) — the supported entry point for render code.
 *  - **Types** (`Theme`, `Colors`, `Spacing`, ...) — for props and style
 *    factories that need to declare what they accept.
 */

/* ---- Colours ---- */
export {
    colors,
    colorsFor,
    darkColors,
    lightColors,
    palette,
    type ColorSchemeName,
    type Colors,
} from './colors';

/* ---- Geometry ---- */
export {
    componentRadius,
    radius,
    radiusRoles,
    type ComponentRadius,
    type Radius,
    type RadiusRole,
} from './radius';

/* ---- Gradients ---- */
export {
    createGradients,
    gradientDirections,
    type GradientName,
    type GradientPoint,
    type GradientPreset,
    type Gradients,
} from './gradients';

/* ---- Motion ---- */
export {
    duration,
    easing,
    motion,
    pressScale,
    springs,
    type DurationToken,
    type EasingToken,
    type Motion,
    type SpringToken,
} from './motion';

/* ---- Haptics ---- */
export {
    hapticFeedback,
    haptics,
    reducedMotionSuppressed,
    type HapticSemantic,
    type HapticTrigger,
    type Haptics,
} from './haptics';

export { GRID_UNIT, insets, screenGutter, spacing, type Insets, type Spacing } from './spacing';

/* ---- Elevation ---- */
export {
    darkElevation,
    elevationSpecs,
    shadows,
    type DarkElevation,
    type ElevationSpec,
    type ElevationTier,
    type ShadowLevel,
    type Shadows,
} from './shadows';

/* ---- Sizing ---- */
export {
    avatarSizes,
    borderWidths,
    controlHeights,
    ICON_STROKE_WIDTH,
    iconSizes,
    layout,
    MIN_TOUCH_TARGET,
    sizing,
    type IconSizePreset,
    type Sizing,
} from './sizing';

/* ---- Typography ---- */
export {
    fontFamilies,
    fontSize,
    fontWeight,
    letterSpacing,
    lineHeight,
    legacyVariantNames,
    textVariants,
    typeWeights,
    typography,
    type LegacyTextVariant,
    type TextVariant,
    type Typography,
} from './typography';

/* ---- Assembled themes ---- */
export {
    darkTheme,
    lightTheme,
    theme,
    themeFor,
    type Theme,
} from './theme';

/* ---- Hook + resolution ---- */
export { getTheme, resolveTheme, useTheme, type AppearancePreference } from './useTheme';

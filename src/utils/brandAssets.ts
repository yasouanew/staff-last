import type { ImageSourcePropType } from 'react-native';

/**
 * Brand assets — the Rosta wordmark.
 *
 * Two raster variants ship with the app, and each has exactly one job:
 *
 *  - [`ROSTA_LOGO_NAVY`](src/utils/brandAssets.ts:1) — the navy wordmark, for
 *    **light** surfaces (the Login hero, the launcher icon). It is the primary
 *    mark and the one the app icon is generated from.
 *  - [`ROSTA_LOGO_WHITE`](src/utils/brandAssets.ts:1) — the white wordmark, for
 *    **dark / brand-blue** surfaces. The splash canvas is brand blue in *both*
 *    colour schemes, so it must use this variant or the mark would disappear
 *    into the background in light mode.
 *
 * The sources are `require`d here rather than imported at each call site so the
 * asset pipeline resolves them once and every consumer — splash, login, future
 * screens — points at the same file. `require` (not `import`) is deliberate:
 * Metro's asset registry returns an opaque numeric handle, and the `import`
 * form would need a `*.png` module declaration to type-check.
 *
 * The `-trim` files are the originals with their transparent padding cropped
 * away (829×391), so the wordmark fills its container edge to edge instead of
 * floating inside a mostly-empty square. That is what makes a single
 * `ROSTA_LOGO_ASPECT_RATIO` correct for both variants.
 */
export const ROSTA_LOGO_NAVY: ImageSourcePropType = require('./staffLogo-naivy-trim.png');

export const ROSTA_LOGO_WHITE: ImageSourcePropType = require('./staffLogo-white-trim.png');

/**
 * The wordmark's intrinsic aspect ratio (width ÷ height).
 *
 * Both trimmed sources are 829×391, so a container sized from this ratio
 * preserves the mark's proportions exactly. Consumers should derive the height
 * from a chosen width (or vice versa) rather than forcing a square, which would
 * letterbox the wordmark.
 */
export const ROSTA_LOGO_ASPECT_RATIO = 829 / 391;

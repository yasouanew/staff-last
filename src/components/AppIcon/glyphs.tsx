import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';

/**
 * Built-in glyph set, drawn as real vector paths on `react-native-svg`.
 *
 * The app's icon strategy (Phase 2, §4) is to type against the
 * [`IconComponent`](src/components/AppIcon/AppIcon.tsx:21) shape — `size` / `color` /
 * `strokeWidth` — so that adopting a different icon set later is a change to the
 * *imports* at the call sites, not a rewrite of the atom. That contract is unchanged
 * here: every export below still takes `{ size, color, strokeWidth }` and nothing else.
 *
 * ## Why SVG rather than primitives
 *
 * These glyphs were previously assembled from absolutely-positioned `View` bars. That
 * approach could not express a curve at all — every icon was a stack of rectangles, so
 * circles, arcs and rounded joins were approximated or abandoned. `react-native-svg`
 * is already a dependency (it backs the skeletons' gradients), so the cost of the
 * upgrade is zero native surface, and the payoff is that each glyph is now the real
 * thing.
 *
 * ## Geometry conventions
 *
 * - Every glyph draws on a **24 × 24 viewBox** regardless of `size`. The viewport is
 *   what scales, so stroke weight stays *proportional* to the icon: a 16pt icon is a
 *   correctly-scaled 24pt icon, not a 24pt icon with fat strokes. This is the behaviour
 *   of every mainstream set and is what makes a 12pt shield sit beside a 24pt one
 *   without looking clumsy.
 * - Path data follows **Feather / Lucide** (both MIT) conventions — 2pt stroke at 24,
 *   round caps and joins — so the set reads as one family and can be extended by
 *   pasting further Feather paths verbatim.
 * - `fill` is `none` by default and each glyph opts in explicitly where a solid shape
 *   is intended (the half-filled strength shield, the brand mark, the theme toggle).
 *
 * **Stroke props are spread onto every child rather than inherited from the root.**
 * Inheritance through the `Svg` context works, but it is invisible at the call site:
 * a reader of one glyph could not tell where its colour came from. Spreading keeps
 * each glyph self-contained and verifiable.
 */

export type GlyphProps = {
    size?: number;
    color?: string;
    strokeWidth?: number;
};

/**
 * The shared stroke surface of a glyph. `fill: 'none'` is part of it because an
 * unset fill defaults to black, which would turn every stroked outline into a
 * solid blob.
 */
type StrokeProps = {
    fill: 'none';
    stroke: string;
    strokeWidth: number;
    strokeLinecap: 'round';
    strokeLinejoin: 'round';
};

function stroke(color: string, strokeWidth: number): StrokeProps {
    return {
        fill: 'none',
        stroke: color,
        strokeWidth,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
    };
}

/** The canonical drawing square. `size` scales this; it never redefines it. */
const VIEW_BOX = '0 0 24 24';

/**
 * Shield silhouette, apex at (12, 2) and point at (12, 22).
 * Shared by the strength trio and the brand mark so the four cannot drift apart.
 */
const SHIELD_PATH = 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z';

/** The right-hand half of {@link SHIELD_PATH}, closed along the centre line. */
const SHIELD_HALF_PATH = 'M12 22s8-4 8-10V5l-8-3z';

/** A stroked "L" rotated — the universal back affordance. */
export function ArrowLeftGlyph({ size = 24, color = '#000', strokeWidth = 2 }: GlyphProps) {
    const s = stroke(color, strokeWidth);

    return (
        <Svg width={size} height={size} viewBox={VIEW_BOX} fill="none">
            <Line {...s} x1={19} y1={12} x2={5} y2={12} />
            <Polyline {...s} points="12 19 5 12 12 5" />
        </Svg>
    );
}

/**
 * Shield with its right half filled — "strength is partial".
 * Used for the **Medium** strength state.
 */
export function ShieldHalfGlyph({ size = 12, color = '#000', strokeWidth = 2 }: GlyphProps) {
    const s = stroke(color, strokeWidth);

    return (
        <Svg width={size} height={size} viewBox={VIEW_BOX} fill="none">
            <Path {...s} d={SHIELD_PATH} />
            <Path d={SHIELD_HALF_PATH} fill={color} />
        </Svg>
    );
}

/** Shield with a check — the "Strong" state. */
export function ShieldCheckGlyph({ size = 12, color = '#000', strokeWidth = 2 }: GlyphProps) {
    const s = stroke(color, strokeWidth);

    return (
        <Svg width={size} height={size} viewBox={VIEW_BOX} fill="none">
            <Path {...s} d={SHIELD_PATH} />
            <Polyline {...s} points="9 11.5 11 13.5 15 9.5" />
        </Svg>
    );
}

/** Shield with a diagonal slash — the "Weak" state. */
export function ShieldAlertGlyph({ size = 12, color = '#000', strokeWidth = 2 }: GlyphProps) {
    const s = stroke(color, strokeWidth);

    return (
        <Svg width={size} height={size} viewBox={VIEW_BOX} fill="none">
            <Path {...s} d={SHIELD_PATH} />
            <Line {...s} x1={8.5} y1={8.5} x2={15.5} y2={15.5} />
        </Svg>
    );
}

/** Envelope with a check — the "reset link sent" confirmation. */
export function MailCheckGlyph({ size = 24, color = '#000', strokeWidth = 2 }: GlyphProps) {
    const s = stroke(color, strokeWidth);

    return (
        <Svg width={size} height={size} viewBox={VIEW_BOX} fill="none">
            <Path {...s} d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8" />
            <Path {...s} d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            <Path {...s} d="m16 19 2 2 4-4" />
        </Svg>
    );
}

/** Clock face — used for rate-limit ("slow down") messaging and durations. */
export function ClockGlyph({ size = 16, color = '#000', strokeWidth = 2 }: GlyphProps) {
    const s = stroke(color, strokeWidth);

    return (
        <Svg width={size} height={size} viewBox={VIEW_BOX} fill="none">
            <Circle {...s} cx={12} cy={12} r={10} />
            <Polyline {...s} points="12 6 12 12 16 14" />
        </Svg>
    );
}

/** Triangle with a bang — form-level failure. */
export function AlertTriangleGlyph({ size = 16, color = '#000', strokeWidth = 2 }: GlyphProps) {
    const s = stroke(color, strokeWidth);

    return (
        <Svg width={size} height={size} viewBox={VIEW_BOX} fill="none">
            <Path
                {...s}
                d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
            />
            <Line {...s} x1={12} y1={9} x2={12} y2={13} />
            <Line {...s} x1={12} y1={17} x2={12.01} y2={17} />
        </Svg>
    );
}

/**
 * Shield silhouette with a tick — the login hero and splash mark.
 *
 * Drawn as a **duotone** rather than a flat silhouette: the fill is the same ink at
 * 16% and the outline and tick are at full strength. A solid white shield on a
 * primary gradient reads as a hole in the artwork, and a solid shield in `text`
 * would be invisible on a dark hero. Deriving both tones from one `color` means the
 * mark is legible on any background the caller puts behind it, without the caller
 * having to know which one that is.
 */
export function BrandShieldGlyph({ size = 32, color = '#000', strokeWidth = 2 }: GlyphProps) {
    const s = stroke(color, Math.max(strokeWidth, 2));

    return (
        <Svg width={size} height={size} viewBox={VIEW_BOX} fill="none">
            <Path d={SHIELD_PATH} fill={color} fillOpacity={0.16} />
            <Path {...s} d={SHIELD_PATH} />
            <Polyline {...s} points="9 11.5 11 13.5 15 9.5" />
        </Svg>
    );
}

/** A stroked "L" mirrored — drill-down / next. */
export function ChevronRightGlyph({ size = 16, color = '#000', strokeWidth = 2 }: GlyphProps) {
    const s = stroke(color, strokeWidth);

    return (
        <Svg width={size} height={size} viewBox={VIEW_BOX} fill="none">
            <Polyline {...s} points="9 18 15 12 9 6" />
        </Svg>
    );
}

/** A stroked "L" — previous / back in a horizontal control. */
export function ChevronLeftGlyph({ size = 16, color = '#000', strokeWidth = 2 }: GlyphProps) {
    const s = stroke(color, strokeWidth);

    return (
        <Svg width={size} height={size} viewBox={VIEW_BOX} fill="none">
            <Polyline {...s} points="15 18 9 12 15 6" />
        </Svg>
    );
}

/** A stroked "L" rotated — expand / collapse. */
export function ChevronDownGlyph({ size = 16, color = '#000', strokeWidth = 2 }: GlyphProps) {
    const s = stroke(color, strokeWidth);

    return (
        <Svg width={size} height={size} viewBox={VIEW_BOX} fill="none">
            <Polyline {...s} points="6 9 12 15 18 9" />
        </Svg>
    );
}

/** Teardrop pin — physical work location. */
export function MapPinGlyph({ size = 16, color = '#000', strokeWidth = 2 }: GlyphProps) {
    const s = stroke(color, strokeWidth);

    return (
        <Svg width={size} height={size} viewBox={VIEW_BOX} fill="none">
            <Path {...s} d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <Circle {...s} cx={12} cy={10} r={3} />
        </Svg>
    );
}

/** Head-and-shoulders — the account identity glyph. */
export function UserGlyph({ size = 16, color = '#000', strokeWidth = 2 }: GlyphProps) {
    const s = stroke(color, strokeWidth);

    return (
        <Svg width={size} height={size} viewBox={VIEW_BOX} fill="none">
            <Path {...s} d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <Circle {...s} cx={12} cy={7} r={4} />
        </Svg>
    );
}

/** Calendar page with a header rule. */
export function CalendarGlyph({ size = 16, color = '#000', strokeWidth = 2 }: GlyphProps) {
    const s = stroke(color, strokeWidth);

    return (
        <Svg width={size} height={size} viewBox={VIEW_BOX} fill="none">
            <Rect {...s} x={3} y={4} width={18} height={18} rx={2} ry={2} />
            <Line {...s} x1={16} y1={2} x2={16} y2={6} />
            <Line {...s} x1={8} y1={2} x2={8} y2={6} />
            <Line {...s} x1={3} y1={10} x2={21} y2={10} />
        </Svg>
    );
}

/**
 * Calendar with day marks — the roster grid.
 *
 * Distinguished from [`CalendarGlyph`](src/components/AppIcon/glyphs.tsx:1) by the six
 * day dots, which is what separates "a date" from "a schedule" at 24pt without a
 * second colour or a badge.
 */
export function CalendarDaysGlyph({ size = 24, color = '#000', strokeWidth = 2 }: GlyphProps) {
    const s = stroke(color, strokeWidth);

    return (
        <Svg width={size} height={size} viewBox={VIEW_BOX} fill="none">
            <Rect {...s} x={3} y={4} width={18} height={18} rx={2} />
            <Line {...s} x1={16} y1={2} x2={16} y2={6} />
            <Line {...s} x1={8} y1={2} x2={8} y2={6} />
            <Line {...s} x1={3} y1={10} x2={21} y2={10} />
            {/* `h.01` under a round cap renders as a single dot. */}
            <Line {...s} x1={8} y1={14} x2={8.01} y2={14} />
            <Line {...s} x1={12} y1={14} x2={12.01} y2={14} />
            <Line {...s} x1={16} y1={14} x2={16.01} y2={14} />
            <Line {...s} x1={8} y1={18} x2={8.01} y2={18} />
            <Line {...s} x1={12} y1={18} x2={12.01} y2={18} />
            <Line {...s} x1={16} y1={18} x2={16.01} y2={18} />
        </Svg>
    );
}

/** Calendar with a tick — a leave request. */
export function CalendarCheckGlyph({ size = 24, color = '#000', strokeWidth = 2 }: GlyphProps) {
    const s = stroke(color, strokeWidth);

    return (
        <Svg width={size} height={size} viewBox={VIEW_BOX} fill="none">
            <Rect {...s} x={3} y={4} width={18} height={18} rx={2} />
            <Line {...s} x1={16} y1={2} x2={16} y2={6} />
            <Line {...s} x1={8} y1={2} x2={8} y2={6} />
            <Line {...s} x1={3} y1={10} x2={21} y2={10} />
            <Polyline {...s} points="9 15.5 11.5 18 15.5 13.5" />
        </Svg>
    );
}

/** Roof over a doorway — the home tab. */
export function HomeGlyph({ size = 24, color = '#000', strokeWidth = 2 }: GlyphProps) {
    const s = stroke(color, strokeWidth);

    return (
        <Svg width={size} height={size} viewBox={VIEW_BOX} fill="none">
            <Path {...s} d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <Polyline {...s} points="9 22 9 12 15 12 15 22" />
        </Svg>
    );
}

/** Sun with eight rays — availability / working hours. */
export function SunGlyph({ size = 24, color = '#000', strokeWidth = 2 }: GlyphProps) {
    const s = stroke(color, strokeWidth);

    return (
        <Svg width={size} height={size} viewBox={VIEW_BOX} fill="none">
            <Circle {...s} cx={12} cy={12} r={5} />
            <Line {...s} x1={12} y1={1} x2={12} y2={3} />
            <Line {...s} x1={12} y1={21} x2={12} y2={23} />
            <Line {...s} x1={4.22} y1={4.22} x2={5.64} y2={5.64} />
            <Line {...s} x1={18.36} y1={18.36} x2={19.78} y2={19.78} />
            <Line {...s} x1={1} y1={12} x2={3} y2={12} />
            <Line {...s} x1={21} y1={12} x2={23} y2={12} />
            <Line {...s} x1={4.22} y1={19.78} x2={5.64} y2={18.36} />
            <Line {...s} x1={18.36} y1={5.64} x2={19.78} y2={4.22} />
        </Svg>
    );
}

/** Price-tag — position / department classification. */
export function TagGlyph({ size = 16, color = '#000', strokeWidth = 2 }: GlyphProps) {
    const s = stroke(color, strokeWidth);

    return (
        <Svg width={size} height={size} viewBox={VIEW_BOX} fill="none">
            <Path
                {...s}
                d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"
            />
            <Line {...s} x1={7} y1={7} x2={7.01} y2={7} />
        </Svg>
    );
}

/** Document with text rules — notes / description. */
export function NoteGlyph({ size = 16, color = '#000', strokeWidth = 2 }: GlyphProps) {
    const s = stroke(color, strokeWidth);

    return (
        <Svg width={size} height={size} viewBox={VIEW_BOX} fill="none">
            <Path {...s} d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <Polyline {...s} points="14 2 14 8 20 8" />
            <Line {...s} x1={16} y1={13} x2={8} y2={13} />
            <Line {...s} x1={16} y1={17} x2={8} y2={17} />
            <Polyline {...s} points="10 9 9 9 8 9" />
        </Svg>
    );
}

/** Circled "i" — generic metadata that has no better glyph. */
export function InfoGlyph({ size = 16, color = '#000', strokeWidth = 2 }: GlyphProps) {
    const s = stroke(color, strokeWidth);

    return (
        <Svg width={size} height={size} viewBox={VIEW_BOX} fill="none">
            <Circle {...s} cx={12} cy={12} r={10} />
            <Line {...s} x1={12} y1={16} x2={12} y2={12} />
            <Line {...s} x1={12} y1={8} x2={12.01} y2={8} />
        </Svg>
    );
}

/** Two crossed bars — the create affordance on the FAB. */
export function PlusGlyph({ size = 24, color = '#000', strokeWidth = 2 }: GlyphProps) {
    const s = stroke(color, strokeWidth);

    return (
        <Svg width={size} height={size} viewBox={VIEW_BOX} fill="none">
            <Line {...s} x1={12} y1={5} x2={12} y2={19} />
            <Line {...s} x1={5} y1={12} x2={19} y2={12} />
        </Svg>
    );
}

/** Door with an arrow leaving it — sign out. */
export function SignOutGlyph({ size = 24, color = '#000', strokeWidth = 2 }: GlyphProps) {
    const s = stroke(color, strokeWidth);

    return (
        <Svg width={size} height={size} viewBox={VIEW_BOX} fill="none">
            <Path {...s} d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <Polyline {...s} points="16 17 21 12 16 7" />
            <Line {...s} x1={21} y1={12} x2={9} y2={12} />
        </Svg>
    );
}

/** Bell with a clapper — push notifications. */
export function BellGlyph({ size = 24, color = '#000', strokeWidth = 2 }: GlyphProps) {
    const s = stroke(color, strokeWidth);

    return (
        <Svg width={size} height={size} viewBox={VIEW_BOX} fill="none">
            <Path {...s} d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <Path {...s} d="M13.73 21a2 2 0 0 1-3.46 0" />
        </Svg>
    );
}

/** Three tracks with handles — settings / preferences. */
export function SlidersGlyph({ size = 24, color = '#000', strokeWidth = 2 }: GlyphProps) {
    const s = stroke(color, strokeWidth);

    return (
        <Svg width={size} height={size} viewBox={VIEW_BOX} fill="none">
            <Line {...s} x1={4} y1={21} x2={4} y2={14} />
            <Line {...s} x1={4} y1={10} x2={4} y2={3} />
            <Line {...s} x1={12} y1={21} x2={12} y2={12} />
            <Line {...s} x1={12} y1={8} x2={12} y2={3} />
            <Line {...s} x1={20} y1={21} x2={20} y2={16} />
            <Line {...s} x1={20} y1={12} x2={20} y2={3} />
            <Line {...s} x1={1} y1={14} x2={7} y2={14} />
            <Line {...s} x1={9} y1={8} x2={15} y2={8} />
            <Line {...s} x1={17} y1={16} x2={23} y2={16} />
        </Svg>
    );
}

/**
 * Half-filled disc — the light/dark toggle.
 *
 * One shape carries both meanings: the stroked half is the lit side, the filled half
 * is the shadowed one. A sun-and-moon pair would need two glyphs and a swap, which
 * makes the control's state depend on which icon is mounted rather than on the
 * control itself.
 */
export function SunMoonGlyph({ size = 24, color = '#000', strokeWidth = 2 }: GlyphProps) {
    const s = stroke(color, strokeWidth);

    return (
        <Svg width={size} height={size} viewBox={VIEW_BOX} fill="none">
            <Circle {...s} cx={12} cy={12} r={9} />
            {/* Arc from the top of the circle to the bottom, swept counter-clockwise,
                then closed along the vertical diameter: the left half. */}
            <Path d="M12 3a9 9 0 0 0 0 18z" fill={color} />
        </Svg>
    );
}

/** A single tick — inline validation success. */
export function CheckGlyph({ size = 16, color = '#000', strokeWidth = 2 }: GlyphProps) {
    const s = stroke(color, strokeWidth);

    return (
        <Svg width={size} height={size} viewBox={VIEW_BOX} fill="none">
            <Polyline {...s} points="20 6 9 17 4 12" />
        </Svg>
    );
}

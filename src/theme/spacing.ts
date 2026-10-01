/**
 * Spacing scale — an explicit 8pt grid.
 *
 * Rule: every value that separates two elements comes from this object. If a
 * screen needs a gap that is not here, the layout is wrong, not the scale.
 * Arbitrary numbers are the single biggest source of "this app feels unpolished"
 * on mobile, because the eye detects unequal gaps long before it can name them.
 *
 * The grid is 8pt (the classic iOS/Android density baseline, and the unit most
 * Material spacing is specified in). `xxs = 4` is the one permitted half-step,
 * reserved for optical alignment inside a control — the gap between a radio dot
 * and its label, the inset of a badge — where 8pt would visibly over-pad.
 *
 * All values are point-based integers (pt / dp). No `rem`, no percentages.
 */
export const spacing = {
    none: 0,
    /** 4 — half-step. Icon-to-label gap inside a control, badge insets. */
    xxs: 4,
    /** 8 — base unit. Inside chips, between stacked lines in a tight group. */
    xs: 8,
    /** 12 — gap between compact siblings in a row. */
    sm: 12,
    /** 16 — default screen gutter and card interior padding. */
    md: 16,
    /**
     * 20 — a rarely-needed step that breaks the strict 8pt rhythm by half a
     * unit. Retained because existing form layouts rely on it; new layouts
     * should prefer `md` (16) or `xl` (24).
     */
    lg: 20,
    /** 24 — between form groups and between content sections. */
    xl: 24,
    /** 32 — between major page regions. */
    xxl: 32,
    /** 48 — hero and empty-state breathing room. */
    xxxl: 48,
    /** 64 — reserved scroll tail under a FAB / tab bar. */
    huge: 64,
} as const;

/**
 * The 8pt grid unit itself. Exposed for the rare case where a value must be
 * derived (e.g. `grid * 1.5`) rather than picked from the scale. Prefer a token.
 */
export const GRID_UNIT = 8;

/**
 * Fixed horizontal gutter used by [`ScreenContainer`](src/components/ScreenContainer/ScreenContainer.tsx:1)
 * and [`AppHeader`](src/components/AppHeader/AppHeader.tsx:1) so that headers,
 * scroll content and the tab bar all align on the same vertical rule.
 *
 * 16pt is the iOS content-margin convention and reads as "generous" without
 * eating a meaningful fraction of a small phone's width.
 */
export const screenGutter = spacing.md;

/**
 * Named inset tokens for grouped "settings" style lists, where the outer gutter
 * and the inner content inset are deliberately different values.
 */
export const insets = {
    screen: spacing.md,
    card: spacing.md,
    /** Extra inset for text inside an already-padded card. */
    cardInner: spacing.sm,
    listRow: spacing.md,
} as const;

export type Spacing = typeof spacing;
export type Insets = typeof insets;

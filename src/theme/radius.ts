/**
 * Corner radius rules.
 *
 * Radii are grouped by the *kind of object* they apply to, not by pixel size —
 * because the failure mode on mobile is a card that is 12pt on one screen and
 * 16pt on another, not a card that is 12pt instead of 13pt. Pick the role, get
 * the value.
 *
 *  - `micro`  — objects inside another object: chips, tags, inline inputs,
 *               small status pills. Must be small enough that a nested element
 *               never curves more sharply than its container.
 *  - `macro`  — objects that sit on the page: cards, bottom sheets, modals.
 *               Large enough to read as deliberately soft.
 *  - `pill`   — shape carries meaning: badges, avatars, filter toggles, FABs,
 *               icon buttons. Always fully rounded.
 *
 * All values are point-based integers. `pill` is a large sentinel rather than
 * a percentage because React Native's `borderRadius` is a point value and the
 * sentinel behaviour clamps correctly on both platforms.
 */

const micro = {
    /** 2 — inner highlights that must follow a parent curve. */
    xxs: 2,
    /** 4 — status badges, small tags. */
    xs: 4,
    /** 6 — inline inputs, compact chips. */
    sm: 6,
    /** 8 — segmented controls, default chip. */
    md: 8,
} as const;

const macro = {
    /** 12 — the default card radius. */
    md: 12,
    /** 16 — bottom sheets and generously padded panels. */
    lg: 16,
    /** 20 — full-screen modals and dialogs. */
    xl: 20,
    /** 28 — large presentation surfaces, image headers. */
    xxl: 28,
} as const;

const pill = {
    /** 999 — fully rounded; clamped to half the shorter dimension. */
    full: 999,
} as const;

/**
 * Flat radius scale. Kept as the primary export because every existing call site
 * (`theme.radius.md`, `theme.radius.full`) reads from it, and the grouped views
 * below are just a curated lens onto the same numbers.
 */
export const radius = {
    none: 0,
    ...micro,
    ...macro,
    ...pill,
} as const;

/** Role-grouped views over the same scale. */
export const radiusRoles = {
    /** Small objects nested inside a container. */
    micro,
    /** Page-level surfaces: cards, sheets, modals. */
    macro,
    /** Fully-rounded shapes where roundness is the semantic. */
    pill,
} as const;

/**
 * Default radius per component role.
 *
 * Exists so a new component does not have to re-derive the decision — a card
 * reads `componentRadius.card` and is automatically consistent with every other
 * card in the product.
 */
export const componentRadius = {
    card: macro.md,
    modal: macro.xl,
    bottomSheet: macro.lg,
    button: micro.md,
    input: micro.sm,
    chip: pill.full,
    badge: micro.xs,
    avatar: pill.full,
    iconButton: pill.full,
    fab: pill.full,
    toast: micro.md,

    /* ---- Soft-UI refinement additions ---------------------------------- */
    /** Frosted panels share the sheet family so glass and sheet corners align. */
    glass: macro.lg,
    /** A grouped settings section wrapping related rows. */
    section: macro.md,
    /** A list row rendered as its own card. */
    listRow: macro.md,
    /** Dashboard hero — the largest, softest surface on a screen. */
    hero: macro.xl,
    /** Drag affordance at the head of a sheet. Fully rounded by definition. */
    sheetHandle: pill.full,
} as const;

export type Radius = typeof radius;
export type RadiusRole = keyof typeof radiusRoles;
export type ComponentRadius = typeof componentRadius;

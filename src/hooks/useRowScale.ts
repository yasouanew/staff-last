import { useWindowDimensions } from 'react-native';

import { FONT_SCALE_CAP } from '../theme/sizing';

/**
 * Effective text-scale factor for **fixed-geometry** rows.
 *
 * ## The problem
 *
 * Fixed-height rows are a correctness contract, not a cosmetic choice: the Home,
 * Roster and Leave feeds all hand `getItemLayout` a constant
 * ([`SHIFT_ROW_HEIGHT`](src/features/home/components/ShiftCard.tsx:20),
 * [`LEAVE_ROW_HEIGHT`](src/features/leave/screens/LeaveListScreen.tsx:72)) so the list
 * can compute scroll offsets without measuring. The moment the OS text size grows the
 * rows, that constant is a *lie*, and the list desyncs — the scrollbar drifts, and
 * `scrollToIndex` lands in the wrong place.
 *
 * ## The fix, and why it is a pair of constraints
 *
 * 1. **Cap the scale.** Text inside fixed chrome is clamped to `FONT_SCALE_CAP`
 *    (see [`sizing`](src/theme/sizing.ts:1)) via `maxFontSizeMultiplier`, so a label
 *    can never grow past the geometry that was designed to hold it.
 * 2. **Scale the geometry to match.** Both the row's own `minHeight` *and* the number
 *    handed to `getItemLayout` are derived from this hook, so they move together and
 *    the constant is true again.
 *
 * `useWindowDimensions()` re-renders when the OS text size changes, so a user who
 * raises their text size mid-session gets re-measured rows without a relaunch.
 *
 * The value is deliberately **quantised to 0.05**. `fontScale` is a float that can
 * differ in the last decimal between two devices reporting the same setting; rounding
 * keeps the computed heights stable and comparable.
 */
export function useRowScale(): number {
    const { fontScale } = useWindowDimensions();

    if (!Number.isFinite(fontScale) || fontScale <= 1) {
        return 1;
    }

    const capped = Math.min(fontScale, FONT_SCALE_CAP);

    return Math.round(capped * 20) / 20;
}

/**
 * Applies a row scale to a base height.
 *
 * Kept as a free function — not a hook — so it can be called from a `getItemLayout`
 * callback, which is not a render context.
 */
export function scaleRowHeight(baseHeight: number, scale: number): number {
    return Math.round(baseHeight * scale);
}

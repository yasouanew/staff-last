import { useCallback, useState } from 'react';

/**
 * Measured chrome height for a screen-level header, wired to
 * [`AppHeader`](src/components/AppHeader/AppHeader.tsx:1)'s `onHeightChange`.
 *
 * Why measure instead of using `sizing.layout.headerHeight`: that token is the
 * height of the *content row only*. The real chrome height is
 * `insets.top + spacing.sm + rowHeight + spacing.sm`, and `insets.top` alone ranges
 * from 0pt (a flat device with no status bar) to ~62pt (a Dynamic Island iPhone).
 * It also grows when a subtitle wraps. Hard-coding the token as an offset is
 * therefore wrong on every device, in a different way each time.
 *
 * Typical use — a tab root whose list scrolls *underneath* a sticky header:
 *
 * ```tsx
 * const { headerHeight, onHeaderHeightChange } = useHeaderHeight();
 * <ScreenContainer headerHeight={headerHeight}>
 *     <AppHeader title="Home" onHeightChange={onHeaderHeightChange} />
 *     <FlatList
 *         // The list owns the inset here, because it starts at the display edge
 *         // and scrolls beneath the header.
 *         contentContainerStyle={{ paddingTop: headerHeight }}
 *     />
 * </ScreenContainer>
 * ```
 *
 * Avoid wiring `onHeaderHeightChange` when the header is a *sibling* of the
 * scroller rather than an overlay: there the header already occupies its space in
 * layout, and applying the measured height as padding as well would push content
 * down by a whole header height — the same double-offset bug as re-applying the
 * inset.
 */
export function useHeaderHeight(): {
    headerHeight: number;
    onHeaderHeightChange: (height: number) => void;
} {
    const [headerHeight, setHeaderHeight] = useState(0);

    const onHeaderHeightChange = useCallback((height: number) => {
        // Only commit on a real change. `onLayout` fires on every orientation
        // change and font-scale change, and an unconditional `setState` with the
        // same number re-renders every consumer of the list for nothing.
        setHeaderHeight(current => (Math.abs(current - height) < 0.5 ? current : height));
    }, []);

    return { headerHeight, onHeaderHeightChange };
}

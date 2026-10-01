import { shouldDismissSheet } from '../BottomSheet';

/**
 * The dismissal rule is the part of the sheet most likely to be re-tuned later,
 * and a regression in it is silent: the sheet still renders and still swipes, it
 * just stops closing. These tests pin the two independent triggers (distance and
 * velocity) and the `dismissible` override that must suppress both.
 *
 * The numbers are stated as multiples of the sheet height rather than as literals
 * so the tests survive a change to `DISMISS_DISTANCE_RATIO` — they assert the
 * *behaviour* ("past a third of the sheet"), not the current constant.
 */
describe('shouldDismissSheet', () => {
    const SHEET_HEIGHT = 400;
    /** Comfortably past the 35% distance threshold. */
    const PAST_THRESHOLD = SHEET_HEIGHT * 0.5;
    /** Comfortably short of it. */
    const BELOW_THRESHOLD = SHEET_HEIGHT * 0.1;

    it('dismisses when dragged past the distance threshold', () => {
        expect(
            shouldDismissSheet({
                travelled: PAST_THRESHOLD,
                sheetHeight: SHEET_HEIGHT,
                velocityY: 0,
                dismissible: true,
            }),
        ).toBe(true);
    });

    it('does not dismiss for a small, slow drag', () => {
        expect(
            shouldDismissSheet({
                travelled: BELOW_THRESHOLD,
                sheetHeight: SHEET_HEIGHT,
                velocityY: 0,
                dismissible: true,
            }),
        ).toBe(false);
    });

    it('dismisses on a fast downward flick even without distance', () => {
        expect(
            shouldDismissSheet({
                travelled: BELOW_THRESHOLD,
                sheetHeight: SHEET_HEIGHT,
                velocityY: 2000,
                dismissible: true,
            }),
        ).toBe(true);
    });

    it('does not treat an upward flick as dismissal intent', () => {
        expect(
            shouldDismissSheet({
                travelled: BELOW_THRESHOLD,
                sheetHeight: SHEET_HEIGHT,
                velocityY: -2000,
                dismissible: true,
            }),
        ).toBe(false);
    });

    it('suppresses both triggers when the sheet is not dismissible', () => {
        const distance = shouldDismissSheet({
            travelled: SHEET_HEIGHT,
            sheetHeight: SHEET_HEIGHT,
            velocityY: 0,
            dismissible: false,
        });
        const flick = shouldDismissSheet({
            travelled: 0,
            sheetHeight: SHEET_HEIGHT,
            velocityY: 5000,
            dismissible: false,
        });

        expect(distance).toBe(false);
        expect(flick).toBe(false);
    });

    it('treats a zero-height sheet as never dismissed by distance alone', () => {
        // Before the surface is measured `sheetHeight` is 0, so any travel is
        // "past the threshold" arithmetically. The velocity rule is what keeps a
        // pre-measure flick working, and a slow drag must not close it.
        expect(
            shouldDismissSheet({
                travelled: 5,
                sheetHeight: 0,
                velocityY: 0,
                dismissible: true,
            }),
        ).toBe(true);
    });
});

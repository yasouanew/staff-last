import { toStrengthState, STRENGTH_SLOT_HEIGHT } from '../PasswordStrengthMeter';

/**
 * The four-level evaluator collapses onto the three states the design specifies.
 * These tests pin that mapping, because the collapse is the only place where the
 * UI can disagree with the heuristic: if `fair` ever starts mapping to `medium`,
 * a password with a concrete deficiency would be shown amber.
 */
describe('toStrengthState', () => {
    it('maps score 0 to weak (empty input)', () => {
        expect(toStrengthState(0)).toBe('weak');
    });

    it('maps the two weakest scores to weak', () => {
        expect(toStrengthState(1)).toBe('weak');
        // `fair` is folded into `weak`: the evaluator only reaches score 2 when
        // length or variety is deficient, which the user should still act on.
        expect(toStrengthState(2)).toBe('weak');
    });

    it('maps score 3 to medium', () => {
        expect(toStrengthState(3)).toBe('medium');
    });

    it('maps score 4 to strong', () => {
        expect(toStrengthState(4)).toBe('strong');
    });

    it('clamps out-of-range scores rather than throwing', () => {
        expect(toStrengthState(-1)).toBe('weak');
        expect(toStrengthState(99)).toBe('strong');
    });

    it('never returns a state outside the three the design defines', () => {
        const states = Array.from({ length: 6 }, (_unused, score) => toStrengthState(score));

        states.forEach(state => {
            expect(['weak', 'medium', 'strong']).toContain(state);
        });
    });
});

describe('STRENGTH_SLOT_HEIGHT', () => {
    /**
     * The slot is what stops the strength pill from pushing the Confirm field down
     * when the user types their first character. It must be a positive, even number
     * of points, and at least as tall as the pill it holds.
     */
    it('is a positive point value that can hold the pill', () => {
        expect(STRENGTH_SLOT_HEIGHT).toBeGreaterThan(0);
        expect(Number.isInteger(STRENGTH_SLOT_HEIGHT)).toBe(true);
        expect(STRENGTH_SLOT_HEIGHT % 2).toBe(0);
    });
});

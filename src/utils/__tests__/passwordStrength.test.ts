import {
    evaluatePasswordStrength,
    PASSWORD_MIN_LENGTH,
    PASSWORD_STRENGTH_FILL,
    PASSWORD_STRENGTH_SEGMENTS,
} from '../passwordStrength';

/**
 * The strength bar is advisory copy, so the tests assert the properties that
 * would make it *misleading* if they broke: flagging a sub-minimum password as
 * anything but weak, calling a common password strong, or letting the fill map
 * disagree with the segment count.
 */
describe('evaluatePasswordStrength', () => {
    it('returns weak for an empty password', () => {
        expect(evaluatePasswordStrength('')).toBe('weak');
    });

    it('never scores a password below the minimum above weak', () => {
        // Character-diverse but 5 characters: variety alone would look respectable.
        expect(evaluatePasswordStrength('Ab1!x')).toBe('weak');
    });

    it('does not call a common password strong', () => {
        expect(evaluatePasswordStrength('Password123!')).not.toBe('strong');
    });

    it('treats a long, varied password as strong', () => {
        expect(evaluatePasswordStrength('Tr0ub4dor&3xtra-Long!')).toBe('strong');
    });

    it('places a short but varied password at medium', () => {
        expect(evaluatePasswordStrength('aB3!aB3!')).toBe('medium');
    });

    it('mirrors the schema floor of 8 characters', () => {
        expect(PASSWORD_MIN_LENGTH).toBe(8);
    });
});

describe('strength fill map', () => {
    it('fills one, two and three segments for weak, medium and strong', () => {
        expect(PASSWORD_STRENGTH_FILL.weak).toBe(1);
        expect(PASSWORD_STRENGTH_FILL.medium).toBe(2);
        expect(PASSWORD_STRENGTH_FILL.strong).toBe(3);
    });

    it('never fills more segments than the bar draws', () => {
        Object.values(PASSWORD_STRENGTH_FILL).forEach(filled => {
            expect(filled).toBeLessThanOrEqual(PASSWORD_STRENGTH_SEGMENTS);
        });
    });
});

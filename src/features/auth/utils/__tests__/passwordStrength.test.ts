import { evaluatePasswordStrength, passwordMeetsMinimum, PASSWORD_MIN_LENGTH } from '../passwordStrength';

/**
 * The strength meter is advisory copy, so the tests assert the properties that would
 * make it *misleading* if they broke: flagging a sub-minimum password as anything but
 * weak, calling a common password strong, or punishing a long passphrase for lacking
 * symbols.
 */
describe('evaluatePasswordStrength', () => {
    it('returns an empty score for an empty password so the meter can stay hidden', () => {
        const result = evaluatePasswordStrength('');

        expect(result.score).toBe(0);
        expect(result.suggestions).toEqual([]);
    });

    it('never scores a password below the minimum above "weak"', () => {
        // Character-diverse but 5 characters: variety alone would look respectable.
        const result = evaluatePasswordStrength('Ab1!x');

        expect(result.score).toBe(1);
        expect(result.strength).toBe('weak');
        expect(result.suggestions).toContain(`Use at least ${PASSWORD_MIN_LENGTH} characters.`);
    });

    it('does not call a common password strong', () => {
        const result = evaluatePasswordStrength('Password123!');

        expect(result.strength).not.toBe('strong');
        expect(result.suggestions).toContain('Avoid common words or sequences.');
    });

    it('treats a long passphrase as strong even without symbols', () => {
        const result = evaluatePasswordStrength('correct horse battery staple');

        expect(result.score).toBeGreaterThanOrEqual(3);
        expect(['good', 'strong']).toContain(result.strength);
    });

    it('names the specific missing character classes', () => {
        const result = evaluatePasswordStrength('alllowercaseonly');

        expect(result.suggestions).toContain('Add an uppercase letter.');
        expect(result.suggestions).toContain('Add a number.');
        expect(result.suggestions).toContain('Add a symbol, e.g. ! ? #.');
    });

    it('drops suggestions once the password is strong', () => {
        expect(evaluatePasswordStrength('Tr0ub4dor&3xtra-Long!').suggestions).toEqual([]);
    });

    it('caps suggestions at three so the field helper stays readable', () => {
        expect(evaluatePasswordStrength('ab').suggestions.length).toBeLessThanOrEqual(3);
    });

    it('never returns a score above 4', () => {
        expect(evaluatePasswordStrength('aVeryLongPassphrase123!WithSymbols').score).toBeLessThanOrEqual(4);
    });
});

describe('passwordMeetsMinimum', () => {
    it('mirrors the schema floor of 8 characters', () => {
        expect(passwordMeetsMinimum('1234567')).toBe(false);
        expect(passwordMeetsMinimum('12345678')).toBe(true);
    });
});

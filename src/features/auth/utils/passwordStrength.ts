/**
 * Password strength estimation.
 *
 * **This is a hint, not a rule.** The authoritative policy is `Password::defaults()`
 * on the server (spec Screen 3: "min 8, mixed case/number/symbol per Laravel
 * defaults; confirm exact policy from `config` — do not hardcode weaker rule"). The
 * client cannot read that config, so it must never claim a password is acceptable —
 * only describe how strong it appears and let the server reject what it will.
 *
 * The schema in [`authSchemas.ts`](src/features/auth/validation/authSchemas.ts:1)
 * enforces the one rule the spec states explicitly (8 character minimum). Everything
 * else here is advisory copy, which is why it lives outside the Zod schema.
 */

export type PasswordStrength = 'weak' | 'fair' | 'good' | 'strong';

export type PasswordStrengthResult = {
    /** `0`–`4`; `0` means empty. Drives the segmented meter. */
    score: 0 | 1 | 2 | 3 | 4;
    strength: PasswordStrength;
    label: string;
    /** Actionable suggestions, most impactful first. Empty when strong. */
    suggestions: string[];
};

export const PASSWORD_STRENGTH_LABELS: Record<PasswordStrength, string> = {
    weak: 'Weak',
    fair: 'Fair',
    good: 'Good',
    strong: 'Strong',
};

/** The floor the client mirrors: `Password::defaults()` documents a minimum of 8. */
export const PASSWORD_MIN_LENGTH = 8;

/**
 * The character classes Laravel's default rule checks for
 * (`Password::defaults()` mixes letters, numbers and symbols when the application
 * does not narrow it). Each is scored independently so the suggestions can name the
 * specific missing class.
 */
const CHARACTER_CLASSES = [
    { key: 'lowercase', pattern: /[a-z]/, suggestion: 'Add a lowercase letter.' },
    { key: 'uppercase', pattern: /[A-Z]/, suggestion: 'Add an uppercase letter.' },
    { key: 'number', pattern: /\d/, suggestion: 'Add a number.' },
    { key: 'symbol', pattern: /[^A-Za-z0-9]/, suggestion: 'Add a symbol, e.g. ! ? #.' },
] as const;

/**
 * A short, entirely obvious-substring check. This is *not* a breach-corpus lookup —
 * it exists so the meter does not call `Password1!` strong, which would make the hint
 * actively misleading. A real check happens server-side.
 */
const OBVIOUS_FRAGMENTS = [
    'password',
    'qwerty',
    'letmein',
    'welcome',
    'admin',
    'abc123',
    '123456',
    'staffsaas',
];

/**
 * Scores a password for display purposes.
 *
 * Length dominates deliberately: `correct horse battery staple` is a far better
 * password than `P@ssw0rd`, and a meter that says otherwise trains users badly.
 * Length therefore contributes up to 2 points and character variety up to 2.
 */
export function evaluatePasswordStrength(password: string): PasswordStrengthResult {
    if (password.length === 0) {
        return { score: 0, strength: 'weak', label: PASSWORD_STRENGTH_LABELS.weak, suggestions: [] };
    }

    const suggestions: string[] = [];

    if (password.length < PASSWORD_MIN_LENGTH) {
        suggestions.push(`Use at least ${PASSWORD_MIN_LENGTH} characters.`);
    }

    const presentClasses = CHARACTER_CLASSES.filter(characterClass => characterClass.pattern.test(password));

    const missingClasses = CHARACTER_CLASSES.filter(characterClass => !characterClass.pattern.test(password));

    missingClasses.forEach(characterClass => suggestions.push(characterClass.suggestion));

    // Long passwords earn a bonus point rather than a discount, so a 20-character
    // passphrase is never penalised for lacking a symbol.
    const lengthPoints = password.length >= 16 ? 2 : password.length >= PASSWORD_MIN_LENGTH ? 1 : 0;
    const varietyPoints = presentClasses.length >= 3 ? 2 : presentClasses.length === 2 ? 1 : 0;

    let rawScore = lengthPoints + varietyPoints;

    // The penalty is capped at 1 so a long passphrase containing a word like
    // "welcome" is nudged, not condemned.
    const lowercased = password.toLowerCase();
    const hasObviousFragment = OBVIOUS_FRAGMENTS.some(fragment => lowercased.includes(fragment));

    if (hasObviousFragment) {
        rawScore = Math.max(0, rawScore - 1);
        suggestions.unshift('Avoid common words or sequences.');
    }

    // Never advertise better than "weak" while the hard minimum is unmet: the schema
    // will reject the submit, and a green meter on a rejected password is a bad lie.
    if (password.length < PASSWORD_MIN_LENGTH) {
        rawScore = Math.min(rawScore, 1);
    }

    const score = Math.min(4, Math.max(1, rawScore)) as 1 | 2 | 3 | 4;

    const strength: PasswordStrength = score >= 4 ? 'strong' : score === 3 ? 'good' : score === 2 ? 'fair' : 'weak';

    return {
        score,
        strength,
        label: PASSWORD_STRENGTH_LABELS[strength],
        suggestions: strength === 'strong' ? [] : suggestions.slice(0, 3),
    };
}

/** True when the client-side hard minimum is satisfied (the server may still reject). */
export function passwordMeetsMinimum(password: string): boolean {
    return password.length >= PASSWORD_MIN_LENGTH;
}

/**
 * Password strength for the segmented hint bar.
 *
 * A deliberately small, three-state estimator — distinct from the richer
 * advisory evaluator in
 * [`features/auth/utils/passwordStrength.ts`](src/features/auth/utils/passwordStrength.ts:1),
 * which drives the badge-style meter on the account screens. This one exists to
 * feed a 3-segment bar under a single field, so it collapses the same signals
 * onto exactly three levels.
 *
 * **It is a hint, not a rule.** The authoritative policy is the server's
 * `Password::defaults()`; the client only describes how strong a value appears
 * and lets the server reject what it will.
 */

export type PasswordStrengthLevel = 'weak' | 'medium' | 'strong';

/** The floor the client mirrors: `Password::defaults()` documents a minimum of 8. */
export const PASSWORD_MIN_LENGTH = 8;

/** How many segments the hint bar draws. */
export const PASSWORD_STRENGTH_SEGMENTS = 3;

/** Filled-segment count per level: weak 1, medium 2, strong 3. */
export const PASSWORD_STRENGTH_FILL: Record<PasswordStrengthLevel, number> = {
    weak: 1,
    medium: 2,
    strong: 3,
};

/**
 * The character classes Laravel's default rule checks for. Each is scored
 * independently so variety is measured rather than assumed.
 */
const CHARACTER_CLASSES = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/] as const;

/**
 * A short, entirely obvious-substring check. This is *not* a breach-corpus
 * lookup — it exists so the bar does not call `Password1!` strong, which would
 * make the hint actively misleading.
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
] as const;

/**
 * Scores a password onto the three-level scale.
 *
 * Length dominates deliberately: a long passphrase is a better password than a
 * short, busy one, so length contributes up to 2 points and character variety up
 * to 2. A value below the minimum can never read better than `weak`, because the
 * schema will reject it and a green bar on a rejected password is a lie.
 */
export function evaluatePasswordStrength(password: string): PasswordStrengthLevel {
    if (password.length < PASSWORD_MIN_LENGTH) {
        return 'weak';
    }

    const variety = CHARACTER_CLASSES.filter(pattern => pattern.test(password)).length;

    const lengthPoints = password.length >= 16 ? 2 : 1;
    const varietyPoints = variety >= 3 ? 2 : variety === 2 ? 1 : 0;

    let score = lengthPoints + varietyPoints;

    // The penalty is a single point so a long passphrase containing a word like
    // "welcome" is nudged, not condemned.
    const lowercased = password.toLowerCase();

    if (OBVIOUS_FRAGMENTS.some(fragment => lowercased.includes(fragment))) {
        score -= 1;
    }

    if (score >= 4) {
        return 'strong';
    }

    if (score >= 2) {
        return 'medium';
    }

    return 'weak';
}

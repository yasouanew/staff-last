import {
    forgotPasswordSchema,
    loginSchema,
    resetPasswordSchema,
    updatePasswordSchema,
    updateProfileSchema,
} from '../authSchemas';

/**
 * These tests pin the *boundary* between client and server validation.
 *
 * The schemas deliberately mirror the Laravel FormRequests but stay looser wherever
 * the server rule is stricter (notably `Password::defaults()`), because a client that
 * rejects a password the backend would accept is a bug that locks users out. The
 * assertions below therefore check two things: that obvious mistakes are caught, and
 * that the client does **not** over-reach.
 */

describe('loginSchema', () => {
    it('accepts a well-formed credential pair', () => {
        const result = loginSchema.safeParse({
            email: 'jane@example.com',
            password: 'anything',
        });

        expect(result.success).toBe(true);
    });

    it('lowercases and trims the email, matching the backend lookup', () => {
        const result = loginSchema.parse({
            email: '  Jane.Doe@Example.COM  ',
            password: 'anything',
        });

        expect(result.email).toBe('jane.doe@example.com');
    });

    it('rejects a malformed email', () => {
        const result = loginSchema.safeParse({ email: 'not-an-email', password: 'x' });

        expect(result.success).toBe(false);
    });

    it('rejects an empty password but imposes no complexity rule', () => {
        expect(loginSchema.safeParse({ email: 'jane@example.com', password: '' }).success).toBe(false);

        // A one-character password is intentionally allowed through: the backend's
        // login rule only requires presence, and a complexity rule here would block a
        // user whose password predates the current policy.
        expect(loginSchema.safeParse({ email: 'jane@example.com', password: 'a' }).success).toBe(true);
    });
});

describe('forgotPasswordSchema', () => {
    it('accepts an email and normalises its casing', () => {
        expect(forgotPasswordSchema.parse({ email: 'JANE@EXAMPLE.COM' })).toEqual({
            email: 'jane@example.com',
        });
    });

    it('rejects an empty email', () => {
        expect(forgotPasswordSchema.safeParse({ email: '' }).success).toBe(false);
    });
});

describe('resetPasswordSchema', () => {
    const valid = {
        token: 'abc123',
        email: 'jane@example.com',
        password: 'correct horse battery',
        password_confirmation: 'correct horse battery',
    };

    it('accepts a complete, matching payload', () => {
        expect(resetPasswordSchema.safeParse(valid).success).toBe(true);
    });

    it('requires the token, because the screen cannot submit without it', () => {
        const result = resetPasswordSchema.safeParse({ ...valid, token: '' });

        expect(result.success).toBe(false);

        if (!result.success) {
            expect(result.error.issues.some(issue => issue.path[0] === 'token')).toBe(true);
        }
    });

    it('enforces the documented 8-character minimum', () => {
        expect(resetPasswordSchema.safeParse({ ...valid, password: 'short', password_confirmation: 'short' }).success).toBe(
            false,
        );
    });

    it('accepts a long passphrase with no symbols, rather than over-reaching', () => {
        const result = resetPasswordSchema.safeParse({
            ...valid,
            password: 'correct horse battery staple',
            password_confirmation: 'correct horse battery staple',
        });

        expect(result.success).toBe(true);
    });

    it('reports a mismatch against the confirmation field, not the password field', () => {
        const result = resetPasswordSchema.safeParse({
            ...valid,
            password_confirmation: 'different',
        });

        expect(result.success).toBe(false);

        if (!result.success) {
            const mismatch = result.error.issues.find(issue => issue.message === 'Passwords do not match.');

            expect(mismatch?.path).toEqual(['password_confirmation']);
        }
    });
});

describe('updateProfileSchema', () => {
    it('requires a non-blank name', () => {
        expect(updateProfileSchema.safeParse({ name: '   ', email: 'jane@example.com' }).success).toBe(false);
    });

    it('trims the name', () => {
        expect(updateProfileSchema.parse({ name: '  Jane Doe  ', email: 'jane@example.com' }).name).toBe('Jane Doe');
    });
});

describe('updatePasswordSchema', () => {
    it('shares the 8-character floor and the confirmed rule with the reset schema', () => {
        expect(
            updatePasswordSchema.safeParse({ password: 'longenough', password_confirmation: 'longenough' }).success,
        ).toBe(true);

        expect(
            updatePasswordSchema.safeParse({ password: 'longenough', password_confirmation: 'mismatch' }).success,
        ).toBe(false);
    });
});

import { buildResetDeepLink, extractResetTokenFromUrl, parseResetParams } from '../resetLink';

/**
 * The reset link is the one entry point the app does not control, so these tests
 * concentrate on hostile input: params that are missing, the wrong type, or
 * percent-encoded. Rendering the string `"undefined"` into an email field, or
 * crashing on mount, would both be worse than an empty input the user can fill in.
 */
describe('parseResetParams', () => {
    it('passes through a complete pair and flags it as link-sourced', () => {
        expect(parseResetParams({ token: 'tok_123', email: 'jane@example.com' })).toEqual({
            token: 'tok_123',
            email: 'jane@example.com',
            fromLink: true,
        });
    });

    it('returns empty strings when params are absent entirely', () => {
        expect(parseResetParams(undefined)).toEqual({ token: '', email: '', fromLink: false });
        expect(parseResetParams(null)).toEqual({ token: '', email: '', fromLink: false });
    });

    it('treats a missing email as "not from a link", since Laravel may send only the token', () => {
        expect(parseResetParams({ token: 'tok_123' })).toEqual({
            token: 'tok_123',
            email: '',
            fromLink: false,
        });
    });

    it('coerces non-string values instead of leaking them into the form', () => {
        expect(parseResetParams({ token: 42, email: { evil: true } })).toEqual({
            token: '',
            email: '',
            fromLink: false,
        });
    });

    it('trims surrounding whitespace picked up from a paste', () => {
        expect(parseResetParams({ token: '  tok_123  ', email: '  jane@example.com  ' })).toEqual({
            token: 'tok_123',
            email: 'jane@example.com',
            fromLink: true,
        });
    });

    it('decodes a percent-encoded email', () => {
        expect(parseResetParams({ token: 't', email: 'jane%40example.com' }).email).toBe('jane@example.com');
    });

    it('falls back to the raw value when decoding throws on a stray percent sign', () => {
        expect(parseResetParams({ token: 't', email: '100%done' }).email).toBe('100%done');
    });
});

describe('extractResetTokenFromUrl', () => {
    it('extracts a token from a full https link', () => {
        const result = extractResetTokenFromUrl(
            'https://app.example.com/reset-password?token=tok_123&email=jane%40example.com',
        );

        expect(result).toEqual({ token: 'tok_123', email: 'jane@example.com', fromLink: true });
    });

    it('returns null when the URL carries no query string', () => {
        expect(extractResetTokenFromUrl('https://app.example.com/reset-password')).toBeNull();
    });

    it('returns null when the query string has no token, so callers cannot navigate blind', () => {
        expect(extractResetTokenFromUrl('https://app.example.com/reset-password?email=jane@example.com')).toBeNull();
    });

    it('returns null for an empty string', () => {
        expect(extractResetTokenFromUrl('')).toBeNull();
    });

    it('ignores malformed pairs without throwing', () => {
        const result = extractResetTokenFromUrl('https://app.example.com/reset-password?=broken&token=tok_123');

        expect(result?.token).toBe('tok_123');
    });
});

describe('buildResetDeepLink', () => {
    it('builds a scheme link with both params', () => {
        const link = buildResetDeepLink({ token: 'tok_123', email: 'jane@example.com' });

        expect(link).toContain('reset-password?');
        expect(link).toContain('token=tok_123');
        expect(link).toContain('email=jane%40example.com');
    });

    it('omits absent params rather than emitting empty ones', () => {
        const link = buildResetDeepLink({});

        expect(link.endsWith('reset-password')).toBe(true);
    });
});

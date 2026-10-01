import { REDACTED, redact } from '../redact';

/**
 * Redaction is a security boundary: an error cause routinely carries whole request
 * configs (Authorization headers, passwords, FCM tokens) and user PII. These tests pin
 * that none of that can reach a reporter, while the report stays structurally useful.
 */
describe('redact', () => {
    it('redacts sensitive keys regardless of casing or nesting', () => {
        const result = redact({
            Authorization: 'Bearer 1|secret',
            headers: { 'X-Fcm-Token': 'fcm:abc' },
            user: { email: 'jane@example.com', phone: '+61400000000' },
            password_confirmation: 'secret',
            safe: 'kept',
        }) as Record<string, unknown>;

        expect(result.Authorization).toBe(REDACTED);
        expect((result.headers as Record<string, unknown>)['X-Fcm-Token']).toBe(REDACTED);
        expect((result.user as Record<string, unknown>).email).toBe(REDACTED);
        expect((result.user as Record<string, unknown>).phone).toBe(REDACTED);
        expect(result.password_confirmation).toBe(REDACTED);
        expect(result.safe).toBe('kept');
    });

    it('matches sensitive keys as substrings (accessToken, refresh_token, apiKey)', () => {
        const result = redact({
            accessToken: 'a',
            refresh_token: 'b',
            apiKey: 'c',
            api_key: 'd',
        }) as Record<string, unknown>;

        expect(Object.values(result)).toEqual([REDACTED, REDACTED, REDACTED, REDACTED]);
    });

    it('truncates long strings so a body cannot blow up a report', () => {
        const long = 'x'.repeat(1000);
        const result = redact({ note: long }) as { note: string };

        expect(result.note.length).toBeLessThan(long.length);
        expect(result.note).toContain('[truncated]');
    });

    it('preserves numbers and booleans', () => {
        const result = redact({ status: 500, retried: false }) as Record<string, unknown>;

        expect(result).toEqual({ status: 500, retried: false });
    });

    it('serialises an Error to name/message/stack', () => {
        const result = redact(new Error('boom')) as Record<string, unknown>;

        expect(result.name).toBe('Error');
        expect(result.message).toBe('boom');
        expect(typeof result.stack).toBe('string');
    });

    it('caps depth rather than recursing without bound', () => {
        const deep = { a: { b: { c: { d: { e: 'too deep' } } } } };
        const result = redact(deep) as Record<string, unknown>;

        expect(JSON.stringify(result)).toContain('[depth-limit]');
    });

    it('caps array length', () => {
        const result = redact({ items: Array.from({ length: 100 }, (_, i) => i) }) as {
            items: number[];
        };

        expect(result.items.length).toBeLessThanOrEqual(20);
    });

    it('handles null and undefined without throwing', () => {
        expect(redact(null)).toBeNull();
        expect(redact(undefined)).toBeUndefined();
    });
});

/**
 * Redaction policy for diagnostics.
 *
 * Everything that leaves the device for a crash/error reporter — or even a debug log —
 * must be scrubbed first. Error causes routinely carry whole request configs and
 * response bodies: `Authorization` headers, `password`/`password_confirmation` fields,
 * `fcm_token`s, and user PII (email, phone). Shipping any of that to a third-party
 * reporter would be a data leak.
 *
 * The policy is **allow-by-shape, redact-by-key**: structure is preserved (so a report
 * is still readable), but any value whose key matches a sensitive pattern is replaced,
 * and every string is truncated so a body cannot blow up a report.
 */

/** Keys whose values are never reported, matched case-insensitively as substrings. */
const SENSITIVE_KEY_PATTERNS = [
    'authorization',
    'token',
    'password',
    'secret',
    'cookie',
    'api_key',
    'apikey',
    'fcm',
    'refresh',
    'credential',
    'ssn',
    'card',
    'cvv',
    // PII
    'email',
    'phone',
];

/** Marker substituted for a redacted value. */
export const REDACTED = '[redacted]';

/** Maximum string length retained in a report. */
const MAX_STRING_LENGTH = 500;

/** Maximum object/array depth walked. */
const MAX_DEPTH = 4;

/** Maximum array entries retained. */
const MAX_ARRAY_LENGTH = 20;

function isSensitiveKey(key: string): boolean {
    const lower = key.toLowerCase();

    return SENSITIVE_KEY_PATTERNS.some(pattern => lower.includes(pattern));
}

function truncate(value: string): string {
    return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}…[truncated]` : value;
}

/**
 * Recursively redacts `value` for reporting.
 *
 * - sensitive keys → `REDACTED`
 * - strings → truncated
 * - `Error` → `{ name, message, stack }` (stack truncated)
 * - depth and array length are capped to keep reports bounded
 */
export function redact(value: unknown, depth = 0): unknown {
    if (value === null || value === undefined) {
        return value;
    }

    if (typeof value === 'string') {
        return truncate(value);
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }

    if (typeof value === 'bigint') {
        return value.toString();
    }

    if (value instanceof Error) {
        return {
            name: value.name,
            message: truncate(value.message),
            // The stack can contain file paths but not secrets; it is the most useful
            // diagnostic field, so it is kept (truncated).
            stack: value.stack ? truncate(value.stack) : undefined,
        };
    }

    if (depth >= MAX_DEPTH) {
        return '[depth-limit]';
    }

    if (Array.isArray(value)) {
        return value.slice(0, MAX_ARRAY_LENGTH).map(item => redact(item, depth + 1));
    }

    if (typeof value === 'object') {
        const source = value as Record<string, unknown>;
        const output: Record<string, unknown> = {};

        for (const key of Object.keys(source)) {
            output[key] = isSensitiveKey(key) ? REDACTED : redact(source[key], depth + 1);
        }

        return output;
    }

    // Functions, symbols, etc. have no reportable value.
    return `[${typeof value}]`;
}

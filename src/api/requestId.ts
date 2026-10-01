/**
 * Request correlation ids.
 *
 * Every outgoing request carries an `X-Request-Id`. When something goes wrong, the same
 * id appears in the client error ([`AppError.requestId`](src/types/appError.ts:1)), in
 * the structured log line, and — because Laravel's middleware echoes it — in the server
 * logs. That is what turns "the app failed for Jane at 3pm" into a single traceable
 * request.
 *
 * ## Format
 *
 * `crypto.randomUUID` is used when the platform provides it (Hermes with the Web Crypto
 * polyfill, and Node under Jest). React Native's core `Math.random` fallback is
 * intentionally avoided: it is not seeded per-call and could collide across a burst of
 * concurrent requests. Where `randomUUID` is unavailable, a time + counter + random
 * composite is used, which is still unique within a device session.
 */

let counter = 0;

/** Generates a correlation id. Exported for tests. */
export function generateRequestId(): string {
    const cryptoRef = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;

    if (typeof cryptoRef?.randomUUID === 'function') {
        return cryptoRef.randomUUID();
    }

    counter = (counter + 1) % 1_000_000;

    const random = Math.random().toString(36).slice(2, 10);

    return `req-${Date.now().toString(36)}-${counter.toString(36)}-${random}`;
}

/**
 * Reads a correlation id back out of a response, preferring the server's own id when it
 * echoes one (some proxies and Laravel's `RequestId` middleware do).
 */
export function readResponseRequestId(headers: unknown): string | undefined {
    if (headers === null || typeof headers !== 'object') {
        return undefined;
    }

    const getter = headers as { get?: (name: string) => unknown };

    if (typeof getter.get !== 'function') {
        return undefined;
    }

    const value = getter.get('x-request-id');

    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

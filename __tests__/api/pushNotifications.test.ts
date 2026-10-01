import { deviceTokenApi } from '../../src/features/notifications/api/deviceTokenApi';
import { notificationsApi } from '../../src/features/notifications/api/notificationsApi';
import type { AppError } from '../../src/types/appError';
import { deviceTokenResource, notificationList } from '../../src/testing/api/fixtures';
import { createApiHarness, rejectionOf } from '../../src/testing/api/harness';
import { fail, networkError, ok, raw, validationError } from '../../src/testing/api/mockServer';

/**
 * Suite 4 — Push Notifications.
 *
 * Covers the device-token lifecycle (`POST /device-tokens`, `DELETE /device-tokens`) plus
 * the notification reads that back the inbox.
 *
 * These two endpoints are unusual, and the tests exist because of it:
 *
 * - They bypass the typed `api.*` helpers and use the raw `axiosInstance`, so the
 *   behaviour under test is the *client's* interceptors, not a helper's.
 * - **Unregister sends a JSON body on DELETE**, which is legal but uncommon, and the
 *   body must survive (`{ data: { token } }`) or the server cannot know which device is
 *   being removed.
 * - `POST /device-tokens` may legitimately return **no body**, so the client must treat
 *   absence as success rather than as a contract violation.
 */

const harness = createApiHarness();

beforeEach(() => {
    harness.setup();
});

afterEach(() => {
    harness.teardown();
});

describe('Push Notifications — device token registration', () => {
    it('registers a device and returns the validated resource', async () => {
        await harness.signIn();

        harness.server.post('/device-tokens', () => ok(deviceTokenResource()));

        const result = await deviceTokenApi.register({
            token: 'fcm:device-token-abc',
            platform: 'android',
            device_name: 'Pixel 8',
        });

        expect(result).toEqual({
            id: 11,
            device_name: 'Pixel 8',
            platform: 'android',
            is_active: true,
            last_used_at: '2026-09-24T08:00:00+10:00',
        });
    });

    it('sends the registration payload to the right endpoint with the bearer token', async () => {
        await harness.signIn('1|push-token-test');

        harness.server.post('/device-tokens', () => ok(deviceTokenResource()));

        await deviceTokenApi.register({
            token: 'fcm:device-token-abc',
            platform: 'ios',
            device_name: 'iPhone 15',
            app_version: '1.4.0',
            os_version: '18.1',
        });

        const [request] = harness.server.requestsTo('/device-tokens');

        expect(request?.method).toBe('POST');
        expect(request?.headers.authorization).toBe('Bearer 1|push-token-test');
        expect(request?.body).toEqual({
            token: 'fcm:device-token-abc',
            platform: 'ios',
            device_name: 'iPhone 15',
            app_version: '1.4.0',
            os_version: '18.1',
        });
    });

    it('treats a body-less 200 as success, because the endpoint may return nothing', async () => {
        await harness.signIn();

        // The backend can legitimately upsert and return no payload. A client that
        // demanded a resource would report a successful registration as a failure.
        harness.server.post('/device-tokens', () => ok());

        await expect(
            deviceTokenApi.register({ token: 'fcm:t', platform: 'android' }),
        ).resolves.toBeUndefined();
    });

    it('treats a 204 No Content as success', async () => {
        await harness.signIn();

        // A real 204 carries an empty body. `unwrapEnvelope` does not treat a string as
        // an envelope, so `response.data` stays `''` — which must be taken as "nothing
        // to report" rather than handed to the resource schema.
        harness.server.post('/device-tokens', () => raw(204, ''));

        await expect(
            deviceTokenApi.register({ token: 'fcm:t', platform: 'ios' }),
        ).resolves.toBeUndefined();
    });

    it('validates the resource when the backend does echo one', async () => {
        await harness.signIn();

        harness.server.post('/device-tokens', () => ok({ id: 11, platform: 'android' }));

        const error = (await rejectionOf(
            deviceTokenApi.register({ token: 'fcm:t', platform: 'android' }),
        )) as AppError;

        // A partial resource is a contract violation, not a silently-accepted shape.
        expect(error.kind).toBe('server');
    });

    it('reads the resource from the interceptor’s unwrapped payload, not a nested data key', async () => {
        await harness.signIn();

        harness.server.post('/device-tokens', () => ok(deviceTokenResource()));

        const result = await deviceTokenApi.register({ token: 'fcm:t', platform: 'android' });

        /*
         * REGRESSION GUARD for a real defect this suite found. The response interceptor
         * replaces `response.data` with the envelope's `data` contents, so the resource
         * is at `response.data`. The method previously read `response.data.data`, a key
         * the server never sends, and therefore returned `undefined` for **every**
         * successful registration — silently discarding the resource the caller needs to
         * confirm the device was stored.
         */
        expect(result).not.toBeUndefined();
        expect(result?.id).toBe(11);
    });

    it('returns undefined when the envelope carries no data key at all', async () => {
        await harness.signIn();

        // `{ success: true, message: 'OK' }` with no `data` is the endpoint's documented
        // "nothing to report" shape. `unwrapEnvelope` maps an absent `data` to
        // `undefined`, so the caller must treat that as a successful no-op.
        harness.server.post('/device-tokens', () => ok());

        const result = await deviceTokenApi.register({ token: 'fcm:t', platform: 'android' });

        expect(result).toBeUndefined();
    });

    it('normalises a rejected registration rather than leaking an axios error', async () => {
        await harness.signIn();

        harness.server.post('/device-tokens', () =>
            validationError({ token: ['The token field is required.'] }),
        );

        const error = (await rejectionOf(
            deviceTokenApi.register({ token: '', platform: 'android' }),
        )) as AppError;

        expect(error.kind).toBe('validation');
        expect(error.fieldErrors?.token?.[0]).toContain('required');
    });

    it('surfaces an invalid-token 404 for the caller to discard the token', async () => {
        await harness.signIn();

        harness.server.post('/device-tokens', () => fail(404, 'The device token is no longer valid.'));

        const error = (await rejectionOf(
            deviceTokenApi.register({ token: 'fcm:stale', platform: 'android' }),
        )) as AppError;

        // 404 is the status the push service branches on to delete the local token
        // instead of looping on it. `status` is preserved so the caller can react.
        expect(error.kind).toBe('not_found');
        expect(error.status).toBe(404);
    });

    it('keeps the HTTP status on a 410 so a dead token is still distinguishable', async () => {
        await harness.signIn();

        harness.server.post('/device-tokens', () => fail(410, 'Gone.'));

        const error = (await rejectionOf(
            deviceTokenApi.register({ token: 'fcm:gone', platform: 'android' }),
        )) as AppError;

        /*
         * 410 is not one of the statuses `kindFromStatus` names explicitly, so it falls
         * through to `unknown`. That mapping is pre-existing and is left as-is here — the
         * point of this test is narrower: the *status* survives normalisation, so a
         * caller that needs to distinguish 404 from 410 still can. It also guards the
         * double-normalisation fix, which previously replaced even the status with
         * nothing.
         */
        expect(error.status).toBe(410);
    });

    it('reports an offline registration as a network error, not a server fault', async () => {
        await harness.signIn();

        harness.server.post('/device-tokens', () => networkError());

        const error = (await rejectionOf(
            deviceTokenApi.register({ token: 'fcm:t', platform: 'android' }),
        )) as AppError;

        expect(error.kind).toBe('network');
    });

    it('does not retry a registration POST automatically', async () => {
        await harness.signIn();

        harness.server.post('/device-tokens', () => fail(503, 'Service Unavailable'));

        await rejectionOf(deviceTokenApi.register({ token: 'fcm:t', platform: 'android' }));

        // The push service queues a retry through the outbox, which knows the token's
        // identity and can dedupe. An automatic replay here would re-upsert blindly.
        expect(harness.server.hitCount('/device-tokens')).toBe(1);
    });

    it('is idempotent-safe: a repeat registration is a fresh request, not a no-op', async () => {
        await harness.signIn();

        harness.server.post('/device-tokens', () => ok(deviceTokenResource()));

        await deviceTokenApi.register({ token: 'fcm:t', platform: 'android' });
        await deviceTokenApi.register({ token: 'fcm:t', platform: 'android' });

        // The backend upserts, so the client deliberately does no de-duplication: both
        // calls must reach the server so a rotated device row is refreshed.
        expect(harness.server.hitCount('/device-tokens')).toBe(2);
    });
});

describe('Push Notifications — device token deletion', () => {
    it('sends the token in a JSON body on DELETE', async () => {
        await harness.signIn();

        harness.server.delete('/device-tokens', () => ok());

        await deviceTokenApi.unregister('fcm:device-token-abc');

        const [request] = harness.server.requestsTo('/device-tokens');

        expect(request?.method).toBe('DELETE');
        // The unusual part: a DELETE with a body. Without it the server cannot identify
        // which of the user's devices is being removed.
        expect(request?.body).toEqual({ token: 'fcm:device-token-abc' });
    });

    it('attaches the bearer token to the unregister request', async () => {
        await harness.signIn('1|unregister-token');

        harness.server.delete('/device-tokens', () => ok());

        await deviceTokenApi.unregister('fcm:t');

        const [request] = harness.server.requestsTo('/device-tokens');

        expect(request?.headers.authorization).toBe('Bearer 1|unregister-token');
    });

    it('resolves on a body-less success, since there is nothing to return', async () => {
        await harness.signIn();

        harness.server.delete('/device-tokens', () => raw(204, ''));

        await expect(deviceTokenApi.unregister('fcm:t')).resolves.toBeUndefined();
    });

    it('treats an already-removed token (404) as a reportable failure, not a crash', async () => {
        await harness.signIn();

        harness.server.delete('/device-tokens', () => fail(404, 'Token not found.'));

        const error = (await rejectionOf(deviceTokenApi.unregister('fcm:gone'))) as AppError;

        // The push service specifically treats 404/410 as "already removed" and completes;
        // the API layer must therefore surface the status rather than swallowing it.
        expect(error.kind).toBe('not_found');
        expect(error.status).toBe(404);
    });

    it('reports a 403 on unregister distinctly, so the UI can explain it', async () => {
        await harness.signIn();

        harness.server.delete('/device-tokens', () => fail(403, 'This action is unauthorized.'));

        const error = (await rejectionOf(deviceTokenApi.unregister('fcm:t'))) as AppError;

        expect(error.kind).toBe('forbidden');
    });

    it('does not retry the unregister DELETE', async () => {
        await harness.signIn();

        harness.server.delete('/device-tokens', () => fail(503, 'Service Unavailable'));

        await rejectionOf(deviceTokenApi.unregister('fcm:t'));

        // DELETE is idempotent by HTTP semantics, but the policy restricts retries to
        // GET/HEAD/OPTIONS so the outbox retains ownership of write replay.
        expect(harness.server.hitCount('/device-tokens')).toBe(1);
    });

    it('surfaces an expired session on unregister so the client can sign out', async () => {
        await harness.signIn();

        harness.server.delete('/device-tokens', () => fail(401, 'Unauthenticated.'));

        const error = (await rejectionOf(deviceTokenApi.unregister('fcm:t'))) as AppError;

        expect(error.kind).toBe('unauthorized');
    });
});

describe('Push Notifications — notification reads that back the inbox', () => {
    it('fetches the unread count that drives the tab badge', async () => {
        await harness.signIn();

        harness.server.get('/notifications/unread-count', () => ok({ count: 12 }));

        await expect(notificationsApi.unreadCount()).resolves.toEqual({ count: 12 });
    });

    it('rejects an unread count that is not a number', async () => {
        await harness.signIn();

        harness.server.get('/notifications/unread-count', () => ok({ count: '12' }));

        const error = (await rejectionOf(notificationsApi.unreadCount())) as AppError;

        // A stringified count would render as "12" but break arithmetic on the badge.
        expect(error.kind).toBe('server');
    });

    it('marks one notification read', async () => {
        await harness.signIn();

        harness.server.post('/notifications/ntf-1/read', () => ok());

        await notificationsApi.markAsRead('ntf-1');

        const [request] = harness.server.requestsTo('/notifications/ntf-1/read');

        expect(request?.method).toBe('POST');
    });

    it('marks all notifications read', async () => {
        await harness.signIn();

        harness.server.post('/notifications/read-all', () => ok());

        await notificationsApi.markAllAsRead();

        expect(harness.server.hitCount('/notifications/read-all')).toBe(1);
    });

    it('fetches the inbox with the documented wrapper', async () => {
        await harness.signIn();

        harness.server.get('/notifications', () => ok(notificationList()));

        const result = await notificationsApi.list({ filter: 'unread', per_page: 30 });

        const [request] = harness.server.requestsTo('/notifications');

        expect(request?.params).toEqual({ filter: 'unread', per_page: '30' });
        expect(result.notifications[0]?.type).toBe('shift.assigned');
    });

    it('surfaces a throttled notification read so the UI can slow down', async () => {
        await harness.signIn();

        harness.server.get('/notifications', () => fail(429, 'Too many requests.'));

        const error = (await rejectionOf(notificationsApi.list())) as AppError;

        expect(error.kind).toBe('throttled');
    });
});

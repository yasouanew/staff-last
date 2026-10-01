import { authApi } from '../../src/features/auth/api/authApi';
import { leaveApi } from '../../src/features/leave/api/leaveApi';
import { notificationsApi } from '../../src/features/notifications/api/notificationsApi';
import type { AppError } from '../../src/types/appError';
import { isRetryable, toFieldErrorMap } from '../../src/utils/errors';
import { authUser, leaveRequest, notificationList } from '../../src/testing/api/fixtures';
import { createApiHarness, rejectionOf } from '../../src/testing/api/harness';
import {
    fail,
    html,
    networkError,
    ok,
    raw,
    timeout,
    validationError,
} from '../../src/testing/api/mockServer';

/**
 * Suite 2 — Resilience & Edge Cases.
 *
 * Everything here is about a backend that is *wrong* rather than merely unavailable:
 * a renamed field, a truncated body, a gateway HTML page, a contradictory
 * `success: false` on a 2xx. These are the failures that a type cast hides — the app
 * would render `undefined` and the user would see a blank screen with no error — so
 * they are the ones most worth pinning.
 */

const harness = createApiHarness();

beforeEach(() => {
    harness.setup();
});

afterEach(() => {
    harness.teardown();
});

describe('Resilience & Edge Cases', () => {
    describe('malformed envelope', () => {
        it('rejects a 2xx body claiming a non-boolean success flag', async () => {
            // `success: "yes"` is not a envelope; the client refuses to guess.
            harness.server.get('/auth/me', () =>
                raw(200, { success: 'yes', message: 'ok', data: authUser() }),
            );

            const error = (await rejectionOf(authApi.me())) as AppError;

            expect(error.kind).toBe('server');
            // The client's envelope guard uses the generic server copy rather than the
            // contract-violation copy used by the Zod boundary — both are `server`, and
            // neither ever shows the raw body.
            expect(error.message).toBe('Something went wrong on our end. Please try again shortly.');
        });

        it('rejects a 2xx body with success:false as contradictory', async () => {
            harness.server.get('/auth/me', () =>
                raw(200, { success: false, message: 'Something went wrong.' }),
            );

            const error = (await rejectionOf(authApi.me())) as AppError;

            // A 2xx that denies success is a server fault. The server's own message is
            // preserved, because it is more useful than a generic one.
            expect(error.kind).toBe('server');
            expect(error.status).toBe(200);
            expect(error.message).toBe('Something went wrong.');
        });

        it('rejects an HTML gateway page rather than trying to parse it', async () => {
            harness.server.get('/auth/me', () => html(502));

            const error = (await rejectionOf(authApi.me())) as AppError;

            // A proxy error page is not JSON; rendering it would show markup to the user.
            expect(error.kind).toBe('server');
        });

        it('passes a bare (un-enveloped) payload through rather than rejecting it', async () => {
            /*
             * Not every endpoint wraps its response in the Laravel envelope. A body with
             * no `success` key is treated as the payload itself — which is why the schema
             * validation below is the real contract guard, not the envelope check.
             */
            harness.server.get('/auth/me', () => raw(200, authUser()));

            await expect(authApi.me()).resolves.toMatchObject({ id: 7 });
        });
    });

    describe('malformed payload (contract violation)', () => {
        it('rejects a response where a field was renamed', async () => {
            // The classic silent failure: `employee_id` becomes `employeeId`, the cast
            // would pass, and every shift query would silently scope to nothing.
            const { employee_id, ...renamed } = authUser({ employeeId: 42 }) as Record<string, unknown> & {
                employee_id: number;
            };

            expect(employee_id).toBe(42);

            harness.server.get('/auth/me', () => ok(renamed));

            const error = (await rejectionOf(authApi.me())) as AppError;

            expect(error.kind).toBe('server');
            expect((error.cause as { issues?: unknown[] })?.issues).toBeDefined();
        });

        it('rejects a response where a nullable field became the wrong type', async () => {
            harness.server.get('/auth/me', () => ok(authUser({ employee_id: '42' })));

            const error = (await rejectionOf(authApi.me())) as AppError;

            expect(error.kind).toBe('server');
        });

        it('rejects a notification list that switched to the standard paginator', async () => {
            /*
             * `GET /notifications` returns `data.notifications`, not `data.data`. A
             * backend that "helpfully" standardised it would otherwise render an empty
             * screen with no error — the worst possible outcome, because it looks like
             * the user simply has no notifications.
             */
            harness.server.get('/notifications', () =>
                ok({ data: [], meta: { current_page: 1, last_page: 1, per_page: 30, total: 0 } }),
            );

            const error = (await rejectionOf(notificationsApi.list())) as AppError;

            expect(error.kind).toBe('server');
        });

        it('accepts the documented custom notification wrapper', async () => {
            harness.server.get('/notifications', () => ok(notificationList()));

            const result = await notificationsApi.list({ per_page: 30 });

            expect(result.notifications).toHaveLength(1);
            expect(result.unread_count).toBe(1);
        });

        it('reports a contract violation as retryable, since blips are transient', async () => {
            harness.server.get('/auth/me', () => ok(authUser({ id: 'not-a-number' })));

            const error = (await rejectionOf(authApi.me())) as AppError;

            // `server` is retryable by design: a truncated body is worth one more ask,
            // and a permanent mismatch simply fails again without harm.
            expect(isRetryable(error)).toBe(true);
        });
    });

    describe('server-side validation errors (422)', () => {
        it('exposes per-field messages through the field-error map', async () => {
            harness.server.post('/auth/login', () =>
                validationError({
                    email: ['The email field is required.'],
                    password: ['The password field is required.'],
                }),
            );

            const error = (await rejectionOf(
                authApi.login({ email: '', password: '' }),
            )) as AppError;

            expect(error.kind).toBe('validation');
            expect(error.status).toBe(422);
            expect(error.fieldErrors).toEqual({
                email: ['The email field is required.'],
                password: ['The password field is required.'],
            });
        });

        it('flattens to the first message per field, which is all a mobile input shows', async () => {
            harness.server.post('/leave-requests', () =>
                validationError({
                    employee_id: ['The employee id field is required.', 'A second message.'],
                    reason: ['The reason must not exceed 1000 characters.'],
                }),
            );

            const error = (await rejectionOf(
                leaveApi.create({
                    employee_id: 42,
                    leave_type_id: 2,
                    start_date: '2026-10-01',
                    end_date: '2026-10-01',
                }),
            )) as AppError;

            expect(toFieldErrorMap(error)).toEqual({
                employee_id: 'The employee id field is required.',
                reason: 'The reason must not exceed 1000 characters.',
            });
        });

        it('carries the G2 employee_id requirement as a field error on create', async () => {
            /*
             * A live 422 proved the server does **not** inject `employee_id` on create
             * (unlike the index, which auto-scopes). The client therefore sends it, and
             * this pins the error shape the screen maps back onto the form.
             */
            harness.server.post('/leave-requests', () =>
                validationError({ employee_id: ['The employee id field is required.'] }),
            );

            const error = (await rejectionOf(
                leaveApi.create({
                    employee_id: 0,
                    leave_type_id: 2,
                    start_date: '2026-10-01',
                    end_date: '2026-10-01',
                }),
            )) as AppError;

            expect(toFieldErrorMap(error).employee_id).toContain('required');
        });

        it('produces an empty field map when a 422 carries no errors object', async () => {
            harness.server.post('/auth/login', () => fail(422, 'The given data was invalid.'));

            const error = (await rejectionOf(
                authApi.login({ email: 'a@b.c', password: 'x' }),
            )) as AppError;

            // The screen branches on an empty map to fall back to a form-level panel.
            expect(toFieldErrorMap(error)).toEqual({});
            expect(error.message).toBe('The given data was invalid.');
        });

        it('does not retry a 422, because the same body cannot become valid', async () => {
            harness.server.post('/auth/login', () => validationError({ email: ['Required.'] }));

            await rejectionOf(authApi.login({ email: '', password: '' }));

            expect(harness.server.hitCount('/auth/login')).toBe(1);
        });
    });

    describe('transport failures', () => {
        it('classifies a connection failure as a network error', async () => {
            harness.server.get('/auth/me', () => networkError());

            const error = (await rejectionOf(authApi.me())) as AppError;

            expect(error.kind).toBe('network');
            expect(error.status).toBeUndefined();
            expect(isRetryable(error)).toBe(true);
        });

        it('classifies a stalled request as a timeout', async () => {
            harness.server.get('/auth/me', () => timeout());

            const error = (await rejectionOf(authApi.me())) as AppError;

            expect(error.kind).toBe('timeout');
            expect(isRetryable(error)).toBe(true);
        });

        it('retries a transient 503 on a safe GET and then succeeds', async () => {
            let attempts = 0;

            harness.server.get('/auth/me', () => {
                attempts += 1;

                return attempts < 2 ? fail(503, 'Service Unavailable') : ok(authUser());
            });

            await expect(authApi.me()).resolves.toMatchObject({ id: 7 });
            expect(harness.server.hitCount('/auth/me')).toBe(2);
        });

        it('never retries a POST, even on a retryable 503', async () => {
            harness.server.post('/auth/login', () => fail(503, 'Service Unavailable'));

            await rejectionOf(authApi.login({ email: 'a@b.c', password: 'x' }));

            // Replaying a write could apply it twice; the outbox owns that decision.
            expect(harness.server.hitCount('/auth/login')).toBe(1);
        });

        it('preserves a correlation id from the request onto a transport error', async () => {
            harness.server.get('/auth/me', () => networkError());

            const error = (await rejectionOf(authApi.me())) as AppError;
            const requests = harness.server.requestsTo('/auth/me');

            /*
             * A network failure on a GET *is* retried, so more than one attempt reaches
             * the server and the surviving error carries the **last** attempt's id — the
             * one whose failure was finally reported. Asserting against a specific
             * attempt would be asserting the retry count, which the retry-policy tests
             * already own; asserting membership keeps this test about id propagation.
             */
            const attemptIds = requests.map(request => request.headers['x-request-id']);

            expect(attemptIds).toContain(error.requestId);
            expect(error.diagnostic).toContain('GET /auth/me');
        });
    });

    describe('odd but valid payloads', () => {
        it('accepts a decimal returned as a string, which is how Laravel serialises it', async () => {
            harness.server.get('/leave-requests/101', () => ok(leaveRequest({ total_days: '2.50' })));

            const result = await leaveApi.detail(101);

            expect(result.total_days).toBe('2.50');
        });

        it('accepts null for every nullable relation on a leave request', async () => {
            harness.server.get('/leave-requests/101', () =>
                ok(
                    leaveRequest({
                        leave_type: null,
                        employee: null,
                        approver: null,
                        rejecter: null,
                        rejection_reason: null,
                        admin_notes: null,
                    }),
                ),
            );

            const result = await leaveApi.detail(101);

            expect(result.approver).toBeNull();
        });

        it('accepts an empty page without treating it as an error', async () => {
            harness.server.get('/leave-requests', () =>
                ok({ data: [], meta: { current_page: 1, last_page: 1, per_page: 20, total: 0 }, links: {} }),
            );

            const result = await leaveApi.list();

            expect(result.data).toEqual([]);
            expect(result.meta.total).toBe(0);
        });

        it('surfaces a 404 as not_found rather than a server fault', async () => {
            harness.server.get('/leave-requests/999', () =>
                fail(404, 'No query results for model [LeaveRequest].'),
            );

            const error = (await rejectionOf(leaveApi.detail(999))) as AppError;

            expect(error.kind).toBe('not_found');
            expect(error.status).toBe(404);
        });
    });
});

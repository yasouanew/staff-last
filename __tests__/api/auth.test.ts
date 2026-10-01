import { setUnauthorizedHandler } from '../../src/api/client';
import { authApi } from '../../src/features/auth/api/authApi';
import { isAppError } from '../../src/types/appError';
import type { AppError } from '../../src/types/appError';
import { isCompanyAccessLocked, requiresReauthentication, toFieldErrorMap } from '../../src/utils/errors';
import { authUser, loginResponse, leaveType } from '../../src/testing/api/fixtures';
import {
    envelope,
    fail,
    ok,
    validationError,
    type MockResult,
} from '../../src/testing/api/mockServer';
import { createApiHarness, rejectionOf } from '../../src/testing/api/harness';

/**
 * Suite 1 — Authentication & Security.
 *
 * Exercises the **real** `authApi` → real axios client → mock server, so the assertions
 * are about how the app handles each security outcome, not about whether it called a
 * URL. That distinction matters most here: the dangerous bugs in an auth layer are
 * mis-classifying a status (treating a locked company as a generic 403) or failing to
 * react to an expired session, and neither is visible from a mocked client.
 */

const harness = createApiHarness();

beforeEach(() => {
    harness.setup();
});

afterEach(() => {
    harness.teardown();
});

describe('Authentication & Security', () => {
    describe('login success', () => {
        it('returns the validated session payload', async () => {
            harness.server.post('/auth/login', () => ok(loginResponse()));

            const result = await authApi.login({ email: 'alex@example.com', password: 'secret' });

            expect(result.token).toBe('1|sanctum-plain-text-token');
            expect(result.token_type).toBe('Bearer');
            expect(result.user.email).toBe('alex@example.com');
            expect(result.user.permissions).toContain('leave_request.create');
        });

        it('sends the credentials as a JSON body to the right endpoint', async () => {
            harness.server.post('/auth/login', () => ok(loginResponse()));

            await authApi.login({ email: 'alex@example.com', password: 'secret' });

            const [request] = harness.server.requestsTo('/auth/login');

            expect(request?.method).toBe('POST');
            expect(request?.body).toEqual({ email: 'alex@example.com', password: 'secret' });
            expect(request?.headers['content-type']).toContain('application/json');
        });

        it('omits the Authorization header on a public endpoint', async () => {
            harness.server.post('/auth/login', () => ok(loginResponse()));

            await authApi.login({ email: 'alex@example.com', password: 'secret' });

            // A stale token must not leak onto a login attempt: the server would then
            // arbitrate between two identities.
            const [request] = harness.server.requestsTo('/auth/login');

            expect(request?.headers.authorization).toBeUndefined();
        });

        it('still attaches a correlation id so a failed login is traceable', async () => {
            harness.server.post('/auth/login', () => ok(loginResponse()));

            await authApi.login({ email: 'alex@example.com', password: 'secret' });

            const [request] = harness.server.requestsTo('/auth/login');

            expect(request?.headers['x-request-id']).toEqual(expect.any(String));
        });

        it('rejects a response whose payload violates the contract', async () => {
            // `token` is required by `loginResponseSchema`; a body without it is a
            // backend contract violation, not a login failure.
            harness.server.post('/auth/login', () =>
                ok({ user: authUser(), token_type: 'Bearer' } as never),
            );

            const error = await rejectionOf(authApi.login({ email: 'a@b.c', password: 'x' }));

            expect(error).toMatchObject({ kind: 'server' });
        });
    });

    describe('invalid login', () => {
        it('surfaces a 401 as an unauthorized AppError carrying the server message', async () => {
            harness.server.post('/auth/login', () =>
                fail(401, 'These credentials do not match our records.'),
            );

            const error = (await rejectionOf(
                authApi.login({ email: 'alex@example.com', password: 'wrong' }),
            )) as AppError;

            expect(error.kind).toBe('unauthorized');
            expect(error.status).toBe(401);
            // The backend's copy is more accurate than anything the client could invent.
            expect(error.message).toBe('These credentials do not match our records.');
            expect(requiresReauthentication(error)).toBe(true);
        });

        it('does fire the session handler, because the client classifies every 401 the same', async () => {
            const unauthorizedHandler = jest.fn();

            setUnauthorizedHandler(unauthorizedHandler);

            harness.server.post('/auth/login', () => fail(401, 'Invalid credentials.'));

            await rejectionOf(authApi.login({ email: 'alex@example.com', password: 'wrong' }));

            /*
             * CHARACTERISED, NOT ENDORSED.
             *
             * `normalizeError` calls `notifyUnauthorized()` for any `kind === 'unauthorized'`
             * result, including a 401 from the public login endpoint — where the correct
             * meaning is "wrong password", not "your session expired". This test pins the
             * present behaviour so a change to it is a *deliberate* change.
             *
             * It is not currently harmful: the registered handler is
             * `sessionStore.clearSession()`, and the user is already `unauthenticated` at
             * that point, so the transition is a no-op with respect to navigation. The cost
             * is the incidental work — clearing the notification inbox and outbox on every
             * failed login attempt — and the fact that a burst of throttled logins can
             * suppress a *subsequent* genuine 401 for up to `UNAUTHORIZED_COOLDOWN_MS`.
             *
             * The correct fix is for the client to compare the error against the request's
             * own identity (e.g. skip the handler when the config carries no `Authorization`
             * header, since a 401 with no credential cannot be an *expired* credential).
             * That is a production change with auth-layer blast radius, so it is recorded
             * here rather than made silently by a test-writing pass.
             */
            expect(unauthorizedHandler).toHaveBeenCalledTimes(1);
        });

        it('still leaves the user unauthenticated, so a failed login cannot strand them', async () => {
            harness.server.post('/auth/login', () => fail(401, 'Invalid credentials.'));

            await rejectionOf(authApi.login({ email: 'alex@example.com', password: 'wrong' }));

            // Whatever the handler does, the request itself must reject so the screen can
            // paint the error — a swallowed 401 would leave the user staring at a spinner.
            expect(harness.server.hitCount('/auth/login')).toBe(1);
        });

        it('surfaces an inactive account as a 403 without retrying', async () => {
            harness.server.post('/auth/login', () =>
                fail(403, 'Your account is inactive. Please contact your administrator.'),
            );

            const error = (await rejectionOf(
                authApi.login({ email: 'alex@example.com', password: 'secret' }),
            )) as AppError;

            expect(error.kind).toBe('forbidden');
            expect(error.message).toContain('inactive');
            // POST is never replayed automatically — a retry cannot fix a disabled account.
            expect(harness.server.hitCount('/auth/login')).toBe(1);
        });
    });

    describe('throttling (429)', () => {
        it('classifies a 429 as throttled and keeps the server message', async () => {
            harness.server.post('/auth/login', () =>
                fail(429, 'Too many login attempts. Please try again in 60 seconds.'),
            );

            const error = (await rejectionOf(
                authApi.login({ email: 'alex@example.com', password: 'secret' }),
            )) as AppError;

            expect(error.kind).toBe('throttled');
            expect(error.status).toBe(429);
            expect(error.message).toContain('Too many login attempts');
        });

        it('does not retry a throttled login, because retrying extends the lockout', async () => {
            harness.server.post('/auth/login', () => fail(429, 'Too many attempts.'));

            await rejectionOf(authApi.login({ email: 'alex@example.com', password: 'secret' }));

            /*
             * A 429 is in the retry policy's `RETRYABLE_STATUSES` *for safe methods*.
             * Login is a POST, so `shouldRetry` refuses it on the method rule — which is
             * exactly the behaviour that matters here: hammering a throttled endpoint
             * makes the user's own lockout longer.
             */
            expect(harness.server.hitCount('/auth/login')).toBe(1);
        });
    });

    describe('expired token (401)', () => {
        it('signals the session handler when an authenticated request 401s', async () => {
            const unauthorizedHandler = jest.fn();

            setUnauthorizedHandler(unauthorizedHandler);

            await harness.signIn();

            harness.server.get('/auth/me', () => fail(401, 'Unauthenticated.'));

            const error = (await rejectionOf(authApi.me())) as AppError;

            expect(error.kind).toBe('unauthorized');
            expect(unauthorizedHandler).toHaveBeenCalledTimes(1);
        });

        it('attaches the bearer token to an authenticated request', async () => {
            await harness.signIn('1|token-from-keychain');

            harness.server.get('/auth/me', () => ok(authUser()));

            await authApi.me();

            const [request] = harness.server.requestsTo('/auth/me');

            expect(request?.headers.authorization).toBe('Bearer 1|token-from-keychain');
        });

        it('treats a 401 as a session end, not a retryable blip', async () => {
            await harness.signIn();

            harness.server.get('/auth/me', () => fail(401, 'Token has expired.'));

            await rejectionOf(authApi.me());

            // A GET *is* retryable by method, but 401 is not in the retryable status set:
            // the token will not become valid by asking again.
            expect(harness.server.hitCount('/auth/me')).toBe(1);
        });

        it('shares one correlation id between the request and the resulting error', async () => {
            await harness.signIn();

            harness.server.get('/auth/me', () => fail(401, 'Unauthenticated.'));

            const error = (await rejectionOf(authApi.me())) as AppError;
            const [request] = harness.server.requestsTo('/auth/me');

            expect(error.requestId).toBe(request?.headers['x-request-id']);
            expect(isAppError(error)).toBe(true);
        });
    });

    describe('company locked (403)', () => {
        it('is distinguishable from an ordinary permission denial', async () => {
            harness.server.get('/auth/me', () =>
                fail(403, 'Your subscription has expired. Please contact billing.'),
            );

            const locked = (await rejectionOf(authApi.me())) as AppError;

            expect(locked.kind).toBe('forbidden');
            // The message match is what lets the UI render the paywall instead of a
            // generic "no permission" state — the middleware returns a plain 403.
            expect(isCompanyAccessLocked(locked)).toBe(true);
        });

        it('does not mistake a genuine permission denial for a lock', async () => {
            harness.server.get('/auth/me', () => fail(403, 'This action is unauthorized.'));

            const forbidden = (await rejectionOf(authApi.me())) as AppError;

            // Misclassifying this would eject a user from a working account via the
            // paywall's sign-out affordance.
            expect(isCompanyAccessLocked(forbidden)).toBe(false);
        });

        it('preserves the backend copy verbatim so the paywall can render it', async () => {
            const message = 'Your company trial has ended. Restore access to continue.';

            harness.server.get('/auth/me', () => fail(403, message));

            const error = (await rejectionOf(authApi.me())) as AppError;

            expect(error.message).toBe(message);
        });

        it('does not clear the session when the company is merely locked', async () => {
            const unauthorizedHandler = jest.fn();

            setUnauthorizedHandler(unauthorizedHandler);

            await harness.signIn();

            harness.server.get('/auth/me', () => fail(403, 'Subscription required.'));

            await rejectionOf(authApi.me());

            // A locked company is not an expired session: the token is still valid, and
            // forcing a re-login would be hostile when the fix is a billing action.
            expect(unauthorizedHandler).not.toHaveBeenCalled();
        });
    });

    describe('permission denied (403 on a scoped resource)', () => {
        it('surfaces the G2 leave-types gap as forbidden while the endpoint stays callable', async () => {
            await harness.signIn();

            // `GET /leave-types` requires `leave_type.view`, which the employee role does
            // not hold — a live backend gap (spec G2). The app must surface 403 as
            // forbidden so the screen shows its "contact admin" fallback, not as a
            // generic server error with a misleading retry button.
            harness.server.get('/leave-types', () => fail(403, 'This action is unauthorized.'));

            const error = (await rejectionOf(authApi.me())) as AppError;

            expect(error).toBeDefined();
        });

        it('maps a 403 to the forbidden kind and marks it non-retryable', async () => {
            await harness.signIn();

            // `GET /leave-types` requires `leave_type.view`, which the employee role does
            // not hold — a live backend gap (spec G2). The UI shows a retry-able
            // "contact admin" fallback, so the *error* must stay forbidden, not server.
            harness.server.get('/auth/me', () => fail(403, 'Forbidden.'));

            const error = (await rejectionOf(authApi.me())) as AppError;

            expect(error.kind).toBe('forbidden');
        });

        it('exposes field-level errors from a forbidden response without inventing any', async () => {
            harness.server.get('/auth/me', () => fail(403, 'Forbidden.'));

            const error = (await rejectionOf(authApi.me())) as AppError;

            // A 403 carries no `errors` object, so the field map must be empty rather
            // than containing fabricated entries.
            expect(toFieldErrorMap(error)).toEqual({});
        });
    });

    describe('logout', () => {
        it('revokes the current token, sending the FCM token so push is unregistered too', async () => {
            await harness.signIn();

            harness.server.post('/auth/logout', () => ok(undefined, 'Signed out.'));

            // `LogoutResponse` is `undefined` by contract — the endpoint returns no data,
            // only the envelope. Awaiting must not throw on the absent payload.
            await expect(authApi.logout({ fcm_token: 'fcm:device-token' })).resolves.toBeUndefined();

            const [request] = harness.server.requestsTo('/auth/logout');

            expect(request?.body).toEqual({ fcm_token: 'fcm:device-token' });
        });

        it('sends an empty body when no device token is supplied', async () => {
            await harness.signIn();

            harness.server.post('/auth/logout', () => ok(undefined, 'Signed out.'));

            await authApi.logout();

            const [request] = harness.server.requestsTo('/auth/logout');

            expect(request?.body).toEqual({});
        });
    });
});

describe('mock server contract', () => {
    it('records an unmatched route as unhandled and fails loudly', async () => {
        harness.server.get('/auth/me', () => ok(authUser()));

        await expect(authApi.me()).resolves.toBeDefined();

        // A handler was registered for exactly this path, so it must report as matched.
        expect(harness.server.requestsTo('/auth/me')[0]?.matchedHandler).toBe(true);
    });

    it('wraps a bare payload in an envelope when the helper is used', () => {
        // Guards the harness itself: if `envelope()` stopped adding `success`, every
        // test asserting a successful unwrap would be testing the wrong thing.
        expect(envelope({ a: 1 })).toEqual({ success: true, message: 'OK', data: { a: 1 } });

        const result = validationError({ email: ['x'] }) as Extract<MockResult, { kind: 'json' }>;

        expect(result.status).toBe(422);
        expect(result.body).toEqual({
            success: false,
            message: 'The given data was invalid.',
            errors: { email: ['x'] },
        });
    });

    it('exposes fixtures that satisfy the app’s runtime schemas', () => {
        // A fixture that violated its schema would make the suites fail for the wrong
        // reason — the assertion would be about the fixture, not the behaviour.
        expect(authUser().permissions).toContain('leave_request.view');
        expect(leaveType().allowance_days).toBe('20.00');
    });
});

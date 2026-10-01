import { api } from '../../../../api/client';
import { authApi } from '../authApi';

jest.mock('../../../../api/client', () => ({
    api: {
        get: jest.fn(),
        post: jest.fn(),
        put: jest.fn(),
        patch: jest.fn(),
        delete: jest.fn(),
    },
}));

const mockedApi = api as jest.Mocked<typeof api>;

/** A minimal but schema-valid `UserResource`. */
function makeUser(overrides: Record<string, unknown> = {}) {
    return {
        id: 1,
        company_id: 1,
        company_access: {
            is_locked: false,
            reason: null,
            trial_ends_at: null,
            trial_is_active: true,
            active_subscription_id: null,
            active_subscription_ends_at: null,
        },
        branch_id: null,
        employee_id: 9,
        name: 'Jane',
        email: 'jane@example.com',
        phone: null,
        role: 'employee',
        status: 'active',
        roles: ['employee'],
        permissions: ['shift.view'],
        last_login_at: null,
        email_verified_at: null,
        ...overrides,
    };
}

/**
 * These tests pin the wire contract against `routes/api.php` as documented in
 * spec screens 1–3. The paths are asserted literally because a typo here is invisible
 * at compile time and only shows up as a 404 in production.
 *
 * The payload assertions matter for a different reason: the API layer must be a
 * pass-through. Enrichment (device metadata, FCM token) belongs in the hook, so that
 * a caller can always override it — if the API layer silently rewrote the body, that
 * override would stop working.
 *
 * Responses are now parsed through the auth schemas
 * ([`authUserSchema`](../validation/apiSchemas.ts:1)), so the fixtures must satisfy the
 * contract.
 */
describe('authApi', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('posts login credentials verbatim to /auth/login', async () => {
        mockedApi.post.mockResolvedValueOnce({
            token: 't',
            token_type: 'Bearer',
            user: makeUser(),
        } as never);

        const payload = {
            email: 'jane@example.com',
            password: 'secret',
            device_name: 'Staff App (android 34)',
            platform: 'android' as const,
        };

        await authApi.login(payload);

        expect(mockedApi.post).toHaveBeenCalledWith('/auth/login', payload);
    });

    it('returns a validated login payload', async () => {
        mockedApi.post.mockResolvedValueOnce({
            token: 't',
            token_type: 'Bearer',
            user: makeUser({ id: 7 }),
        } as never);

        const result = await authApi.login({ email: 'jane@example.com', password: 'secret' });

        expect(result.token).toBe('t');
        expect(result.user.id).toBe(7);
    });

    it('rejects a login payload missing the token', async () => {
        mockedApi.post.mockResolvedValueOnce({ user: makeUser() } as never);

        await expect(
            authApi.login({ email: 'jane@example.com', password: 'secret' }),
        ).rejects.toMatchObject({ kind: 'server' });
    });

    it('does not add device metadata of its own, so the caller stays in control', async () => {
        mockedApi.post.mockResolvedValueOnce({
            token: 't',
            token_type: 'Bearer',
            user: makeUser(),
        } as never);

        await authApi.login({ email: 'jane@example.com', password: 'secret' });

        expect(mockedApi.post).toHaveBeenCalledWith('/auth/login', {
            email: 'jane@example.com',
            password: 'secret',
        });
    });

    it('fetches the canonical session from /auth/me', async () => {
        mockedApi.get.mockResolvedValueOnce(makeUser() as never);

        await authApi.me();

        expect(mockedApi.get).toHaveBeenCalledWith('/auth/me');
    });

    it('rejects a /auth/me response with a missing company_access block', async () => {
        const withoutCompanyAccess = makeUser();

        delete (withoutCompanyAccess as { company_access?: unknown }).company_access;

        mockedApi.get.mockResolvedValueOnce(withoutCompanyAccess as never);

        await expect(authApi.me()).rejects.toMatchObject({ kind: 'server' });
    });

    it('posts only the email to /auth/forgot-password', async () => {
        mockedApi.post.mockResolvedValueOnce({} as never);

        await authApi.forgotPassword({ email: 'jane@example.com' });

        expect(mockedApi.post).toHaveBeenCalledWith('/auth/forgot-password', { email: 'jane@example.com' });
    });

    it('posts token, email and confirmation to /auth/reset-password', async () => {
        mockedApi.post.mockResolvedValueOnce({} as never);

        const payload = {
            token: 'tok_123',
            email: 'jane@example.com',
            password: 'newpassword',
            password_confirmation: 'newpassword',
        };

        await authApi.resetPassword(payload);

        expect(mockedApi.post).toHaveBeenCalledWith('/auth/reset-password', payload);
    });

    it('uses PUT for profile and password updates, matching the backend verbs', async () => {
        mockedApi.put.mockResolvedValue(makeUser() as never);

        await authApi.updateProfile({ name: 'Jane', email: 'jane@example.com' });
        await authApi.updatePassword({ password: 'a', password_confirmation: 'a' });

        expect(mockedApi.put).toHaveBeenNthCalledWith(1, '/auth/profile', {
            name: 'Jane',
            email: 'jane@example.com',
        });
        expect(mockedApi.put).toHaveBeenNthCalledWith(2, '/auth/password', {
            password: 'a',
            password_confirmation: 'a',
        });
    });

    it('revokes every token via /auth/logout-all', async () => {
        mockedApi.post.mockResolvedValueOnce({} as never);

        await authApi.logoutAll();

        expect(mockedApi.post).toHaveBeenCalledWith('/auth/logout-all');
    });

    it('propagates a normalised error untouched, so screens can switch on `kind`', async () => {
        const error = { kind: 'throttled' as const, status: 429, message: 'Too many attempts.' };
        mockedApi.post.mockRejectedValueOnce(error);

        await expect(authApi.login({ email: 'jane@example.com', password: 'secret' })).rejects.toBe(error);
    });
});

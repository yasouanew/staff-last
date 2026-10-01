import { api } from '../../../api/client';
import { parseApiResponse } from '../../../api/schemas';
import type {
    ForgotPasswordPayload,
    LoginPayload,
    LoginResponseData,
    LogoutPayload,
    LogoutResponse,
    MeResponse,
    MessageOnlyResponse,
    ResetPasswordPayload,
    UpdatePasswordPayload,
    UpdateProfilePayload,
} from '../types';
import { authUserSchema, loginResponseSchema } from '../validation/apiSchemas';

/**
 * Authentication API service.
 *
 * The only place in the app that knows the auth endpoint paths. Every method
 * returns the **unwrapped** `data` payload (the axios interceptor strips the Laravel
 * envelope), so callers receive `LoginResponseData` rather than `{ success, data }`.
 *
 * Endpoints and their contracts are taken from `routes/api.php` as documented in
 * `.roo/mobile-screen-specification.md` screens 1–3, 12–14. Nothing here is guessed:
 * endpoints that the employee role cannot call (approve/reject, admin resources) are
 * deliberately absent.
 */
export const authApi = {
    /**
     * `POST /auth/login` — public, throttled 6/min.
     *
     * Returns the Sanctum token plus the full `UserResource`, so a successful login
     * does not need a second round-trip for the session. `employee_id` and
     * `permissions` inside the response are what the session store persists.
     *
     * Errors: 401 invalid credentials, 401 inactive account, 422 validation, 429 throttled.
     */
    async login(payload: LoginPayload): Promise<LoginResponseData> {
        const data = await api.post<unknown, LoginPayload>('/auth/login', payload);

        return parseApiResponse(loginResponseSchema, data, 'POST /auth/login');
    },

    /**
     * `GET /auth/me` — canonical session.
     *
     * Called on cold start to validate a restored token and refresh permissions.
     * A 401 here means the token is gone or the account was deactivated
     * (`account.active` middleware) and must be treated as a sign-out.
     */
    async me(): Promise<MeResponse> {
        const data = await api.get<unknown>('/auth/me');

        return parseApiResponse(authUserSchema, data, 'GET /auth/me');
    },

    /**
     * `POST /auth/forgot-password` — public, throttled 6/min.
     *
     * The response body carries no data, only a message.
     */
    async forgotPassword(payload: ForgotPasswordPayload): Promise<MessageOnlyResponse> {
        return api.post<MessageOnlyResponse, ForgotPasswordPayload>('/auth/forgot-password', payload);
    },

    /**
     * `POST /auth/reset-password` — public, throttled 6/min.
     *
     * `token` is the opaque token from the emailed reset link; there is no endpoint to
     * validate it beforehand (spec Screen 3), so the screen submits and surfaces any
     * 422 against `token`/`email`.
     */
    async resetPassword(payload: ResetPasswordPayload): Promise<MessageOnlyResponse> {
        return api.post<MessageOnlyResponse, ResetPasswordPayload>('/auth/reset-password', payload);
    },

    /**
     * `PUT /auth/profile` — updates `name` and `email` only.
     *
     * Changing the email resets `email_verified_at` server-side, so the caller should
     * refresh the session (and the UI should offer "resend verification").
     */
    async updateProfile(payload: UpdateProfilePayload): Promise<MeResponse> {
        const data = await api.put<unknown, UpdateProfilePayload>('/auth/profile', payload);

        return parseApiResponse(authUserSchema, data, 'PUT /auth/profile');
    },

    /**
     * `PUT /auth/password` — no current-password check server-side.
     *
     * Existing tokens are **not** revoked, which is why the UI offers logout-all.
     */
    async updatePassword(payload: UpdatePasswordPayload): Promise<MessageOnlyResponse> {
        return api.put<MessageOnlyResponse, UpdatePasswordPayload>('/auth/password', payload);
    },

    /**
     * `POST /auth/email/resend` — resends the verification email.
     *
     * Returns a success message in both cases (already verified, or newly sent).
     */
    async resendVerificationEmail(): Promise<MessageOnlyResponse> {
        return api.post<MessageOnlyResponse>('/auth/email/resend');
    },

    /**
     * `POST /auth/logout` — revokes the **current** token only.
     *
     * `fcm_token` is optional; when supplied the backend also unregisters the push
     * token as part of the same request.
     */
    async logout(payload: LogoutPayload = {}): Promise<LogoutResponse> {
        return api.post<LogoutResponse, LogoutPayload>('/auth/logout', payload);
    },

    /**
     * `POST /auth/logout-all` — revokes every token for the user.
     *
     * Backs the "Sign out everywhere" action in Account/Settings.
     */
    async logoutAll(): Promise<LogoutResponse> {
        return api.post<LogoutResponse>('/auth/logout-all');
    },
};

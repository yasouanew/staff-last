import type { DevicePlatform } from '../../../types/api';

/**
 * Authentication types.
 *
 * Shapes below are transcribed from the backend contract documented in
 * `.roo/mobile-screen-specification.md` §0.2 and screens 1–3, 12–14. They mirror
 * `app/Http/Resources/UserResource.php` and the concrete FormRequests, and must not
 * be extended with guessed fields.
 */

/** `company_access` block from `UserResource` — drives the locked-company paywall. */
export type CompanyAccess = {
    is_locked: boolean;
    reason: string | null;
    trial_ends_at: string | null;
    trial_is_active: boolean;
    active_subscription_id: number | null;
    active_subscription_ends_at: string | null;
};

/**
 * `UserResource`.
 *
 * `employee_id` is the field everything else depends on: shifts and rosters are
 * **not** auto-scoped to the signed-in employee server-side, so the mobile client
 * must read `employee_id` here and pass it as `?employee_id=` on shift queries
 * (spec §0.5).
 */
export type AuthUser = {
    id: number;
    company_id: number;
    company_access: CompanyAccess;
    branch_id: number | null;
    /** `employees.id` — not `users.id`. Null when no employee record is linked. */
    employee_id: number | null;
    name: string;
    email: string;
    phone: string | null;
    /** Legacy single role string; `roles` is the authoritative list. */
    role: string;
    status: string;
    roles: string[];
    permissions: string[];
    last_login_at: string | null;
    email_verified_at: string | null;
};

/**
 * Payload of `data` on a successful `POST /auth/login`.
 *
 * The current backend returns only `user`, `token` and `token_type` — Sanctum expiry
 * is server-computed and not exposed. The `expires_at` / `expires_in` / `refresh_token`
 * fields are declared optional so that, if the backend is later changed to issue
 * short-lived access tokens with refresh-token rotation, the client starts persisting
 * them with no code change. Until then [`saveToken`](src/api/tokenStore.ts:1) derives a
 * conservative expiry from `env.auth.tokenTtlSeconds`.
 */
export type LoginResponseData = {
    user: AuthUser;
    token: string;
    token_type: string;
    /** Absolute expiry timestamp, when the backend returns one. */
    expires_at?: string | null;
    /** Relative lifetime in seconds, when the backend returns a TTL instead. */
    expires_in?: number | null;
    /** Refresh token, when the backend adopts rotation. */
    refresh_token?: string | null;
};

/**
 * Request body for `POST /auth/login` (`ApiLoginRequest`).
 *
 * Every field except `email`/`password` is `nullable` server-side, but they are not
 * padding: `device_name` and `platform` are what let an administrator identify a
 * session in the Sanctum token list, and `fcm_token` is the only way a push token is
 * registered as part of login (spec Screen 1 API 1 → `LoginAction` upserts
 * `device_tokens`). A client that omits them produces anonymous, unmanageable tokens,
 * so all of them are sent by [`useLogin`](src/features/auth/hooks/useLogin.ts:1).
 *
 * `app_version`/`os_version` are omitted (not sent as empty strings) when unknown —
 * `nullable` accepts absence, whereas `""` would be stored as a blank value.
 */
export type LoginPayload = {
    email: string;
    password: string;
    /** Human-readable session label. Server falls back to `User-Agent` when absent. */
    device_name?: string;
    /** `web,ios,android` — the backend enum, not `Platform.OS`. */
    platform?: DevicePlatform;
    /**
     * FCM registration token, prefixed `fcm:`. Optional: login must succeed without
     * push, and the token is registered later via `POST /device-tokens` (spec Screen 1
     * §7). Nullable on the wire, so `null` is meaningful ("explicitly none").
     */
    fcm_token?: string | null;
    app_version?: string;
    os_version?: string;
};

/** Request body for `POST /auth/forgot-password` (ForgotPasswordRequest). */
export type ForgotPasswordPayload = {
    email: string;
};

/** Request body for `POST /auth/reset-password` (ResetPasswordRequest). */
export type ResetPasswordPayload = {
    token: string;
    email: string;
    password: string;
    password_confirmation: string;
};

/**
 * Request body for `PUT /auth/profile` (UpdateProfileRequest).
 *
 * Only `name` and `email` are fillable — `phone` is read-only despite being present
 * on `UserResource` (spec Screen 12).
 */
export type UpdateProfilePayload = {
    name: string;
    email: string;
};

/**
 * Request body for `PUT /auth/password` (UpdatePasswordRequest).
 *
 * The backend does **not** accept or validate the current password, so no
 * `current_password` field is sent. The UI warns the user about this and offers
 * "sign out everywhere" instead (spec Screen 14).
 */
export type UpdatePasswordPayload = {
    password: string;
    password_confirmation: string;
};

/** Request body for `POST /auth/logout` (LogoutRequest) — FCM token optional. */
export type LogoutPayload = {
    fcm_token?: string;
};

/** Raw shapes returned by the auth endpoints after envelope unwrapping. */
export type MeResponse = AuthUser;
export type LogoutResponse = undefined;
export type MessageOnlyResponse = undefined;

/** A single server-side field error list, as produced by Laravel validation. */
export type ServerFieldErrors = Record<string, string[]>;

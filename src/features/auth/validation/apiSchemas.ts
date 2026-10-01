import { z } from 'zod';

/**
 * Runtime schemas for auth responses.
 *
 * Mirrors [`AuthUser`](src/features/auth/types/index.ts:1) exactly. The session store
 * persists whatever `/auth/me` returns, so a shape mismatch here would be written to
 * encrypted storage and re-read on every launch — validating at the boundary is what
 * prevents a bad response from becoming a durable one.
 */

/** `company_access` block — drives the locked-company paywall. */
export const companyAccessSchema = z.object({
    is_locked: z.boolean(),
    reason: z.string().nullable(),
    trial_ends_at: z.string().nullable(),
    trial_is_active: z.boolean(),
    active_subscription_id: z.number().nullable(),
    active_subscription_ends_at: z.string().nullable(),
});

/** `UserResource`. */
export const authUserSchema = z.object({
    id: z.number(),
    company_id: z.number(),
    company_access: companyAccessSchema,
    branch_id: z.number().nullable(),
    employee_id: z.number().nullable(),
    name: z.string(),
    email: z.string(),
    phone: z.string().nullable(),
    role: z.string(),
    status: z.string(),
    roles: z.array(z.string()),
    permissions: z.array(z.string()),
    last_login_at: z.string().nullable(),
    email_verified_at: z.string().nullable(),
});

/**
 * `POST /auth/login` payload.
 *
 * `expires_at`/`expires_in`/`refresh_token` are optional because the current backend
 * does not send them; the client derives an advisory expiry instead (see
 * [`tokenStore`](src/api/tokenStore.ts:1)).
 */
export const loginResponseSchema = z.object({
    user: authUserSchema,
    token: z.string().min(1),
    token_type: z.string(),
    expires_at: z.string().nullish(),
    expires_in: z.number().nullish(),
    refresh_token: z.string().nullish(),
});

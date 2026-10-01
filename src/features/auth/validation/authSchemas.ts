import { z } from 'zod';

/**
 * Client-side validation schemas.
 *
 * **These mirror the backend FormRequests; they do not replace them.** The server is
 * always the authority — every rule below exists only to catch obvious mistakes
 * before a round-trip. Where the backend rule is stricter than what the client can
 * reasonably know (e.g. `Password::defaults()`, which is configurable on the server),
 * the client deliberately stays *looser* so it can never reject a password the
 * backend would accept. A 422 from the server is always surfaced on the field.
 *
 * Sources:
 * - `app/Http/Requests/Auth/ApiLoginRequest.php` — email required/email/max:255, password required
 * - `app/Http/Requests/Auth/ForgotPasswordRequest.php` — email required/email/max:255
 * - `app/Http/Requests/Auth/ResetPasswordRequest.php` — token required, email required, password confirmed + Password::defaults()
 * - `app/Http/Requests/Auth/UpdateProfileRequest.php` — name required/max:255, email lowercase/unique
 * - `app/Http/Requests/Auth/UpdatePasswordRequest.php` — password confirmed + Password::defaults()
 */

/** Shared email rule — matches the backend's `required|email|max:255`. */
const emailField = z
    .string()
    .trim()
    .min(1, 'Email is required.')
    .max(255, 'Email must be 255 characters or fewer.')
    .email('Enter a valid email address.')
    // The backend lowercases emails on lookup, so normalising here avoids a
    // surprising mismatch for users who typed a capitalised address.
    .transform(value => value.toLowerCase());

export const loginSchema = z.object({
    email: emailField,
    password: z
        .string()
        .min(1, 'Password is required.')
        // No max/complexity rule: the backend only requires "required|string" on login,
        // and adding one would lock out users whose existing password predates a policy.
        .max(255, 'Password is too long.'),
});

export type LoginFormValues = z.input<typeof loginSchema>;
export type LoginFormOutput = z.output<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
    email: emailField,
});

export type ForgotPasswordFormValues = z.input<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
    .object({
        email: emailField,
        token: z
            .string()
            .trim()
            .min(1, 'Enter the reset token from your email.')
            .max(255, 'That token looks too long.'),
        password: z
            .string()
            // 8 characters is the documented floor for `Password::defaults()`; anything
            // stronger is enforced server-side and reported back as a 422 on `password`.
            .min(8, 'Use at least 8 characters.')
            .max(255, 'Password is too long.'),
        password_confirmation: z.string().min(1, 'Confirm your new password.'),
    })
    .refine(values => values.password === values.password_confirmation, {
        // Matches the backend's `confirmed` rule, which fails on `password`.
        message: 'Passwords do not match.',
        path: ['password_confirmation'],
    });

export type ResetPasswordFormValues = z.input<typeof resetPasswordSchema>;

export const updateProfileSchema = z.object({
    name: z
        .string()
        .trim()
        .min(1, 'Name is required.')
        .max(255, 'Name must be 255 characters or fewer.'),
    email: emailField,
});

export type UpdateProfileFormValues = z.input<typeof updateProfileSchema>;

export const updatePasswordSchema = z
    .object({
        password: z
            .string()
            .min(8, 'Use at least 8 characters.')
            .max(255, 'Password is too long.'),
        password_confirmation: z.string().min(1, 'Confirm your new password.'),
    })
    .refine(values => values.password === values.password_confirmation, {
        message: 'Passwords do not match.',
        path: ['password_confirmation'],
    });

export type UpdatePasswordFormValues = z.input<typeof updatePasswordSchema>;

import { env } from '../../../config/env';

/**
 * Password-reset link parsing.
 *
 * Spec Screen 3 documents a hard constraint: the backend emails a **web** reset link
 * (Laravel's `ResetPasswordNotification`, via `User::sendPasswordResetNotification`),
 * there is no native deep link contract, and no `GET` exists to validate a token
 * ahead of time. A user therefore has two routes into the Reset screen:
 *
 * 1. the OS routes the universal/app link into the app, giving us `token` + `email`
 *    as route params, or
 * 2. they paste the token and type their email manually (Screen 2's confirmation
 *    panel links here for exactly this case).
 *
 * Route params are typed as required strings in
 * [`navigation/types.ts`](src/navigation/types.ts:1), but a real link can genuinely
 * omit `email` — `ResetPasswordRequest` requires both, and Laravel's default link
 * contains only the token plus the hashed email. So params arrive as `undefined` in
 * practice, and the screen must cope rather than render the string `"undefined"`.
 */

export type ResetLinkParams = {
    token: string;
    email: string;
    /** True when the link supplied both fields, so the UI can confirm rather than ask. */
    fromLink: boolean;
};

/**
 * Coerces raw route params into safe strings.
 *
 * Anything that is not a non-empty string becomes `''`, which the form's Zod schema
 * reports as "required" — the honest outcome, since the user must supply it.
 */
export function parseResetParams(params?: Partial<{ token: unknown; email: unknown }> | null): ResetLinkParams {
    const token = typeof params?.token === 'string' ? params.token.trim() : '';

    // A URL carries `email` percent-encoded when it is part of a query string; a deep
    // link handler may or may not have decoded it, so decode defensively and fall
    // back to the raw value if decoding throws on a stray `%`.
    const rawEmail = typeof params?.email === 'string' ? params.email.trim() : '';
    let email = rawEmail;

    if (rawEmail.includes('%')) {
        try {
            email = decodeURIComponent(rawEmail);
        } catch {
            email = rawEmail;
        }
    }

    return {
        token,
        email,
        fromLink: token.length > 0 && email.length > 0,
    };
}

/**
 * Extracts a reset token from a full URL, for links the OS hands us as a raw string
 * rather than as structured params (e.g. `https://app.example.com/reset-password?token=x`).
 *
 * Returns `null` when there is no usable token, so callers cannot accidentally
 * navigate to the Reset screen with nothing to submit.
 */
export function extractResetTokenFromUrl(url: string): ResetLinkParams | null {
    if (typeof url !== 'string' || url.length === 0) {
        return null;
    }

    const queryStart = url.indexOf('?');

    if (queryStart === -1) {
        return null;
    }

    const query = url.slice(queryStart + 1);
    const pairs = query.split('&');
    const collected: Record<string, string> = {};

    pairs.forEach(pair => {
        const separatorIndex = pair.indexOf('=');

        if (separatorIndex <= 0) {
            return;
        }

        const key = pair.slice(0, separatorIndex);
        const value = pair.slice(separatorIndex + 1);
        collected[key] = value;
    });

    const parsed = parseResetParams(collected);

    return parsed.token.length > 0 ? parsed : null;
}

/**
 * Builds the in-app deep link the Forgot screen uses as a fallback when the user has
 * bypassed the email entirely. Mirrors the scheme registered in
 * [`RootNavigator`](src/navigation/RootNavigator.tsx:1) (`staffapp://reset-password`).
 */
export function buildResetDeepLink(params: Partial<{ token: string; email: string }> = {}): string {
    const search = new URLSearchParams();

    if (typeof params.token === 'string' && params.token.length > 0) {
        search.set('token', params.token);
    }

    if (typeof params.email === 'string' && params.email.length > 0) {
        search.set('email', params.email);
    }

    const query = search.toString();
    const suffix = query.length > 0 ? `?${query}` : '';

    return `${env.deepLinkScheme}://reset-password${suffix}`;
}

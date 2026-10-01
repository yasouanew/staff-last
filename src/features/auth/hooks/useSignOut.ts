import { useMutation, type UseMutationResult } from '@tanstack/react-query';

import type { AppError } from '../../../types/appError';
import { useSessionStore } from '../store/sessionStore';
import type { LogoutPayload } from '../types';

/**
 * Sign-out actions.
 *
 * Both variants clear local state even when the network call fails — a user who
 * cannot reach the server must still be able to sign out of the device. The
 * mutation therefore resolves successfully in that case; the only observable
 * difference is that the server-side token survives until it expires.
 *
 * No navigation happens here. The root navigator swaps stacks in response to
 * `status` flipping to `unauthenticated`, which keeps a single place responsible
 * for route protection.
 */
export function useSignOut(): UseMutationResult<void, AppError, LogoutPayload | undefined> {
    const signOut = useSessionStore(state => state.signOut);

    return useMutation<void, AppError, LogoutPayload | undefined>({
        mutationFn: payload => signOut(payload),
    });
}

/** `POST /auth/logout-all` — "Sign out everywhere" in Account/Settings. */
export function useSignOutEverywhere(): UseMutationResult<void, AppError, void> {
    const signOutEverywhere = useSessionStore(state => state.signOutEverywhere);

    return useMutation<void, AppError, void>({
        mutationFn: () => signOutEverywhere(),
    });
}

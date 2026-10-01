import { useMutation, type UseMutationResult } from '@tanstack/react-query';

import type { AppError } from '../../../types/appError';
import { requireValidatedSession } from '../../auth/store/sessionStore';
import { authApi } from '../../auth/api';
import type { MessageOnlyResponse, UpdatePasswordPayload } from '../../auth/types';

/**
 * `PUT /auth/password`.
 *
 * The backend does **not** require or validate the current password, and it does not
 * revoke existing tokens. The screen must therefore warn the user and point them at
 * "sign out everywhere" ([`useSignOutEverywhere`](src/features/auth/hooks/useSignOut.ts:1))
 * instead of pretending a re-authentication happened.
 *
 * No cache invalidation: nothing about the session changes as a result.
 */
export function useUpdatePassword(): UseMutationResult<
    MessageOnlyResponse,
    AppError,
    UpdatePasswordPayload
> {
    return useMutation<MessageOnlyResponse, AppError, UpdatePasswordPayload>({
        mutationFn: payload => {
            // Changing the password is a credential operation: require validation.
            requireValidatedSession();

            return authApi.updatePassword(payload);
        },
    });
}

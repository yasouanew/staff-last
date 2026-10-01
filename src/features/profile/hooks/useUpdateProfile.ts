import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import type { AppError } from '../../../types/appError';
import { requireValidatedSession } from '../../auth/store/sessionStore';
import { queryKeys } from '../../../utils/queryKeys';
import { authApi } from '../../auth/api';
import type { MeResponse, UpdateProfilePayload } from '../../auth/types';

/**
 * `PUT /auth/profile` — `name` and `email` only.
 *
 * The response is the updated `UserResource`, so it is written into the `/auth/me`
 * cache immediately. That matters because changing the email resets
 * `email_verified_at` server-side, and the Account screen reads that flag straight
 * from the cache to decide whether to offer "resend verification".
 *
 * The session store is updated too, since the header greeting reads the cached user.
 */
export function useUpdateProfile(): UseMutationResult<MeResponse, AppError, UpdateProfilePayload> {
    const queryClient = useQueryClient();

    return useMutation<MeResponse, AppError, UpdateProfilePayload>({
        mutationFn: payload => {
            requireValidatedSession();

            return authApi.updateProfile(payload);
        },
        onSuccess: async user => {
            queryClient.setQueryData(queryKeys.session.me(), user);
            await queryClient.invalidateQueries({ queryKey: queryKeys.session.me() });
        },
    });
}

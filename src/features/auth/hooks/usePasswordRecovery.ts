import { useMutation, type UseMutationResult } from '@tanstack/react-query';

import type { AppError } from '../../../types/appError';
import { authApi } from '../api';
import { useRecoveryStore } from '../store/recoveryStore';
import type { ForgotPasswordPayload, ResetPasswordPayload } from '../types';

/**
 * Password-recovery mutations.
 *
 * These exist so Forgot/Reset are wired exactly like [`useLogin`](src/features/auth/hooks/useLogin.ts:1)
 * rather than each screen hand-rolling its own `useMutation`. The duplication was
 * what let the two flows drift from Login in the first place.
 *
 * Neither hook navigates or toasts. Navigation is owned by the screens (both flows
 * end with an explicit "back to sign in" action rather than an automatic jump — spec
 * Screen 2 §3 says "Do NOT auto-navigate to Reset", for example), and a hook that
 * navigated would be untestable and would fight the navigator.
 */

/**
 * `POST /auth/forgot-password`.
 *
 * Records the submitted address in [`useRecoveryStore`](src/features/auth/store/recoveryStore.ts:1)
 * so the Reset screen can prefill it. That is the *only* client-side side effect: the
 * response is deliberately opaque (spec Screen 2 §6 — "No user enumeration guarantee
 * documented — treat as opaque"), so nothing here inspects it to learn whether the
 * address exists.
 */
export function useForgotPassword(): UseMutationResult<
    void,
    AppError,
    ForgotPasswordPayload
> {
    const setPendingEmail = useRecoveryStore(state => state.setPendingEmail);

    return useMutation<void, AppError, ForgotPasswordPayload>({
        mutationFn: async payload => {
            await authApi.forgotPassword(payload);
        },
        onSuccess: (_data, variables) => {
            setPendingEmail(variables.email);
        },
    });
}

/**
 * `POST /auth/reset-password`.
 *
 * The pending recovery address is cleared on success so the prefill cannot bleed into
 * an unrelated reset attempt later in the same app session.
 */
export function useResetPassword(): UseMutationResult<void, AppError, ResetPasswordPayload> {
    const clearPendingEmail = useRecoveryStore(state => state.reset);

    return useMutation<void, AppError, ResetPasswordPayload>({
        mutationFn: async payload => {
            await authApi.resetPassword(payload);
        },
        onSuccess: () => {
            clearPendingEmail();
        },
    });
}

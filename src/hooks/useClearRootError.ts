import { useCallback } from 'react';

/**
 * Clears a form's **root** error the moment the user edits any field.
 *
 * ## The bug this closes
 *
 * Field errors self-heal: React Hook Form re-validates a field on change, so a 422
 * routed onto an input disappears as soon as the value is corrected. **Root** errors
 * (`setError('root', …)`) are different — they carry no field to re-validate, so a
 * 500 / network panel or a "not linked to an employee record" message stays pinned on
 * screen while the user fixes the form. The message then describes an attempt that no
 * longer exists, which is worse than showing nothing.
 *
 * ## Usage
 *
 * ```tsx
 * const { formState: { errors }, clearErrors } = useForm(...);
 * const clearRootError = useClearRootError(clearErrors, errors.root !== undefined);
 *
 * <AppTextInput
 *     value={field.value}
 *     onChangeText={text => {
 *         field.onChange(text);
 *         clearRootError();
 *     }}
 *     ...
 * />
 * ```
 *
 * The `hasRootError` flag keeps the callback identity stable and makes the common case
 * — no root error — a genuine no-op, so typing in a healthy form never triggers a
 * form-state write per keystroke.
 */
export function useClearRootError(
    /** `clearErrors` from `useForm`. */
    clearErrors: (name?: 'root') => void,
    hasRootError: boolean,
): () => void {
    return useCallback(() => {
        if (hasRootError) {
            clearErrors('root');
        }
    }, [clearErrors, hasRootError]);
}

/**
 * Auth-surface UI primitives.
 *
 * These are the 2026-spec controls shared by every screen in the auth flow
 * (login, forgot password, reset password). They are deliberately narrower than
 * the general-purpose atoms in `src/components/` — one field shape, one primary
 * action — so the three auth screens cannot drift apart.
 */
export { TextField, type TextFieldProps, type TextFieldRef } from './TextField';
export { PrimaryButton, type PrimaryButtonProps } from './PrimaryButton';
export {
    SegmentedControl,
    type SegmentedControlOption,
    type SegmentedControlProps,
} from './SegmentedControl';

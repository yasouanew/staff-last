import type { NavigatorScreenParams } from '@react-navigation/native';

/**
 * Navigation param lists.
 *
 * Declared centrally (rather than per-navigator) because several screens are
 * reachable from more than one place — a shift detail from Home, My Roster and a
 * notification tap — and they all must agree on the params.
 *
 * Params carry **identifiers, not objects**. Passing a whole `Shift` would break as
 * soon as the record changed, and a restored deep link would render stale data as if
 * it were current. Screens refetch from the id.
 */

export type AuthStackParamList = {
    Login: undefined;
    /** No params: the reset token arrives by email deep link, handled at the root. */
    ForgotPassword: undefined;
    /**
     * The emailed reset link (spec Screen 3) supplies `token` and, when the link
     * format includes it, `email`.
     *
     * Both are declared optional because the backend's reset email is a **web** link
     * (spec Screen 3 BACKEND GAP) whose only guaranteed parameter is the token — the
     * address is not part of Laravel's default reset URL, and a user arriving via the
     * Forgot screen's fallback may have no link at all. Typing them as required was a
     * lie that produced the string `"undefined"` in the form; they are optional here
     * and normalised by
     * [`parseResetParams`](src/features/auth/utils/resetLink.ts:1) on the screen.
     */
    ResetPassword: { token?: string; email?: string } | undefined;
};

export type HomeStackParamList = {
    Home: undefined;
    ShiftDetail: { shiftId: number };
    RosterDetail: { rosterId: number };
    Notifications: undefined;
};

export type RosterStackParamList = {
    MyRoster: undefined;
    RosterDetail: { rosterId: number };
    ShiftDetail: { shiftId: number };
};

export type LeaveStackParamList = {
    LeaveList: undefined;
    /** `leaveRequestId` is absent when creating a new request. */
    LeaveDetail: { leaveRequestId: number };
    CreateLeaveRequest: undefined;
};

export type AccountStackParamList = {
    Account: undefined;
    Profile: undefined;
    ChangePassword: undefined;
    Preferences: undefined;
};

export type AppTabParamList = {
    HomeTab: NavigatorScreenParams<HomeStackParamList>;
    RosterTab: NavigatorScreenParams<RosterStackParamList>;
    AvailabilityTab: undefined;
    LeaveTab: NavigatorScreenParams<LeaveStackParamList>;
    AccountTab: NavigatorScreenParams<AccountStackParamList>;
};

/**
 * Root stack.
 *
 * The auth and app hierarchies are siblings in one stack rather than a conditional
 * render, so React Navigation can animate between them and leftover screens are
 * genuinely unmounted when the session ends.
 */
export type RootStackParamList = {
    Auth: NavigatorScreenParams<AuthStackParamList>;
    App: NavigatorScreenParams<AppTabParamList>;
};

declare global {
    namespace ReactNavigation {
        interface RootParamList extends RootStackParamList { }
    }
}

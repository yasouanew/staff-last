/**
 * App boot readiness.
 *
 * Single source of truth for the global `isAppReady` boolean that the app-level
 * [`SplashScreen`](src/components/SplashScreen/SplashScreen.tsx:1) remains visible
 * behind. The splash is dismissed when — and only when — three independent
 * conditions are all satisfied, each mapping onto a distinct failure mode:
 *
 * | # | Condition | Subscribes to | Without it |
 * |---|-----------|---------------|------------|
 * | 1 | **Auth token validated** — never show an authenticated shell against an unvalidated or revoked token | `useSessionStore.status` | A revoked/deactivated account briefly renders the dashboard and is then torn down mid-paint. |
 * | 2 | **Initial roster data settled** — first network fan-out for the landing content has resolved (success *or* failure) | `useShifts` for today | The dashboard paints its skeleton and then visibly re-flows when data lands. |
 * | 3 | **Core layout mounted** — the navigator subtree has committed at least one frame | a `useEffect` mount flag in the gate | A cross-fade to a not-yet-laid-out tree flashes for one frame. |
 *
 * ## Why condition 2 is "settled", not "succeeded"
 *
 * Waiting for *success* would strand an offline user on the splash forever — the
 * app must be usable with cached data and a retry affordance, which every screen
 * already provides through `ErrorView`/`QueryState`. So the gate opens the moment
 * the query is no longer pending, and the error surfaces **inside** the dashboard
 * where it can be retried. That is the one place this hook intentionally diverges
 * from a naive reading of "requests complete successfully", and it is what makes
 * the splash impossible to get stuck behind.
 *
 * ## Why the roster query is only *observed* here
 *
 * `useShifts` is safe to call alongside the screen that owns the same query: TanStack
 * Query dedupes by key, so this observer shares the exact in-flight request rather
 * than issuing a second one. The hook therefore costs one subscriber, not one HTTP
 * round trip.
 */

import { useEffect, useState } from 'react';

import { isAuthenticatedStatus, useSessionStore } from '../../auth/store/sessionStore';
import { useShifts } from '../../shifts/hooks';
import { todayApiDate } from '../../../utils/date';

/** Milliseconds the splash remains visible after readiness, so it cannot blink. */
export const MIN_SPLASH_VISIBLE_MS = 600;

export type AppReadiness = {
    /**
     * True once every readiness condition is satisfied. Drives the splash
     * cross-fade in [`AppBootGate`](src/components/AppBootGate/AppBootGate.tsx:1).
     */
    isAppReady: boolean;
    /** Individually exposed for diagnostics and tests — never for render branching. */
    conditions: {
        /** Condition 1: `status` is no longer the `unknown` cold-start sentinel. */
        sessionResolved: boolean;
        /** Condition 2: the initial roster fan-out has settled (data or error). */
        rosterSettled: boolean;
        /** Condition 3: the gate's own subtree has committed a frame. */
        layoutMounted: boolean;
    };
};

export function useAppReadiness(): AppReadiness {
    const status = useSessionStore(state => state.status);

    /**
     * Today's roster window — the same query the Home dashboard fires (spec Screen 4
     * API 2: `GET /shifts?employee_id=&date_from=&date_to=`). Anchored to a single
     * `Y-m-d` string so the key is stable across re-renders and cannot thrash.
     */
    const today = todayApiDate();
    const rosterQuery = useShifts({ date_from: today, date_to: today, per_page: 10 });

    /**
     * Condition 3. Defaults to `false` and flips in an effect — i.e. *after* the
     * commit that mounted this hook — so the first frame the splash fades to is
     * guaranteed to be a laid-out frame rather than an empty root view.
     */
    const [layoutMounted, setLayoutMounted] = useState(false);

    useEffect(() => {
        setLayoutMounted(true);
    }, []);

    // Condition 1. `booting` is the cold-start sentinel meaning restoreSession has
    // not settled; every other status (authenticated-*, unauthenticated,
    // session-error) is a resolved state the UI can act on.
    const sessionResolved = status !== 'booting';

    /**
     * Condition 2.
     *
     * - While unauthenticated there is no roster to wait for, so the condition is
     *   satisfied immediately and the user lands on the login form without paying
     *   for a request that will never be enabled.
     * - `isPending` is the only "not settled" state; `isSuccess` and `isError` both
     *   mean the network has answered. `useShifts` stays *disabled* (therefore
     *   permanently `isPending`) when the account has no linked employee record — so
     *   `employeeId === null` is treated as settled, because no request is ever
     *   coming and the dashboard renders its explicit empty state for that case.
     */
    const rosterSettled =
        !isAuthenticatedStatus(status) ||
        rosterQuery.employeeId === null ||
        !rosterQuery.isPending;

    const [isAppReady, setIsAppReady] = useState(false);

    useEffect(() => {
        if (isAppReady) {
            return;
        }

        if (!sessionResolved || !rosterSettled || !layoutMounted) {
            return;
        }

        /**
         * Minimum-visible hold.
         *
         * Readiness can resolve within a single frame on a warm start with cached
         * data, which would make the splash flash on and off. Holding it for a short
         * floor is not cosmetic: a flash of a different colour between the native
         * launch screen and the dashboard is a far more jarring artefact than a brief
         * brand moment. The timer is cleared on unmount so a late fire cannot set
         * state on an unmounted hook.
         */
        const timer = setTimeout(() => {
            setIsAppReady(true);
        }, MIN_SPLASH_VISIBLE_MS);

        return () => {
            clearTimeout(timer);
        };
    }, [isAppReady, sessionResolved, rosterSettled, layoutMounted]);

    return {
        isAppReady,
        conditions: { sessionResolved, rosterSettled, layoutMounted },
    };
}

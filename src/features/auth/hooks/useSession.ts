import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useEffect } from 'react';

import { queryKeys } from '../../../utils/queryKeys';
import type { AppError } from '../../../types/appError';
import { authApi } from '../api';
import { isAuthenticatedStatus, useSessionStore } from '../store/sessionStore';
import type { MeResponse } from '../types';

/**
 * `GET /auth/me` — the canonical, revalidated session.
 *
 * The session store holds a cached user so the UI can render instantly on cold
 * start; this hook is what keeps that cache honest. It is only enabled while a
 * session is considered authenticated (any `authenticated-*` status), so a
 * signed-out app never fires it.
 *
 * `data` is mirrored back into the store on success — which also promotes the
 * session to `authenticated-online` — so non-React consumers (the push service, the
 * axios handler) see fresh permissions without subscribing to React Query.
 *
 * On a *failed* revalidation the store is moved to `authenticated-offline` (see
 * [`markOffline`](src/features/auth/store/sessionStore.ts:1)) rather than left
 * looking validated, so an offline session is explicit instead of indistinguishable
 * from a synchronised one. A 401 is not handled here: the axios interceptor already
 * invokes the unauthorized handler, which clears the session.
 */
export function useSession(): UseQueryResult<MeResponse, AppError> {
    const status = useSessionStore(state => state.status);
    const setUser = useSessionStore(state => state.setUser);
    const markOffline = useSessionStore(state => state.markOffline);

    const query = useQuery<MeResponse, AppError>({
        queryKey: queryKeys.session.me(),
        queryFn: () => authApi.me(),
        enabled: isAuthenticatedStatus(status),
        // The user record changes rarely and every screen reads its permissions.
        // Re-fetching on window focus is enough; this also avoids a request storm
        // when a user bounces between tabs.
        staleTime: 5 * 60 * 1000,
    });

    const { data, error, isError } = query;

    useEffect(() => {
        if (data) {
            void setUser(data);
        }
    }, [data, setUser]);

    useEffect(() => {
        // A non-auth failure (offline/500/timeout) means the cached user is now
        // unvalidated. `markOffline` only downgrades an online session, so this is a
        // no-op while a restore or a sign-out owns the state.
        if (isError && error && error.kind !== 'unauthorized') {
            markOffline(error);
        }
    }, [error, isError, markOffline]);

    return query;
}

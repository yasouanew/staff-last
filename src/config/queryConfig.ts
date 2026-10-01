import type { QueryClientConfig } from '@tanstack/react-query';

import { env } from './env';

/**
 * TanStack Query defaults.
 *
 * The mobile client is frequently on flaky mobile networks, so `staleTime` is
 * generous enough to avoid refetch storms when a user navigates between tabs,
 * while `gcTime` keeps cached screens instant when returning to them.
 */
export const queryClientConfig: QueryClientConfig = {
    defaultOptions: {
        queries: {
            staleTime: 60_000,
            gcTime: 10 * 60_000,
            retry: (failureCount, error) => {
                const status = (error as { status?: number } | undefined)?.status;

                // 4xx responses are deterministic — retrying cannot fix them.
                if (typeof status === 'number' && status >= 400 && status < 500) {
                    return false;
                }

                return failureCount < 2;
            },
            retryDelay: attemptIndex => Math.min(1_000 * 2 ** attemptIndex, 8_000),
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
        },
        mutations: {
            retry: false,
        },
    },
    ...(env.debug ? {} : {}),
};

/**
 * Returns true when an error is a 401 that survived the axios interceptor
 * (e.g. `auth/me` failing during session restore).
 */
export function isAuthenticationError(error: unknown): boolean {
    return (error as { status?: number } | undefined)?.status === 401;
}

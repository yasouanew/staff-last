import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import { saveToken } from '../../../../api/tokenStore';
import { STORAGE_KEYS } from '../../../../config/storageKeys';
import { getString } from '../../../../utils/storage';
import { authApi } from '../../api';
import { useSessionStore } from '../../store/sessionStore';
import type { LoginPayload } from '../../types';
import { useLogin } from '../useLogin';

jest.mock('../../api', () => ({
    authApi: { login: jest.fn() },
}));

jest.mock('../../../../api/tokenStore', () => ({
    saveToken: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../../utils/secureStorage', () => ({
    isSecureStorageAvailable: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../../../utils/storage', () => ({
    getString: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../store/sessionStore', () => ({
    useSessionStore: jest.fn(),
}));

const mockedLogin = authApi.login as jest.MockedFunction<typeof authApi.login>;
const mockedGetString = getString as jest.MockedFunction<typeof getString>;
const mockedSaveToken = saveToken as jest.MockedFunction<typeof saveToken>;

const setSession = jest.fn().mockResolvedValue(undefined);

/**
 * `useLogin` is the only place device metadata is attached, and the ordering of its
 * two side effects (persist the token, *then* mark the session authenticated) is what
 * makes a cold start after login restore correctly. Both behaviours are invisible from
 * the screen, so they are pinned here.
 *
 * The project deliberately has no `@testing-library/react-native` dependency, so the
 * hook is exercised through `react-test-renderer`: a throwaway component calls the hook
 * and hands the mutation result out through a ref, which the test drives directly. That
 * keeps this test dependency-free while still running the real hook, real TanStack
 * mutation and real `onSuccess`.
 */
type Harness = {
    result: { current: ReturnType<typeof useLogin> | null };
};

function renderLoginHook(): Harness {
    const queryClient = new QueryClient({
        defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });

    const harness: Harness = { result: { current: null } };

    function Probe(): null {
        harness.result.current = useLogin();

        return null;
    }

    ReactTestRenderer.act(() => {
        ReactTestRenderer.create(
            <QueryClientProvider client={queryClient}>
                <Probe />
            </QueryClientProvider>,
        );
    });

    return harness;
}

/** Narrows away `null` once the harness has been rendered. */
function mutationOf(harness: Harness): ReturnType<typeof useLogin> {
    const mutation = harness.result.current;

    if (mutation === null) {
        throw new Error('The login hook was not rendered.');
    }

    return mutation;
}

/** Reads the payload the hook handed to `authApi.login` in the nth call. */
function loginPayloadAt(callIndex: number): LoginPayload {
    const call = mockedLogin.mock.calls[callIndex];

    if (call === undefined) {
        throw new Error(`authApi.login was not called ${callIndex + 1} time(s).`);
    }

    return call[0];
}

describe('useLogin', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockedGetString.mockResolvedValue(null);
        (useSessionStore as unknown as jest.Mock).mockImplementation(selector =>
            selector({ setSession }),
        );
    });

    it('attaches device_name and platform to every login, so the session is identifiable', async () => {
        mockedLogin.mockResolvedValueOnce({
            token: 'tok',
            token_type: 'Bearer',
            user: { id: 1 },
        } as never);

        const harness = renderLoginHook();
        const mutation = mutationOf(harness);

        await ReactTestRenderer.act(async () => {
            await mutation.mutateAsync({ email: 'jane@example.com', password: 'secret' });
        });

        const payload = loginPayloadAt(0);

        expect(payload.email).toBe('jane@example.com');
        expect(payload.password).toBe('secret');
        expect(typeof payload.device_name).toBe('string');
        expect(payload.device_name?.length ?? 0).toBeGreaterThan(0);
        expect(['ios', 'android', 'web']).toContain(payload.platform);
    });

    it('reuses an FCM token already in storage rather than prompting Firebase at login', async () => {
        mockedGetString.mockResolvedValue('fcm:stored-token');
        mockedLogin.mockResolvedValueOnce({ token: 't', token_type: 'Bearer', user: {} } as never);

        const harness = renderLoginHook();
        const mutation = mutationOf(harness);

        await ReactTestRenderer.act(async () => {
            await mutation.mutateAsync({ email: 'jane@example.com', password: 'secret' });
        });

        expect(mockedGetString).toHaveBeenCalledWith(STORAGE_KEYS.fcmToken);
        expect(loginPayloadAt(0).fcm_token).toBe('fcm:stored-token');
    });

    it('lets the caller override stored metadata, including passing an explicit null token', async () => {
        mockedGetString.mockResolvedValue('fcm:stored-token');
        mockedLogin.mockResolvedValueOnce({ token: 't', token_type: 'Bearer', user: {} } as never);

        const harness = renderLoginHook();
        const mutation = mutationOf(harness);

        await ReactTestRenderer.act(async () => {
            await mutation.mutateAsync({
                email: 'jane@example.com',
                password: 'secret',
                fcm_token: null,
                device_name: 'Support iPad',
            });
        });

        const payload = loginPayloadAt(0);

        expect(payload.fcm_token).toBeNull();
        expect(payload.device_name).toBe('Support iPad');
    });

    it('omits fcm_token entirely when storage has none, since the endpoint accepts its absence', async () => {
        mockedGetString.mockResolvedValue(null);
        mockedLogin.mockResolvedValueOnce({ token: 't', token_type: 'Bearer', user: {} } as never);

        const harness = renderLoginHook();
        const mutation = mutationOf(harness);

        await ReactTestRenderer.act(async () => {
            await mutation.mutateAsync({ email: 'jane@example.com', password: 'secret' });
        });

        expect('fcm_token' in loginPayloadAt(0)).toBe(false);
    });

    it('does not fail the login when the stored token cannot be read', async () => {
        mockedGetString.mockRejectedValue(new Error('storage unavailable'));
        mockedLogin.mockResolvedValueOnce({ token: 't', token_type: 'Bearer', user: {} } as never);

        const harness = renderLoginHook();
        const mutation = mutationOf(harness);

        await ReactTestRenderer.act(async () => {
            await expect(
                mutation.mutateAsync({ email: 'jane@example.com', password: 'secret' }),
            ).resolves.toBeDefined();
        });

        expect(mockedLogin).toHaveBeenCalledTimes(1);
    });

    it('persists the token before marking the session authenticated', async () => {
        mockedLogin.mockResolvedValueOnce({
            token: 'tok',
            token_type: 'Bearer',
            user: { id: 7 },
        } as never);

        const order: string[] = [];

        mockedSaveToken.mockImplementationOnce(async () => {
            order.push('saveToken');
        });
        setSession.mockImplementationOnce(async () => {
            order.push('setSession');
        });

        const harness = renderLoginHook();
        const mutation = mutationOf(harness);

        await ReactTestRenderer.act(async () => {
            await mutation.mutateAsync({ email: 'jane@example.com', password: 'secret' });
        });

        // The token is persisted with its rotation metadata. `expiresAt`/`expiresInSeconds`/
        // `refreshToken` are null because this backend returns none, in which case
        // `saveToken` derives an advisory expiry from `env.auth.tokenTtlSeconds`.
        expect(mockedSaveToken).toHaveBeenCalledWith({
            token: 'tok',
            tokenType: 'Bearer',
            expiresAt: null,
            expiresInSeconds: null,
            refreshToken: null,
        });
        expect(order).toEqual(['saveToken', 'setSession']);
    });

    it('propagates the normalised error so the screen can switch on `kind`', async () => {
        const error = { kind: 'throttled' as const, status: 429, message: 'Too many attempts.' };
        mockedLogin.mockRejectedValueOnce(error);

        const harness = renderLoginHook();
        const mutation = mutationOf(harness);

        await ReactTestRenderer.act(async () => {
            await expect(
                mutation.mutateAsync({ email: 'jane@example.com', password: 'secret' }),
            ).rejects.toBe(error);
        });

        // A rejected login must not leave a token or a session behind.
        expect(mockedSaveToken).not.toHaveBeenCalled();
        expect(setSession).not.toHaveBeenCalled();
    });
});

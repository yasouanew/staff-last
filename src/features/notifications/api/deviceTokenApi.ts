import { axiosInstance, normalizeError } from '../../../api/client';
import { parseApiResponse } from '../../../api/schemas';
import type { DevicePlatform } from '../../../types/api';
import type { AppError } from '../../../types/appError';
import { deviceTokenResourceSchema } from '../validation/apiSchemas';

/**
 * Push token registration (spec Screen 11, APIs 5–6).
 *
 * These two calls deliberately bypass the typed `api.*` helpers and use the raw
 * `axiosInstance`, for one reason: unregistering sends a **JSON body on DELETE**,
 * which the shared helpers do not model (they treat DELETE as body-less). Going
 * through `axiosInstance` also means a failed unregister still benefits from the
 * shared interceptors — in particular the 401 handling — while keeping the helper
 * contract clean for every other endpoint.
 */

export type RegisterDeviceTokenPayload = {
    token: string;
    platform: DevicePlatform;
    device_name?: string;
    app_version?: string;
    os_version?: string;
};

/** The backend never echoes the raw token back — only safe metadata. */
export type DeviceTokenResource = {
    id: number;
    device_name: string | null;
    platform: string;
    is_active: boolean;
    last_used_at: string | null;
};

export const deviceTokenApi = {
    /**
     * `POST /device-tokens`.
     *
     * Called at three moments: right after login, on an FCM token refresh, and when
     * the user re-enables push in Settings. The backend upserts, so repeat calls are
     * safe and no client-side de-duplication is needed.
     */
    async register(payload: RegisterDeviceTokenPayload): Promise<DeviceTokenResource | undefined> {
        try {
            /*
             * `response.data` is already the **unwrapped** payload.
             *
             * The shared response interceptor validates the Laravel envelope and replaces
             * `response.data` with the contents of its `data` key, so the resource is at
             * `response.data` — not `response.data.data`. Reading the latter looked for a
             * nested `data` key that the server never sends, so this method returned
             * `undefined` for *every* response, including a fully-populated one. The
             * type argument is the unwrapped resource, which is what the interceptor
             * actually leaves in place.
             */
            const response = await axiosInstance.post<unknown>('/device-tokens', payload);

            /*
             * The endpoint may legitimately return no body. Two shapes reach here and
             * both mean "nothing to report":
             *
             *  - `undefined`/`null` — the envelope had no `data` key, so the interceptor
             *    set `response.data` to the absent payload.
             *  - `''` — a 204/empty body is not a JSON envelope, so `unwrapEnvelope`
             *    leaves the raw string in place.
             *
             * Anything that is not an object is therefore treated as absent; handing a
             * string to the resource schema would report a *successful* registration as
             * a contract violation.
             */
            if (typeof response.data !== 'object' || response.data === null) {
                return undefined;
            }

            return parseApiResponse(
                deviceTokenResourceSchema,
                response.data,
                'POST /device-tokens',
            );
        } catch (error) {
            throw normalizeError(error) as AppError;
        }
    },

    /** `DELETE /device-tokens` with `{ token }` in the body. */
    async unregister(token: string): Promise<void> {
        try {
            await axiosInstance.delete('/device-tokens', { data: { token } });
        } catch (error) {
            throw normalizeError(error) as AppError;
        }
    },
};

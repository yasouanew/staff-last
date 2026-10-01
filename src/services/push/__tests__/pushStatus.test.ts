import type { AppError } from '../../../types/appError';
import {
    describePermission,
    isInvalidTokenError,
    isTokenAlreadyRemoved,
    mapAuthorizationStatus,
} from '../pushStatus';
import { isPushHealthy, usePushStatusStore } from '../pushStatusStore';

/**
 * Push failures are non-fatal by design, which is exactly why the *reason* must be
 * legible. These tests pin the mapping from native/backend signals to the user-facing
 * status the Settings screen renders.
 */

function appError(overrides: Partial<AppError> = {}): AppError {
    return { kind: 'server', message: 'err', ...overrides };
}

describe('mapAuthorizationStatus', () => {
    it('maps AUTHORIZED and PROVISIONAL to granted', () => {
        expect(mapAuthorizationStatus(1)).toBe('granted');
        expect(mapAuthorizationStatus(2)).toBe('granted');
    });

    it('maps DENIED to denied', () => {
        expect(mapAuthorizationStatus(0)).toBe('denied');
    });

    it('maps NOT_DETERMINED to not-determined', () => {
        expect(mapAuthorizationStatus(-1)).toBe('not-determined');
    });

    it('falls back to unknown for an unrecognised value', () => {
        expect(mapAuthorizationStatus(99)).toBe('unknown');
    });
});

describe('describePermission', () => {
    it('explains a denial with an OS-settings remedy', () => {
        const copy = describePermission('denied');

        expect(copy).toContain('Settings');
    });

    it('says nothing for granted', () => {
        expect(describePermission('granted')).toBeNull();
    });

    it('explains an unsupported build', () => {
        expect(describePermission('unsupported')).toContain('not configured');
    });
});

describe('isInvalidTokenError', () => {
    it('treats 404 and 410 as an invalid token', () => {
        expect(isInvalidTokenError(appError({ status: 404 }))).toBe(true);
        expect(isInvalidTokenError(appError({ status: 410 }))).toBe(true);
    });

    it('treats a 422 on the token field as an invalid token', () => {
        expect(
            isInvalidTokenError(appError({ status: 422, kind: 'validation', fieldErrors: { token: ['invalid'] } })),
        ).toBe(true);
    });

    it('does not treat an unrelated 422 as an invalid token', () => {
        expect(
            isInvalidTokenError(appError({ status: 422, kind: 'validation', fieldErrors: { platform: ['invalid'] } })),
        ).toBe(false);
    });

    it('does not treat a connectivity failure as an invalid token', () => {
        expect(isInvalidTokenError(appError({ kind: 'network' }))).toBe(false);
    });
});

describe('isTokenAlreadyRemoved', () => {
    it('is true for 404 and 410 only', () => {
        expect(isTokenAlreadyRemoved(appError({ status: 404 }))).toBe(true);
        expect(isTokenAlreadyRemoved(appError({ status: 410 }))).toBe(true);
        expect(isTokenAlreadyRemoved(appError({ status: 500 }))).toBe(false);
    });
});

describe('pushStatusStore', () => {
    beforeEach(() => {
        usePushStatusStore.getState().reset();
    });

    it('records permission and registration independently', () => {
        const store = usePushStatusStore.getState();

        store.setPermission('granted');
        store.setRegistration('registered');

        expect(usePushStatusStore.getState().permission).toBe('granted');
        expect(usePushStatusStore.getState().registration).toBe('registered');
        expect(usePushStatusStore.getState().lastCheckedAt).not.toBeNull();
    });

    it('is healthy only when permission is granted AND registration succeeded', () => {
        expect(isPushHealthy({ permission: 'granted', registration: 'registered' })).toBe(true);
        expect(isPushHealthy({ permission: 'granted', registration: 'pending' })).toBe(false);
        expect(isPushHealthy({ permission: 'denied', registration: 'registered' })).toBe(false);
    });

    it('resets to the cold-start state on sign-out', () => {
        usePushStatusStore.getState().setPermission('granted');
        usePushStatusStore.getState().setRegistration('registered');

        usePushStatusStore.getState().reset();

        expect(usePushStatusStore.getState().permission).toBe('unknown');
        expect(usePushStatusStore.getState().registration).toBe('unknown');
        expect(usePushStatusStore.getState().message).toBeNull();
    });
});

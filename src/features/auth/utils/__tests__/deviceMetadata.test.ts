import { Platform } from 'react-native';

import { buildDeviceName, buildLoginDeviceMetadata, resolveOsVersion, resolvePlatform } from '../deviceMetadata';

/**
 * Device metadata feeds the audit trail the backend keeps for each token
 * (spec Screen 1: `device_name`, `platform`, `app_version`, `os_version`, all
 * nullable except `device_name`/`platform`). The tests below pin the two properties
 * that matter: `device_name` is never empty, and version fields are *omitted* rather
 * than sent as `"undefined"` when the platform cannot supply them.
 */
describe('resolvePlatform', () => {
    const original = Platform.OS;

    afterEach(() => {
        Object.defineProperty(Platform, 'OS', { value: original, configurable: true });
    });

    it.each([['ios'], ['android']])('reports %s natively', os => {
        Object.defineProperty(Platform, 'OS', { value: os, configurable: true });

        expect(resolvePlatform()).toBe(os);
    });

    it('falls back to "web" for any other platform', () => {
        Object.defineProperty(Platform, 'OS', { value: 'windows', configurable: true });

        expect(resolvePlatform()).toBe('web');
    });
});

describe('resolveOsVersion', () => {
    const original = Platform.Version;

    afterEach(() => {
        Object.defineProperty(Platform, 'Version', { value: original, configurable: true });
    });

    it('stringifies the numeric version React Native reports on Android', () => {
        Object.defineProperty(Platform, 'Version', { value: 34, configurable: true });

        expect(resolveOsVersion()).toBe('34');
    });

    it('passes through the string version iOS reports', () => {
        Object.defineProperty(Platform, 'Version', { value: '17.4', configurable: true });

        expect(resolveOsVersion()).toBe('17.4');
    });

    it('returns undefined for an unusable version rather than the string "undefined"', () => {
        Object.defineProperty(Platform, 'Version', { value: undefined, configurable: true });

        expect(resolveOsVersion()).toBeUndefined();
    });
});

describe('buildDeviceName', () => {
    it('is never empty, so the backend audit column is always meaningful', () => {
        expect(buildDeviceName().length).toBeGreaterThan(0);
    });

    it('includes the platform, which is what an admin reads to identify a session', () => {
        expect(buildDeviceName()).toMatch(/Staff App \(/);
    });
});

describe('buildLoginDeviceMetadata', () => {
    it('always provides the two required fields', () => {
        const metadata = buildLoginDeviceMetadata();

        expect(typeof metadata.device_name).toBe('string');
        expect(metadata.device_name.length).toBeGreaterThan(0);
        expect(['ios', 'android', 'web']).toContain(metadata.platform);
    });

    it('omits optional fields entirely when they are unavailable, rather than sending nulls', () => {
        const metadata = buildLoginDeviceMetadata();

        // Any present key must hold a usable string; absent keys must not appear at
        // all, because the interceptor serialises the object straight to JSON.
        Object.entries(metadata).forEach(([, value]) => {
            expect(typeof value).toBe('string');
            expect(value).not.toBe('undefined');
        });
    });
});

import type { AppError } from '../../types/appError';
import {
    isCompanyAccessLocked,
    isRetryable,
    kindFromStatus,
    requiresReauthentication,
    toFieldErrorMap,
} from '../errors';

/**
 * The auth screens depend on these helpers to decide *how* to present a failure:
 * a 429 must not be retried silently, a 403 from a locked company must be
 * distinguished from an ordinary permission error, and only 422s have usable field
 * errors. Getting one of these wrong shows the user a confidently wrong message.
 */
describe('kindFromStatus', () => {
    it.each([
        [401, 'unauthorized'],
        [403, 'forbidden'],
        [404, 'not_found'],
        [422, 'validation'],
        [429, 'throttled'],
        [500, 'server'],
        [503, 'server'],
        [418, 'unknown'],
    ])('maps %i to %s', (status, expected) => {
        expect(kindFromStatus(status)).toBe(expected);
    });
});

describe('isRetryable', () => {
    const make = (kind: AppError['kind']): AppError => ({ kind, message: 'x' });

    it('allows retrying transport failures', () => {
        expect(isRetryable(make('network'))).toBe(true);
        expect(isRetryable(make('timeout'))).toBe(true);
    });

    it('never retries a throttled request, because retrying makes it worse', () => {
        expect(isRetryable(make('throttled'))).toBe(false);
    });

    it('never retries validation, authorization or cancellation', () => {
        expect(isRetryable(make('validation'))).toBe(false);
        expect(isRetryable(make('unauthorized'))).toBe(false);
        expect(isRetryable(make('forbidden'))).toBe(false);
        expect(isRetryable(make('cancelled'))).toBe(false);
    });
});

describe('requiresReauthentication', () => {
    it('is true only for a 401', () => {
        expect(requiresReauthentication({ kind: 'unauthorized', message: 'x' })).toBe(true);
        expect(requiresReauthentication({ kind: 'forbidden', message: 'x' })).toBe(false);
    });
});

describe('isCompanyAccessLocked', () => {
    it('classifies a 403 that mentions the subscription as a lock', () => {
        expect(
            isCompanyAccessLocked({
                kind: 'forbidden',
                status: 403,
                message: 'Your company subscription is inactive.',
            }),
        ).toBe(true);
    });

    it('classifies a 403 that mentions the trial as a lock', () => {
        expect(
            isCompanyAccessLocked({ kind: 'forbidden', status: 403, message: 'Your trial has expired.' }),
        ).toBe(true);
    });

    it('does not mistake an ordinary permission denied for a lock', () => {
        // The paywall interstitial offers a sign-out, so misclassifying a missing
        // permission here would eject a user from a working account.
        expect(
            isCompanyAccessLocked({ kind: 'forbidden', status: 403, message: 'This action is unauthorized.' }),
        ).toBe(false);
    });

    it('ignores non-forbidden errors even when the wording matches', () => {
        expect(isCompanyAccessLocked({ kind: 'not_found', message: 'No subscription found.' })).toBe(false);
    });
});

describe('toFieldErrorMap', () => {
    it('keeps only the first message per field, since a mobile input shows one line', () => {
        const result = toFieldErrorMap({
            kind: 'validation',
            message: 'The given data was invalid.',
            fieldErrors: {
                email: ['The email field is required.', 'The email must be valid.'],
            },
        });

        expect(result).toEqual({ email: 'The email field is required.' });
    });

    it('skips empty message arrays so a blank error never reaches the UI', () => {
        const result = toFieldErrorMap({
            kind: 'validation',
            message: 'The given data was invalid.',
            fieldErrors: { token: [], email: ['bad'] },
        });

        expect(result).toEqual({ email: 'bad' });
    });

    it('returns an empty map when the error carries no field errors at all', () => {
        expect(toFieldErrorMap({ kind: 'server', message: 'Boom.' })).toEqual({});
    });
});

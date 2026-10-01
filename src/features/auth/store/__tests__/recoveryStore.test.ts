import { recoveryActions, useRecoveryStore } from '../recoveryStore';

/**
 * The recovery store is a single-use handoff between Forgot and Reset. Its whole
 * reason for existing is that a stale address must never leak into an unrelated
 * reset, so the tests focus on the consume-and-clear semantics rather than on the
 * setters.
 */
describe('useRecoveryStore', () => {
    beforeEach(() => {
        recoveryActions.reset();
    });

    it('starts empty, so a cold start simply means "no prefill"', () => {
        const state = useRecoveryStore.getState();

        expect(state.pendingEmail).toBeNull();
        expect(state.requestedAt).toBeNull();
    });

    it('records a submitted address with a timestamp', () => {
        recoveryActions.setPendingEmail('jane@example.com');

        const state = useRecoveryStore.getState();

        expect(state.pendingEmail).toBe('jane@example.com');
        expect(state.requestedAt).toEqual(expect.any(Number));
    });

    it('trims the address before storing it', () => {
        recoveryActions.setPendingEmail('  jane@example.com  ');

        expect(useRecoveryStore.getState().pendingEmail).toBe('jane@example.com');
    });

    it('treats a blank address as nothing to store, rather than storing an empty string', () => {
        recoveryActions.setPendingEmail('   ');

        expect(useRecoveryStore.getState().pendingEmail).toBeNull();
    });

    it('clears itself on read, so the prefill cannot be applied twice', () => {
        recoveryActions.setPendingEmail('jane@example.com');

        expect(recoveryActions.consumePendingEmail()).toBe('jane@example.com');
        expect(recoveryActions.consumePendingEmail()).toBeNull();
        expect(useRecoveryStore.getState().pendingEmail).toBeNull();
    });

    it('returns null on the first read when nothing was requested', () => {
        expect(recoveryActions.consumePendingEmail()).toBeNull();
    });

    it('clears everything on reset, which is what a completed reset triggers', () => {
        recoveryActions.setPendingEmail('jane@example.com');
        recoveryActions.reset();

        const state = useRecoveryStore.getState();

        expect(state.pendingEmail).toBeNull();
        expect(state.requestedAt).toBeNull();
    });
});

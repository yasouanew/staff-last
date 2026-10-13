import { runRecoveryPipeline, type RecoveryDeps } from '../recoveryPipeline';

/**
 * Recovery pipeline ordering and failure isolation.
 *
 * The pipeline is the heart of the offline → online recovery: it must run the steps in
 * a fixed order (session before the outbox flush, which requires a validated session)
 * and must never let one failing step abort the rest.
 */

function deps(overrides: Partial<RecoveryDeps> = {}): RecoveryDeps {
    return {
        refreshSession: jest.fn(async () => true),
        flushOutbox: jest.fn(async () => 0),
        registerDevice: jest.fn(async () => undefined),
        syncNotifications: jest.fn(async () => 0),
        ...overrides,
    };
}

describe('runRecoveryPipeline', () => {
    it('runs the steps in the documented order', async () => {
        const order: string[] = [];

        const injected = deps({
            refreshSession: jest.fn(async () => {
                order.push('session');

                return true;
            }),
            flushOutbox: jest.fn(async () => {
                order.push('outbox');

                return 2;
            }),
            registerDevice: jest.fn(async () => {
                order.push('push');
            }),
            syncNotifications: jest.fn(async () => {
                order.push('notifications');

                return 3;
            }),
        });

        const result = await runRecoveryPipeline(injected);

        expect(order).toEqual(['session', 'outbox', 'push', 'notifications']);
        expect(result).toEqual({
            sessionRefreshed: true,
            outboxFlushed: 2,
            notificationsMerged: 3,
        });
    });

    it('continues after a step throws, so one failure cannot strand the rest', async () => {
        const injected = deps({
            refreshSession: jest.fn(async () => {
                throw new Error('session boom');
            }),
            flushOutbox: jest.fn(async () => 1),
            registerDevice: jest.fn(async () => {
                throw new Error('push boom');
            }),
            syncNotifications: jest.fn(async () => 4),
        });

        const result = await runRecoveryPipeline(injected);

        // The throwing steps report their neutral value...
        expect(result.sessionRefreshed).toBe(false);
        // ...but the steps after them still ran.
        expect(result.outboxFlushed).toBe(1);
        expect(result.notificationsMerged).toBe(4);
        expect(injected.registerDevice).toHaveBeenCalledTimes(1);
    });

    it('reports a failed session refresh without aborting the outbox flush', async () => {
        const injected = deps({
            refreshSession: jest.fn(async () => false),
            flushOutbox: jest.fn(async () => 5),
        });

        const result = await runRecoveryPipeline(injected);

        expect(result.sessionRefreshed).toBe(false);
        expect(result.outboxFlushed).toBe(5);
    });
});

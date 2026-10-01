import { availabilityApi } from '../../features/availability/api';
import { deviceTokenApi } from '../../features/notifications/api';
import { notificationsApi } from '../../features/notifications/api';
import type { SyncWeeklyAvailabilityPayload } from '../../features/availability/types';
import type { RegisterDeviceTokenPayload } from '../../features/notifications/api';
import type { OutboxKind } from './outboxStore';

/**
 * Replay handlers, one per [`OutboxKind`](src/services/outbox/outboxStore.ts:1).
 *
 * Each handler performs exactly the network call the corresponding operation would
 * have made, and is deliberately thin: all queueing, retry and failure semantics live
 * in [`outboxStore`](src/services/outbox/outboxStore.ts:1) and
 * [`syncOutbox`](src/services/outbox/syncOutbox.ts:1). A handler that throws causes the
 * entry to be backed off or dead-lettered; a handler that resolves removes it.
 *
 * Adding a queued operation is therefore: a new `OutboxKind`, an entry here, and an
 * `enqueue` call at the operation's site.
 */
export const outboxHandlers: Record<OutboxKind, (payload: Record<string, unknown>) => Promise<unknown>> = {
    'notification.read': payload => notificationsApi.markAsRead(String(payload.id)),

    'notification.read-all': () => notificationsApi.markAllAsRead(),

    'availability.sync': payload =>
        availabilityApi.sync(
            Number(payload.employeeId),
            payload.payload as SyncWeeklyAvailabilityPayload,
        ),

    'push.register': payload => deviceTokenApi.register(payload.payload as RegisterDeviceTokenPayload),

    /**
     * Deferred unregister, queued when the server was unreachable at sign-out/opt-out.
     *
     * The token travels in the payload because the local copy may already have been
     * cleared; a 404/410 means it is already gone, which the sync runner treats as
     * success rather than a failure.
     */
    'push.unregister': payload => deviceTokenApi.unregister(String(payload.token)),
};

import { useNotificationInboxStore, selectUnreadCount } from '../store';

/**
 * Unread count derived from the local inbox.
 *
 * Returns `null` until the inbox has been hydrated, which lets the caller distinguish
 * "we do not know yet" from "zero unread" — rendering `0` before the first read would
 * flash a badge off/on every launch.
 *
 * The server count is still fetched by [`useUnreadCount`](src/features/notifications/hooks/useUnreadCount.ts:15);
 * this selector is what should be *rendered*, because it stays correct with no network
 * and reflects a read the user just performed before the write has landed.
 */
export function useLocalUnreadCount(): number | null {
    const hydrated = useNotificationInboxStore(state => state.hydrated);
    const count = useNotificationInboxStore(selectUnreadCount);

    return hydrated ? count : null;
}

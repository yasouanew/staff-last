import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { FlatList } from 'react-native';

import { NotificationsScreen } from '../../src/features/notifications/screens/NotificationsScreen';
import { useOutboxStore } from '../../src/services/outbox';
import { appNotification, notificationList } from '../../src/testing/api/fixtures';
import { fail, networkError, ok, type MockResult } from '../../src/testing/api/mockServer';
import { createMockNavigation, setupScreenTest } from '../../src/testing/renderWithProviders';

/**
 * Screen integration tests — Notifications (spec Screen 10).
 *
 * Follows the nine-block template documented in
 * [`__tests__/screens/README.md`](./README.md).
 *
 * ## Screen-specific notes
 *
 * - **Local-first.** The screen renders from the device inbox and treats
 *   `GET /notifications` as a *reconciler*, so the load states are not the usual
 *   `isPending/isError` pair: the skeleton covers the cold "nothing on disk yet" window,
 *   and the error branch is reserved for "the request failed **and** there is nothing
 *   stored to fall back on". Both are asserted below, and so is the third case — rows on
 *   screen while the sync is failing, which must keep the rows and show a quiet notice
 *   rather than an error page.
 * - **Blocks 6–8 are real mutations.** Mark-read and mark-all-read are the only writes on
 *   this screen, so unlike the roster/leave feeds these blocks exercise an actual
 *   `POST`, including the durable-outbox rule: a *connectivity* failure is queued and
 *   retried, while a 403 is a real answer and must **not** be queued.
 */
describe('NotificationsScreen', () => {
    const harness = setupScreenTest();
    const mockNavigation = createMockNavigation<{ goBack: () => void }>();

    beforeEach(async () => {
        await harness.setup();
        jest.clearAllMocks();
    });

    afterEach(async () => {
        await harness.teardown();
    });

    const serveInbox = (list: MockResult | (() => MockResult | Promise<MockResult>)): void => {
        harness.server.get('/notifications', typeof list === 'function' ? list : () => list);
    };

    const renderNotifications = () =>
        harness.render(<NotificationsScreen navigation={mockNavigation} />);

    const row = (title: string) => screen.getByText(title);

    describe('1. Loading', () => {
        it('renders row skeletons during the cold first load', async () => {
            serveInbox(() => new Promise<MockResult>(() => {}));

            await renderNotifications();

            expect(screen.getByText('Notifications')).toBeTruthy();
            // `isInitialLoading` is `!hydrated && isPending`: nothing on disk and the
            // reconciling request still open. Only then is a skeleton honest.
            expect(screen.getByTestId('skeleton-rows')).toBeTruthy();
            expect(screen.queryByText('Nothing yet')).toBeNull();
        });
    });

    describe('2. Success', () => {
        it('renders a row per notification and offers mark-all-read', async () => {
            serveInbox(() => ok(notificationList([appNotification()])));

            await renderNotifications();

            await waitFor(() => expect(row('New shift assigned')).toBeTruthy());

            expect(screen.getByText('You have been assigned a shift on 1 Oct.')).toBeTruthy();
            // Unread rows are actionable, so the batch action is offered.
            expect(screen.getByText('Mark all read')).toBeTruthy();
        });
    });

    describe('3. Empty', () => {
        it('renders the empty state once a successful sync returns no rows', async () => {
            serveInbox(() => ok(notificationList([])));

            await renderNotifications();

            await waitFor(() => expect(screen.getByText('Nothing yet')).toBeTruthy());

            expect(
                screen.getByText(
                    'Shift changes, roster updates and leave decisions will show up here.',
                ),
            ).toBeTruthy();
            // Nothing unread ⇒ nothing to mark, so the batch action is withheld.
            expect(screen.queryByText('Mark all read')).toBeNull();
        });
    });

    describe('4. Error', () => {
        it('renders the error branch when the sync fails with nothing stored', async () => {
            serveInbox(() => fail(500, 'Notifications unavailable.'));

            await renderNotifications();

            // The screen supplies its own honest copy for this case: a failed request is
            // not "no notifications", so it must not claim there is nothing to show.
            await waitFor(() => expect(screen.getByText('No connection')).toBeTruthy());

            expect(
                screen.getByText('Notifications could not be loaded and none are stored on this device.'),
            ).toBeTruthy();
            expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
        });

        it('keeps stored rows and shows a quiet notice when a later sync fails', async () => {
            // A row on disk ⇒ the reconciling request failing must not take the list away.
            let response: MockResult = ok(notificationList([appNotification()]));

            serveInbox(() => response);

            await renderNotifications();
            await waitFor(() => expect(row('New shift assigned')).toBeTruthy());

            response = fail(503, 'Service unavailable');

            // Pull-to-refresh re-runs the reconciler.
            await act(async () => {
                screen.UNSAFE_getByType(FlatList).props.onRefresh?.();
            });

            // The rows stay, and the reason they may be out of date is stated inline
            // instead of replacing them with a full-screen retry prompt.
            await waitFor(() =>
                expect(
                    screen.getByText(
                        'Showing notifications stored on this device. They will re-sync when you are back online.',
                    ),
                ).toBeTruthy(),
            );
            expect(row('New shift assigned')).toBeTruthy();
            expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
        });
    });

    describe('5. Retry recovery', () => {
        it('re-syncs and renders rows when retry is tapped', async () => {
            let failing = true;

            serveInbox(() =>
                failing
                    ? fail(500, 'Notifications offline')
                    : ok(notificationList([appNotification()])),
            );

            await renderNotifications();

            await waitFor(() => expect(screen.getByText('Try again')).toBeTruthy());

            failing = false;
            fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

            await waitFor(() => expect(row('New shift assigned')).toBeTruthy());
            expect(harness.server.hitCount('/notifications')).toBeGreaterThan(1);
        });
    });


    describe('6. Mutation pending', () => {
        it('marks the row read locally while the write is still in flight', async () => {
            serveInbox(() => ok(notificationList([appNotification()])));

            // A deferred, not a never-settling promise: the assertion needs an *open*
            // window, and the window is closed again before the test ends so no request is
            // left dangling for the next suite.
            let completeWrite: (() => void) | null = null;
            harness.server.post(
                '/notifications/read-all',
                () =>
                    new Promise<MockResult>(resolve => {
                        completeWrite = () => resolve(ok(undefined, 'All marked as read.'));
                    }),
            );

            await renderNotifications();
            await waitFor(() =>
                expect(screen.getByLabelText('New shift assigned, unread')).toBeTruthy(),
            );

            fireEvent.press(screen.getByText('Mark all read'));

            // Local-first: the row stops being unread immediately, without waiting on the
            // network — the tap must never look ignored.
            await waitFor(() => expect(screen.getByLabelText('New shift assigned')).toBeTruthy());
            expect(screen.queryByLabelText('New shift assigned, unread')).toBeNull();
            expect(harness.server.hitCount('/notifications/read-all')).toBe(1);

            await act(async () => {
                completeWrite?.();
            });
        });
    });

    describe('7. Mutation success', () => {
        it('writes the single read to the server and keeps the row read', async () => {
            serveInbox(() => ok(notificationList([appNotification()])));
            harness.server.post('/notifications/ntf-1/read', () => ok(undefined, 'Marked as read.'));

            await renderNotifications();
            await waitFor(() => expect(screen.getByLabelText('New shift assigned, unread')).toBeTruthy());

            fireEvent.press(screen.getByLabelText('New shift assigned, unread'));

            await waitFor(() => expect(harness.server.hitCount('/notifications/ntf-1/read')).toBe(1));

            // The re-sync cannot revert a read the server has not observed yet, so the row
            // stays read after the post-mutation invalidation.
            await waitFor(() => expect(screen.getByLabelText('New shift assigned')).toBeTruthy());
        });
    });

    describe('8. Mutation failure', () => {
        it('queues a connectivity failure in the outbox so the read is never lost', async () => {
            serveInbox(() => ok(notificationList([appNotification()])));
            harness.server.post('/notifications/read-all', () => networkError());

            await renderNotifications();
            await waitFor(() => expect(screen.getByText('Mark all read')).toBeTruthy());

            fireEvent.press(screen.getByText('Mark all read'));

            await waitFor(() => expect(useOutboxStore.getState().entries).toHaveLength(1));
            expect(useOutboxStore.getState().entries[0]?.kind).toBe('notification.read-all');
        });

        it('does not queue a rejected write, because the server gave a real answer', async () => {
            serveInbox(() => ok(notificationList([appNotification()])));
            // 403 is a decision, not an outage: retrying it forever would be wrong.
            harness.server.post('/notifications/read-all', () => fail(403, 'Not permitted.'));

            await renderNotifications();
            await waitFor(() => expect(screen.getByText('Mark all read')).toBeTruthy());

            fireEvent.press(screen.getByText('Mark all read'));

            await waitFor(() => expect(harness.server.hitCount('/notifications/read-all')).toBe(1));
            expect(useOutboxStore.getState().entries).toHaveLength(0);
            // The screen survives the rejection and keeps rendering the list.
            expect(row('New shift assigned')).toBeTruthy();
        });
    });


    describe('9. Accessibility', () => {
        it('labels every row, distinguishes unread from read, and exposes the batch action', async () => {
            serveInbox(() =>
                ok(
                    notificationList([
                        appNotification(),
                        appNotification({
                            id: 'ntf-2',
                            title: 'Roster published',
                            body: 'Next week is available.',
                            read_at: '2026-09-25T08:00:00+10:00',
                        }),
                    ]),
                ),
            );

            await renderNotifications();

            await waitFor(() => expect(screen.getByText('Roster published')).toBeTruthy());

            // ---- Unread is announced, not signalled by colour alone ----
            const unreadRow = screen.getByLabelText('New shift assigned, unread');
            expect(unreadRow.props.accessibilityRole).toBe('button');

            // ---- A read row is still a target, but drops the modifier ----
            const readRow = screen.getByLabelText('Roster published');
            expect(readRow.props.accessibilityRole).toBe('button');
            expect(readRow.props.accessibilityState.disabled).toBe(true);

            // ---- Batch action: a labelled button, not an icon ----
            const markAll = screen.getByText('Mark all read');
            expect(markAll).toBeTruthy();
        });

        it('exposes the header back control as a labelled button', async () => {
            serveInbox(() => ok(notificationList([])));

            await renderNotifications();

            await waitFor(() => expect(screen.getByText('Nothing yet')).toBeTruthy());

            fireEvent.press(screen.getByLabelText('Go back'));

            expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
        });
    });
});


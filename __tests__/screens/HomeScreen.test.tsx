import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { RefreshControl } from 'react-native';

import { HomeScreen } from '../../src/features/home/screens/HomeScreen';
import { authUser, paginated, shift } from '../../src/testing/api/fixtures';
import { fail, ok, type MockResult } from '../../src/testing/api/mockServer';
import {
    createMockNavigation,
    createMockRoute,
    setupScreenTest,
} from '../../src/testing/renderWithProviders';
import { todayApiDate } from '../../src/utils/date';

/**
 * Screen integration tests — Home (spec Screen 4).
 *
 * ## Template
 *
 * This file is the reference implementation of the standard screen suite described in
 * [`__tests__/screens/README.md`](./README.md). Every screen suite uses the same nine
 * numbered blocks, in the same order, with the same scaffolding:
 *
 * | # | Block | What it pins |
 * |---|-------|--------------|
 * | 1 | Loading | the first-paint skeleton — never a blank screen, never a stale empty state |
 * | 2 | Success | the data the user came for, including the summary derived from it |
 * | 3 | Empty | zero rows *after a successful load* (`EmptyState`, not an error) |
 * | 4 | Error | the failure branch, its title/message copy and its retry affordance |
 * | 5 | Retry | tapping retry actually re-requests and recovers in place |
 * | 6 | Action pending | the in-flight state, driven by a request that never settles |
 * | 7 | Action success | the write lands and the UI reflects it |
 * | 8 | Action failure | a failed write degrades gracefully instead of blanking the screen |
 * | 9 | Accessibility | role + label + reachable target on every interactive element |
 *
 * Assertions are made against the **rendered tree**, never against hook internals, so a
 * refactor that keeps behaviour keeps the tests green.
 */
type HomeScreenProps = React.ComponentProps<typeof HomeScreen>;

/** Anything the mock server can answer with, including a deliberate non-response. */
type Served = MockResult | (() => MockResult | Promise<MockResult>);

/** The two `RefreshControl` props these suites drive, read back from the rendered list. */
type RefreshControlStub = { refreshing?: boolean; onRefresh?: () => void };

describe('HomeScreen', () => {
    const harness = setupScreenTest();
    const mockNavigation = createMockNavigation<HomeScreenProps['navigation']>();
    const mockRoute = createMockRoute('Home');

    beforeEach(async () => {
        await harness.setup();
        jest.clearAllMocks();
    });

    afterEach(async () => {
        await harness.teardown();
    });

    /**
     * Registers every route the dashboard touches.
     *
     * `/shifts` serves both windows the hook requests (today, and tomorrow→+7d): the mock
     * router matches on method+path only, and one handler is faithful here because the
     * dashboard treats both responses as the same collection — which is how the real
     * endpoint behaves for an overlapping range.
     */
    const serveDashboard = (shifts: Served, unread = 0): void => {
        harness.server.get('/shifts', typeof shifts === 'function' ? shifts : () => shifts);
        harness.server.get('/notifications/unread-count', () => ok({ count: unread }));
        harness.server.get('/auth/me', () => ok(authUser()));
    };

    const renderHome = () =>
        harness.render(<HomeScreen navigation={mockNavigation} route={mockRoute} />);

    /** The list's pull-to-refresh control, read back from the live tree. */
    const refreshControl = (): RefreshControlStub =>
        screen.UNSAFE_getByType(RefreshControl).props as RefreshControlStub;

    const isRefreshing = (): boolean => refreshControl().refreshing === true;

    /**
     * Performs a pull-to-refresh.
     *
     * The handler is invoked directly rather than through `fireEvent(list, 'refresh')`:
     * the screen hands the list a `refreshControl` *element* instead of the list's own
     * `onRefresh`/`refreshing` props, so there is no handler on the list node to fire at.
     * The callback reached here is the exact one the control calls on a real pull, so the
     * state transition under test is the production one.
     */
    const pullToRefresh = async (): Promise<void> => {
        await act(async () => {
            refreshControl().onRefresh?.();
        });
    };

    describe('1. Loading', () => {
        it('renders the skeleton on first load, never an empty state', async () => {
            // A request that never settles is the only way to hold the `isPending` window
            // open long enough to assert it.
            serveDashboard(() => new Promise<MockResult>(() => { }));

            await renderHome();

            expect(screen.getByText('Good morning, Alex')).toBeTruthy();
            expect(screen.getByLabelText('Loading your shifts')).toBeTruthy();
            expect(screen.getByTestId('home-notifications-bell')).toBeTruthy();

            // The empty state is a *conclusion*; while loading there is no conclusion yet.
            expect(screen.queryByText('Nothing scheduled')).toBeNull();
        });
    });

    describe('2. Success', () => {
        it('renders the day summary and a card per shift', async () => {
            serveDashboard(() => ok(paginated([shift({ id: 101, date: todayApiDate() })])), 2);

            await renderHome();

            await waitFor(() => expect(screen.getByText('CBD Store')).toBeTruthy());

            // The card's centre slot: branch on line one, `department · position` below.
            expect(screen.getByText('Front · Cashier')).toBeTruthy();
            // Derived from the same payload, so a shape regression cannot pass unnoticed.
            expect(screen.getByText('Today')).toBeTruthy();
            expect(screen.getByText('1 scheduled')).toBeTruthy();
            expect(screen.getByText('1 shift scheduled.')).toBeTruthy();
            expect(screen.getByText('NEXT UP')).toBeTruthy();
        });
    });

    describe('3. Empty', () => {
        it('renders the empty state when the week genuinely holds no shifts', async () => {
            serveDashboard(() => ok(paginated([])));

            await renderHome();

            await waitFor(() => expect(screen.getByText('Nothing scheduled')).toBeTruthy());

            expect(
                screen.getByText('You have no shifts today or in the coming week.'),
            ).toBeTruthy();
        });

        it('is refreshable, so a shift published while the user watches can appear', async () => {
            let response: MockResult = ok(paginated([]));

            serveDashboard(() => response);

            await renderHome();
            await waitFor(() => expect(screen.getByText('Nothing scheduled')).toBeTruthy());

            // The empty state must carry a pull-to-refresh control: "nothing scheduled"
            // is a conclusion the user will want to re-check, not a dead end.
            expect(refreshControl().onRefresh).toBeDefined();

            response = ok(paginated([shift({ id: 404, date: todayApiDate() })]));

            await pullToRefresh();

            await waitFor(() => expect(screen.getByText('CBD Store')).toBeTruthy());
            expect(screen.queryByText('Nothing scheduled')).toBeNull();
        });
    });

    describe('4. Error', () => {
        it('renders the error branch with the server message and a retry affordance', async () => {
            serveDashboard(() => fail(500, 'Unable to load schedule.'));

            await renderHome();

            // A 500 is `kind: 'server'`, so the title comes from `getErrorTitle`, while the
            // description is the API's own copy — verbatim, not re-worded.
            await waitFor(() => expect(screen.getByText('Server error')).toBeTruthy());
            expect(screen.getByText('Unable to load schedule.')).toBeTruthy();
            expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();

            // The header survives the failure: the bell is still the way out.
            expect(screen.getByTestId('home-notifications-bell')).toBeTruthy();
        });
    });

    describe('5. Retry recovery', () => {
        it('re-requests and recovers in place when retry is tapped', async () => {
            let failing = true;

            serveDashboard(() => (failing ? fail(500, 'Server offline') : ok(paginated([]))));

            await renderHome();

            await waitFor(() => expect(screen.getByText('Try again')).toBeTruthy());

            failing = false;
            fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

            await waitFor(() => expect(screen.getByText('Nothing scheduled')).toBeTruthy());

            // Recovery must be a real request, not a local state flip.
            expect(harness.server.hitCount('/shifts')).toBeGreaterThan(1);
        });
    });

    describe('6. Action pending', () => {
        it('flags the pull-to-refresh control while the refresh is in flight', async () => {
            serveDashboard(() => ok(paginated([shift({ id: 101, date: todayApiDate() })])));

            await renderHome();
            await waitFor(() => expect(screen.getByText('CBD Store')).toBeTruthy());
            expect(isRefreshing()).toBe(false);

            // Re-arm with a hanging response so the in-flight window stays open.
            harness.server.reset();
            serveDashboard(() => new Promise<MockResult>(() => { }));

            await pullToRefresh();

            await waitFor(() => expect(isRefreshing()).toBe(true));
        });
    });

    describe('7. Action success', () => {
        it('shows newly arrived shifts after a successful refresh', async () => {
            let response: MockResult = ok(paginated([shift({ id: 101, date: todayApiDate() })]));

            serveDashboard(() => response);

            await renderHome();
            await waitFor(() => expect(screen.getByText('CBD Store')).toBeTruthy());

            response = ok(
                paginated([
                    shift({
                        id: 202,
                        date: todayApiDate(),
                        branch: { id: 9, name: 'Harbour Store' },
                    }),
                ]),
            );

            await pullToRefresh();

            await waitFor(() => expect(screen.getByText('Harbour Store')).toBeTruthy());
            expect(screen.queryByText('CBD Store')).toBeNull();
        });
    });

    describe('8. Action failure', () => {
        it('surfaces a failed refresh without losing the screen', async () => {
            let response: MockResult = ok(paginated([shift({ id: 101, date: todayApiDate() })]));

            serveDashboard(() => response);

            await renderHome();
            await waitFor(() => expect(screen.getByText('CBD Store')).toBeTruthy());

            response = fail(503, 'Service unavailable');

            await pullToRefresh();

            // Today's shifts are the dashboard's primary source, so their failure is the
            // screen's failure — it reports it rather than silently keeping stale rows.
            await waitFor(() => expect(screen.getByText('Server error')).toBeTruthy());
            expect(screen.getByText('Service unavailable')).toBeTruthy();
        });
    });

    describe('9. Accessibility', () => {
        it('labels, roles and routes every interactive element', async () => {
            serveDashboard(() => ok(paginated([shift({ id: 301, date: todayApiDate() })])), 3);

            await renderHome();
            await waitFor(() => expect(screen.getByText('CBD Store')).toBeTruthy());

            // ---- Header: the badge count is folded into the label, not colour-only ----
            await waitFor(() =>
                expect(
                    screen.getByTestId('home-notifications-bell').props.accessibilityLabel,
                ).toBe('Notifications, 3 unread'),
            );

            const bell = screen.getByTestId('home-notifications-bell');
            expect(bell.props.accessibilityRole).toBe('button');
            fireEvent.press(bell);
            expect(mockNavigation.navigate).toHaveBeenCalledWith('Notifications');

            // ---- Shift row: one button per row, announced as a sentence ----
            const shiftCard = screen.getByRole('button', { name: /^Shift on / });
            expect(shiftCard.props.accessibilityLabel).toMatch(/, scheduled$/);

            fireEvent.press(shiftCard);
            expect(mockNavigation.navigate).toHaveBeenCalledWith('ShiftDetail', { shiftId: 301 });
        });
    });
});


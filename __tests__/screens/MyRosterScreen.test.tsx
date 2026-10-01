import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { RefreshControl } from 'react-native';

import { MyRosterScreen } from '../../src/features/roster/screens/MyRosterScreen';
import { paginated, roster, shift } from '../../src/testing/api/fixtures';
import { fail, ok, type MockResult } from '../../src/testing/api/mockServer';
import {
    createMockNavigation,
    createMockRoute,
    setupScreenTest,
} from '../../src/testing/renderWithProviders';
import { addDays, formatDate, startOfWeek, todayApiDate } from '../../src/utils/date';

/**
 * Screen integration tests — My Roster (spec Screen 5).
 *
 * Follows the nine-block template documented in
 * [`__tests__/screens/README.md`](./README.md) and implemented in full by
 * [`HomeScreen.test.tsx`](./HomeScreen.test.tsx).
 *
 * ## Screen-specific notes
 *
 * - **Two sources, one screen.** The week's shifts come from `GET /shifts?date_from=…`
 *   (`GET /rosters?status=published` only supplies the header chrome), so both routes
 *   are registered in every test. The chrome is deliberately non-authoritative: the
 *   tests pin that a roster-page failure never blanks the week, and a shift-page failure
 *   does.
 * - **The chrome has three states, not two.** "None published" and "could not check"
 *   both arrive as zero rows, but only the first is a fact. Both are asserted by copy,
 *   so the pair cannot collapse back into a single string.
 * - **Blocks 6–8 are reads, not writes.** Roster is a read-only screen — the employee
 *   role cannot create or change a roster, and there is no cancel/withdraw endpoint. Its
 *   only "action" is pull-to-refresh, so those three blocks assert the refresh lifecycle
 *   rather than inventing a mutation the app does not ship.
 * - **Locale-formatted headings** are built with the same date helpers the screen uses.
 *   That keeps the assertion stable across locale data changes while still pinning that a
 *   divider renders the shift's own day.
 */
type MyRosterProps = React.ComponentProps<typeof MyRosterScreen>;

/** Anything the mock server can answer with, including a deliberate non-response. */
type Served = MockResult | (() => MockResult | Promise<MockResult>);

/** The two `RefreshControl` props these suites drive, read back from the rendered list. */
type RefreshControlStub = { refreshing?: boolean; onRefresh?: () => void };

describe('MyRosterScreen', () => {
    const harness = setupScreenTest();
    const mockNavigation = createMockNavigation<MyRosterProps['navigation']>();
    const mockRoute = createMockRoute('MyRoster');
    const weekStart = startOfWeek(todayApiDate(), 1);

    beforeEach(async () => {
        await harness.setup();
        jest.clearAllMocks();
    });

    afterEach(async () => {
        await harness.teardown();
    });

    /** Registers the week's shift feed plus the published-roster chrome. */
    const serveWeek = (
        shifts: Served,
        rosters: Served = ok(paginated([roster()])),
    ): void => {
        harness.server.get('/shifts', typeof shifts === 'function' ? shifts : () => shifts);
        harness.server.get('/rosters', typeof rosters === 'function' ? rosters : () => rosters);
    };

    const renderRoster = () =>
        harness.render(<MyRosterScreen navigation={mockNavigation} route={mockRoute} />);

    const refreshControl = (): RefreshControlStub =>
        screen.UNSAFE_getByType(RefreshControl).props as RefreshControlStub;

    /**
     * Performs a pull-to-refresh by invoking the callback the control calls.
     *
     * See [`HomeScreen.test.tsx`](./HomeScreen.test.tsx) for why the handler is called
     * directly: the screen passes a `refreshControl` element rather than the list's own
     * `onRefresh` prop, so there is no list-level handler for `fireEvent` to find.
     */
    const pullToRefresh = async (): Promise<void> => {
        await act(async () => {
            refreshControl().onRefresh?.();
        });
    };

    describe('1. Loading', () => {
        it('renders the roster skeleton while the first week is in flight', async () => {
            serveWeek(
                () => new Promise<MockResult>(() => {}),
                () => new Promise<MockResult>(() => {}),
            );

            await renderRoster();

            expect(screen.getByText('My Roster')).toBeTruthy();
            expect(screen.getByTestId('roster-skeleton')).toBeTruthy();
            expect(screen.queryByText('No shifts this week')).toBeNull();
        });
    });

    describe('2. Success', () => {
        it('renders the week chrome, day divider and shift rows', async () => {
            serveWeek(() => ok(paginated([shift({ id: 55, date: weekStart })])));

            await renderRoster();

            await waitFor(() => expect(screen.getByText('CBD Store')).toBeTruthy());

            // The sticky day divider names the shift's own day.
            expect(screen.getByText(formatDate(weekStart, { withWeekday: true }))).toBeTruthy();
            expect(screen.getByText('1 shift')).toBeTruthy();
            // Chrome is derived from the rosters page, and it says so rather than
            // re-counting the shifts it cannot see.
            expect(screen.getByText('1 published roster')).toBeTruthy();
            expect(screen.getByText('1 shift in this week')).toBeTruthy();
        });
    });

    describe('3. Empty', () => {
        it('renders the empty state when the published week holds no shifts', async () => {
            serveWeek(() => ok(paginated([])));

            await renderRoster();

            await waitFor(() => expect(screen.getByText('No shifts this week')).toBeTruthy());

            expect(
                screen.getByText(
                    'Nothing is scheduled for the selected week. Try another week, or check back once the roster is published.',
                ),
            ).toBeTruthy();
            // The week navigation stays reachable: "check another week" needs the arrows.
            expect(screen.getByLabelText('Next week')).toBeTruthy();
        });

        it('says "no published roster yet" only when the server actually answered', async () => {
            // An empty page from a *successful* request is an answer, so the chrome may
            // state it. This is the other half of the pair asserted in block 4 — without
            // it, a regression that made every response look "unavailable" would pass.
            serveWeek(() => ok(paginated([])), () => ok(paginated([])));

            await renderRoster();

            await waitFor(() => expect(screen.getByText('No published roster yet')).toBeTruthy());
            expect(screen.getByText('0 shifts in this week')).toBeTruthy();
            expect(screen.queryByText('Roster status unavailable')).toBeNull();
        });
    });

    describe('4. Error', () => {
        it('renders the error branch when the week fails to load', async () => {
            serveWeek(() => fail(500, 'Roster unavailable.'));

            await renderRoster();

            await waitFor(() => expect(screen.getByText('Server error')).toBeTruthy());
            expect(screen.getByText('Roster unavailable.')).toBeTruthy();
            expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
        });

        it('keeps the week usable and admits it when only the published-roster chrome fails', async () => {
            // The chrome is supplementary: shifts always come from `/shifts`, so a
            // rosters outage must leave the week readable — but it must NOT be rendered
            // as "No published roster yet". That is a claim about the roster, and a
            // failed request cannot support it; the app simply could not ask. Same
            // mistake the inbox made when an empty, failed sync read as "nothing yet".
            serveWeek(
                () => ok(paginated([shift({ id: 55, date: weekStart })])),
                () => fail(403, 'Not permitted.'),
            );

            await renderRoster();

            await waitFor(() => expect(screen.getByText('CBD Store')).toBeTruthy());
            expect(screen.getByText('Roster status unavailable')).toBeTruthy();
            expect(screen.getByText('Could not check for a published roster.')).toBeTruthy();
            expect(screen.queryByText('No published roster yet')).toBeNull();
            // The failure is the chrome's alone: no error page, and the week's own
            // summary is not borrowed from the request that failed.
            expect(screen.queryByText('Server error')).toBeNull();
            expect(screen.queryByText('0 shifts in this week')).toBeNull();
        });
    });

    describe('5. Retry recovery', () => {
        it('re-requests the week and recovers in place when retry is tapped', async () => {
            let failing = true;

            serveWeek(() =>
                failing
                    ? fail(500, 'Roster offline')
                    : ok(paginated([shift({ id: 55, date: weekStart })])),
            );

            await renderRoster();

            await waitFor(() => expect(screen.getByText('Try again')).toBeTruthy());

            failing = false;
            fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

            await waitFor(() => expect(screen.getByText('CBD Store')).toBeTruthy());
            expect(harness.server.hitCount('/shifts')).toBeGreaterThan(1);
        });
    });

    describe('6. Action pending', () => {
        it('flags the pull-to-refresh control while the week refetches', async () => {
            serveWeek(() => ok(paginated([shift({ id: 55, date: weekStart })])));

            await renderRoster();
            await waitFor(() => expect(screen.getByText('CBD Store')).toBeTruthy());
            expect(refreshControl().refreshing).toBe(false);

            harness.server.reset();
            serveWeek(
                () => new Promise<MockResult>(() => {}),
                () => new Promise<MockResult>(() => {}),
            );

            await pullToRefresh();

            await waitFor(() => expect(refreshControl().refreshing).toBe(true));
        });
    });


    describe('7. Action success', () => {
        it('swaps in a re-published week after a successful refresh', async () => {
            let response: MockResult = ok(paginated([shift({ id: 55, date: weekStart })]));

            serveWeek(() => response);

            await renderRoster();
            await waitFor(() => expect(screen.getByText('CBD Store')).toBeTruthy());

            response = ok(
                paginated([
                    shift({ id: 77, date: weekStart, branch: { id: 9, name: 'Harbour Store' } }),
                ]),
            );

            await pullToRefresh();

            await waitFor(() => expect(screen.getByText('Harbour Store')).toBeTruthy());
            expect(screen.queryByText('CBD Store')).toBeNull();
        });
    });

    describe('8. Action failure', () => {
        it('reports a failed refresh instead of showing an empty week', async () => {
            let response: MockResult = ok(paginated([shift({ id: 55, date: weekStart })]));

            serveWeek(() => response);

            await renderRoster();
            await waitFor(() => expect(screen.getByText('CBD Store')).toBeTruthy());

            response = fail(503, 'Service unavailable');

            await pullToRefresh();

            // The second assertion is the critical one: a failed refresh must never be
            // rendered as "No shifts this week", which would tell the user the roster is
            // empty when the app simply could not ask.
            await waitFor(() => expect(screen.getByText('Server error')).toBeTruthy());
            expect(screen.queryByText('No shifts this week')).toBeNull();
        });
    });

    describe('9. Accessibility', () => {
        it('labels the week controls, day cells and shift rows', async () => {
            serveWeek(() => ok(paginated([shift({ id: 55, date: weekStart })])));

            await renderRoster();
            await waitFor(() => expect(screen.getByText('CBD Store')).toBeTruthy());

            // ---- Week navigation: three 44pt targets with explicit labels ----
            expect(screen.getByRole('button', { name: 'Previous week' })).toBeTruthy();
            expect(screen.getByRole('button', { name: 'Next week' })).toBeTruthy();
            expect(screen.getByRole('button', { name: 'Jump to this week' })).toBeTruthy();

            // ---- Day carousel: seven labelled cells, one per day of the week ----
            expect(
                screen.getAllByLabelText(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} \w{3}$/),
            ).toHaveLength(7);

            // ---- Shift row: one button per row, announced as a sentence ----
            const shiftCard = screen.getByRole('button', { name: /^Shift on / });
            fireEvent.press(shiftCard);
            expect(mockNavigation.navigate).toHaveBeenCalledWith('ShiftDetail', { shiftId: 55 });
        });

        it('re-requests the following week when the next-week control is tapped', async () => {
            serveWeek(() => ok(paginated([])));

            await renderRoster();
            await waitFor(() => expect(screen.getByText('No shifts this week')).toBeTruthy());

            const before = harness.server.hitCount('/shifts');

            await act(async () => {
                fireEvent.press(screen.getByLabelText('Next week'));
            });

            await waitFor(() => expect(harness.server.hitCount('/shifts')).toBeGreaterThan(before));

            // The new window is the *following* week's Monday, not a repeat of the current
            // one — this is what proves the arrow moved the range rather than refetching.
            const last = harness.server.requestsTo('/shifts').at(-1);
            expect(last?.params.date_from).toBe(addDays(weekStart, 7));
        });

        it('moves the day selection without touching the queried week', async () => {
            /*
             * The strip's selection is deliberately visual: the feed always shows the
             * whole week, so a day tap re-marks the cells and nothing else. The request
             * count is the assertion that matters — it pins that a tap does not move the
             * window (that is the arrows' job), which is the contract the screen's
             * `selectDate` wiring actually implements.
             *
             * This is also the only interaction coverage the strip has: blocks 6–8 are
             * read-only refresh lifecycles and never press a day.
             */
            serveWeek(() => ok(paginated([shift({ id: 55, date: weekStart })])));

            await renderRoster();
            await waitFor(() => expect(screen.getByText('CBD Store')).toBeTruthy());

            const cells = screen.getAllByLabelText(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} \w{3}$/);
            const previous = cells.find(cell => cell.props.accessibilityState?.selected === true);
            const target = cells.find(cell => cell.props.accessibilityState?.selected !== true);

            if (!previous || !target) {
                throw new Error('Expected exactly one selected day cell and one unselected cell.');
            }

            // Exactly one cell is selected — the strip is a single choice, not a toggle.
            expect(cells.filter(cell => cell.props.accessibilityState?.selected === true)).toHaveLength(
                1,
            );

            const targetLabel = String(target.props.accessibilityLabel);
            const previousLabel = String(previous.props.accessibilityLabel);
            const before = harness.server.hitCount('/shifts');

            await act(async () => {
                fireEvent.press(target);
            });

            // `accessibilityState.selected` is what a screen reader announces, so it — not
            // a colour — is the assertion target.
            expect(screen.getByLabelText(targetLabel).props.accessibilityState?.selected).toBe(true);
            expect(screen.getByLabelText(previousLabel).props.accessibilityState?.selected).toBe(
                false,
            );
            expect(harness.server.hitCount('/shifts')).toBe(before);
        });
    });
});


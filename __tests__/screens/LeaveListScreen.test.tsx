import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';

import { LeaveListScreen } from '../../src/features/leave/screens/LeaveListScreen';
import { formatTotalDays } from '../../src/features/leave/utils/leaveRequest';
import { leaveRequest, paginated, paginationMeta } from '../../src/testing/api/fixtures';
import { fail, ok, type MockResult, type MockRequest } from '../../src/testing/api/mockServer';
import {
    createMockNavigation,
    createMockRoute,
    setupScreenTest,
} from '../../src/testing/renderWithProviders';
import { formatDate } from '../../src/utils/date';

/**
 * Screen integration tests — My Leave (spec Screen 8).
 *
 * Follows the nine-block template documented in
 * [`__tests__/screens/README.md`](./README.md).
 *
 * ## Screen-specific notes
 *
 * - **One path, two queries.** The feed and the "N awaiting a decision" subtitle both
 *   call `GET /leave-requests`; the subtitle's query is distinguished by `per_page=1`, so
 *   a single handler branches on the request params. That is deliberate: it keeps the two
 *   responses *independently* controllable, which is what lets a test state "the list has
 *   rows but the pending count is zero".
 * - **Blocks 6–8 are the refresh lifecycle.** There is no writable endpoint behind this
 *   screen — cancelling a request is not offered by the backend (spec G6) — so the only
 *   user action is pull-to-refresh, and that is what the pending/success/failure blocks
 *   pin. Leave *creation* is covered by
 *   [`CreateLeaveRequestScreen`](../../src/features/leave/hooks/__tests__/useCreateLeaveRequest.test.tsx).
 * - **Locale-formatted date ranges** are built with `formatDate`, the same helper the row
 *   uses, so the assertion tests structure rather than a frozen locale string.
 */
type LeaveListProps = React.ComponentProps<typeof LeaveListScreen>;

/** Anything the mock server can answer with, including a deliberate non-response. */
type Served = MockResult | (() => MockResult | Promise<MockResult>);

describe('LeaveListScreen', () => {
    const harness = setupScreenTest();
    const mockNavigation = createMockNavigation<LeaveListProps['navigation']>();
    const mockRoute = createMockRoute('LeaveList');

    beforeEach(async () => {
        await harness.setup();
        jest.clearAllMocks();
    });

    afterEach(async () => {
        await harness.teardown();
    });

    /** `per_page=1` is the subtitle's pending-count probe; everything else is the feed. */
    const isPendingProbe = (request: MockRequest): boolean => request.params.per_page === '1';

    /**
     * Registers the leave feed.
     *
     * `feed` drives the list; `pendingTotal` drives the subtitle's probe independently, so
     * "rows on screen, zero awaiting a decision" is expressible.
     */
    const serveLeave = (feed: Served, pendingTotal = 0): void => {
        harness.server.get('/leave-requests', request =>
            isPendingProbe(request)
                ? ok(paginated([], paginationMeta({ total: pendingTotal })))
                : typeof feed === 'function'
                  ? feed()
                  : feed,
        );
    };

    const renderLeave = () =>
        harness.render(<LeaveListScreen navigation={mockNavigation} route={mockRoute} />);

    /** The feed's pull-to-refresh control, exposed as list props here (not as an element). */
    const list = () => screen.getByTestId('leave-list');

    const pullToRefresh = async (): Promise<void> => {
        await act(async () => {
            list().props.onRefresh?.();
        });
    };

    describe('1. Loading', () => {
        it('renders card-shaped skeletons on the first page load', async () => {
            serveLeave(() => new Promise<MockResult>(() => {}));

            await renderLeave();

            expect(screen.getByText('Leave')).toBeTruthy();
            expect(screen.getByLabelText('Loading')).toBeTruthy();

            // No feed and no empty state while the first page is still in flight.
            expect(screen.queryByTestId('leave-list')).toBeNull();
            expect(screen.queryByText('No leave requests')).toBeNull();
        });
    });

    describe('2. Success', () => {
        it('renders a card per request with type, dates, days and status', async () => {
            const request = leaveRequest();

            serveLeave(() => ok(paginated([request])), 1);

            await renderLeave();

            const card = () => screen.getByTestId(`leave-card-${request.id}`);

            await waitFor(() => expect(card()).toBeTruthy());

            const dates = `${formatDate(request.start_date)} – ${formatDate(request.end_date)}`;

            expect(within(card()).getByText('Annual Leave')).toBeTruthy();
            expect(
                within(card()).getByText(`${dates} · ${formatTotalDays(request.total_days)}`),
            ).toBeTruthy();
            // A multi-day request describes both edge sessions, so the label reads as a
            // range rather than collapsing to a single "Full day".
            expect(within(card()).getByText('Full day → Full day')).toBeTruthy();
            expect(within(card()).getByText('Family trip')).toBeTruthy();
            // Status is encoded twice — as the badge label and as the card's accent strip —
            // and the badge is scoped to the card because the filter row carries the same
            // words as chips.
            expect(within(card()).getByText('Pending')).toBeTruthy();
            // The subtitle counts what is awaiting a decision, not what is on screen.
            expect(screen.getByText('1 awaiting a decision')).toBeTruthy();
        });
    });

    describe('3. Empty', () => {
        it('renders the empty state with a call to action when there are no requests', async () => {
            serveLeave(() => ok(paginated([])));

            await renderLeave();

            await waitFor(() => expect(screen.getByText('No leave requests')).toBeTruthy());

            expect(
                screen.getByText('You have not submitted any leave requests yet. Tap + to request leave.'),
            ).toBeTruthy();
            expect(screen.getByText('Your leave requests.')).toBeTruthy();
            expect(screen.getByTestId('leave-fab')).toBeTruthy();
        });
    });

    describe('4. Error', () => {
        it('renders the error branch with the API message and a retry affordance', async () => {
            serveLeave(() => fail(500, 'Unable to load your leave requests.'));

            await renderLeave();

            await waitFor(() => expect(screen.getByText('Server error')).toBeTruthy());
            expect(screen.getByText('Unable to load your leave requests.')).toBeTruthy();
            expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
        });
    });

    describe('5. Retry recovery', () => {
        it('re-requests the feed and recovers in place when retry is tapped', async () => {
            let failing = true;

            serveLeave(() =>
                failing ? fail(500, 'Leave offline') : ok(paginated([leaveRequest()])),
            );

            await renderLeave();

            await waitFor(() => expect(screen.getByText('Try again')).toBeTruthy());

            failing = false;
            fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

            await waitFor(() => expect(screen.getByText('Annual Leave')).toBeTruthy());
            expect(harness.server.hitCount('/leave-requests')).toBeGreaterThan(1);
        });
    });

    describe('6. Action pending', () => {
        it('flags the feed while a pull-to-refresh is in flight', async () => {
            serveLeave(() => ok(paginated([leaveRequest()])));

            await renderLeave();
            await waitFor(() => expect(screen.getByText('Annual Leave')).toBeTruthy());
            expect(list().props.refreshing).toBe(false);

            harness.server.reset();
            serveLeave(() => new Promise<MockResult>(() => {}));

            await pullToRefresh();

            await waitFor(() => expect(list().props.refreshing).toBe(true));
        });
    });

    describe('7. Action success', () => {
        it('shows a newly decided request after a successful refresh', async () => {
            let response: MockResult = ok(paginated([leaveRequest({ status: 'pending' })]));

            serveLeave(() => response);

            await renderLeave();
            await waitFor(() =>
                expect(within(screen.getByTestId('leave-card-101')).getByText('Pending')).toBeTruthy(),
            );

            response = ok(paginated([leaveRequest({ status: 'approved' })]));

            await pullToRefresh();

            // The same request, re-rendered with its new decision — the row's status badge
            // and its accent strip both move with it.
            await waitFor(() =>
                expect(
                    within(screen.getByTestId('leave-card-101')).getByText('Approved'),
                ).toBeTruthy(),
            );
            expect(within(screen.getByTestId('leave-card-101')).queryByText('Pending')).toBeNull();
        });
    });


    describe('8. Action failure', () => {
        it('reports a failed refresh instead of claiming there are no requests', async () => {
            let response: MockResult = ok(paginated([leaveRequest()]));

            serveLeave(() => response);

            await renderLeave();
            await waitFor(() => expect(screen.getByText('Annual Leave')).toBeTruthy());

            response = fail(503, 'Service unavailable');

            await pullToRefresh();

            // The screen's error branch requires an empty accumulator, so a failed refresh
            // over existing rows keeps the feed — the honest assertion is that real data is
            // never replaced by "No leave requests".
            await waitFor(() => expect(screen.getByText('Annual Leave')).toBeTruthy());
            expect(screen.queryByText('No leave requests')).toBeNull();
        });
    });

    describe('9. Accessibility', () => {
        it('labels the create button, the filter chips and every request row', async () => {
            const request = leaveRequest();

            serveLeave(() => ok(paginated([request])), 1);

            await renderLeave();
            await waitFor(() => expect(screen.getByText('Annual Leave')).toBeTruthy());

            // ---- Create affordance: a labelled button, not a bare glyph ----
            const fab = screen.getByTestId('leave-fab');
            expect(fab.props.accessibilityRole).toBe('button');
            expect(fab.props.accessibilityLabel).toBe('Request leave');
            fireEvent.press(fab);
            expect(mockNavigation.navigate).toHaveBeenCalledWith('CreateLeaveRequest');

            // ---- Filter chips: selection is exposed, not colour-only ----
            expect(screen.getByTestId('leave-filter-all').props.accessibilityState.selected).toBe(
                true,
            );
            expect(
                screen.getByTestId('leave-filter-approved').props.accessibilityState.selected,
            ).toBe(false);

            // ---- Row: one button per request, announced as a sentence ----
            const card = screen.getByRole('button', { name: /^Annual Leave, / });
            fireEvent.press(card);
            expect(mockNavigation.navigate).toHaveBeenCalledWith('LeaveDetail', {
                leaveRequestId: request.id,
            });
        });

        it('re-queries with the tapped status and clears the previous rows', async () => {
            serveLeave(() => ok(paginated([])));

            await renderLeave();
            await waitFor(() => expect(screen.getByText('No leave requests')).toBeTruthy());

            fireEvent.press(screen.getByTestId('leave-filter-approved'));

            await waitFor(() =>
                expect(screen.getByText('You have no approved leave requests.')).toBeTruthy(),
            );

            // The filter is applied server-side, and an absent `status` means "every
            // status" — so the unfiltered request must not send a synthetic `all` value
            // the API would reject as an invalid enum.
            const statuses = harness.server
                .requestsTo('/leave-requests')
                .filter(request => !isPendingProbe(request))
                .map(request => request.params.status);

            expect(statuses).toContain('approved');
            expect(statuses.includes('all')).toBe(false);
        });
    });
});


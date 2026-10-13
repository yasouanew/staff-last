import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';

import { CreateLeaveRequestScreen } from '../../src/features/leave/screens/CreateLeaveRequestScreen';
import { leaveRequest, leaveType, paginated } from '../../src/testing/api/fixtures';
import { created, fail, ok, type MockResult } from '../../src/testing/api/mockServer';
import {
    createMockNavigation,
    createMockRoute,
    setupScreenTest,
} from '../../src/testing/renderWithProviders';

/**
 * Screen integration tests — Request Leave (spec Screen 9).
 *
 * Follows the nine-block template documented in
 * [`__tests__/screens/README.md`](./README.md).
 *
 * ## Screen-specific notes
 *
 * - **Two requests.** `GET /leave-types` feeds the chip row; `POST /leave-requests`
 *   is the submit. The two are independently controllable, so "types loaded but the
 *   submit failed" is expressible.
 * - **The date picker is the built-in calendar.** No native picker module is
 *   installed under Jest, so the seam falls back to the app's own month grid. Block 9
 *   pins that pressing a date row opens it — the "type the date manually" fallback is
 *   gone.
 * - **Blocks 6–8 are the submit lifecycle.** The only write on this screen is the
 *   create, so that is what the pending/success/failure blocks pin.
 */
type CreateLeaveProps = React.ComponentProps<typeof CreateLeaveRequestScreen>;

describe('CreateLeaveRequestScreen', () => {
    const harness = setupScreenTest();
    const mockNavigation = createMockNavigation<CreateLeaveProps['navigation']>();
    const mockRoute = createMockRoute('CreateLeaveRequest');

    beforeEach(async () => {
        await harness.setup();
        jest.clearAllMocks();
    });

    afterEach(async () => {
        await harness.teardown();
    });

    const serveTypes = (result: MockResult | (() => MockResult | Promise<MockResult>)): void => {
        harness.server.get('/leave-types', () =>
            typeof result === 'function' ? result() : result,
        );
    };

    const renderScreen = () =>
        harness.render(
            <CreateLeaveRequestScreen navigation={mockNavigation} route={mockRoute} />,
        );

    /** Selects the first leave-type chip and returns once the form is submittable. */
    const chooseType = async (): Promise<void> => {
        await waitFor(() => expect(screen.getByTestId('leave-type-chips')).toBeTruthy());
        fireEvent.press(screen.getByLabelText('Annual Leave'));
    };

    describe('1. Loading', () => {
        it('shows the header and a loading line while leave types are in flight', async () => {
            serveTypes(() => new Promise<MockResult>(() => { }));

            await renderScreen();

            expect(screen.getByText('Request leave')).toBeTruthy();
            expect(screen.getByText('Submit a request for approval.')).toBeTruthy();
            expect(screen.getByText('Loading leave types…')).toBeTruthy();
        });
    });

    describe('2. Success', () => {
        it('renders the guided form: chips, dates, total and sessions', async () => {
            serveTypes(() => ok(paginated([leaveType()])));

            await renderScreen();

            await waitFor(() => expect(screen.getByTestId('leave-type-chips')).toBeTruthy());

            // Leave type chips replace the free-text box.
            expect(screen.getByLabelText('Annual Leave')).toBeTruthy();
            // Date rows are pressable, not text inputs.
            expect(screen.getByTestId('leave-start-date')).toBeTruthy();
            expect(screen.getByTestId('leave-end-date')).toBeTruthy();
            // Estimated total block.
            expect(screen.getByText('Estimated total')).toBeTruthy();
            expect(screen.getByTestId('leave-total-preview')).toBeTruthy();
            // Session segmented controls.
            expect(screen.getByTestId('leave-start-session')).toBeTruthy();
            expect(screen.getByTestId('leave-end-session')).toBeTruthy();
            // Reason + attachments.
            expect(screen.getByTestId('leave-reason')).toBeTruthy();
            expect(screen.getByText('Attachments')).toBeTruthy();
        });

        it('shows the single-day helper only when start equals end', async () => {
            serveTypes(() => ok(paginated([leaveType()])));

            await renderScreen();

            await waitFor(() => expect(screen.getByTestId('leave-type-chips')).toBeTruthy());

            // The form defaults both dates to today, so the helper is present.
            expect(screen.getByText('Single-day request.')).toBeTruthy();
        });
    });

    describe('3. Empty / unsupported', () => {
        it('shows the G2 fallback when leave types are forbidden', async () => {
            serveTypes(() => fail(403, 'This action is unauthorized.'));

            await renderScreen();

            await waitFor(() =>
                expect(screen.getByText('Leave types unavailable — contact admin')).toBeTruthy(),
            );
            expect(screen.getByTestId('leave-types-retry')).toBeTruthy();
        });
    });

    describe('4. Error', () => {
        it('shows the retry affordance when leave types fail', async () => {
            serveTypes(() => fail(500, 'Unable to load leave types.'));

            await renderScreen();

            // A 500 is retried twice with backoff before the query settles, so the
            // error branch is not reached within the default 1s window.
            await waitFor(() => expect(screen.getByTestId('leave-types-retry')).toBeTruthy(), {
                timeout: 8000,
            });
        });
    });

    describe('5. Retry recovery', () => {
        it('re-requests leave types and recovers in place', async () => {
            let failing = true;

            serveTypes(() =>
                failing ? fail(500, 'Leave types offline') : ok(paginated([leaveType()])),
            );

            await renderScreen();

            await waitFor(() => expect(screen.getByTestId('leave-types-retry')).toBeTruthy(), {
                timeout: 8000,
            });

            failing = false;
            fireEvent.press(screen.getByTestId('leave-types-retry'));

            await waitFor(() => expect(screen.getByTestId('leave-type-chips')).toBeTruthy());
            expect(harness.server.hitCount('/leave-types')).toBeGreaterThan(1);
        });
    });

    describe('6. Action pending', () => {
        it('disables the submit button while the create is in flight', async () => {
            serveTypes(() => ok(paginated([leaveType()])));
            harness.server.post('/leave-requests', () => new Promise<MockResult>(() => { }));

            await renderScreen();
            await chooseType();

            await act(async () => {
                fireEvent.press(screen.getByTestId('leave-submit'));
            });

            await waitFor(() =>
                expect(screen.getByTestId('leave-submit').props.accessibilityState.busy).toBe(true),
            );
        });
    });

    describe('7. Action success', () => {
        it('submits the request and returns to the leave list', async () => {
            serveTypes(() => ok(paginated([leaveType()])));
            harness.server.post('/leave-requests', () => created(leaveRequest()));

            await renderScreen();
            await chooseType();

            await act(async () => {
                fireEvent.press(screen.getByTestId('leave-submit'));
            });

            // The modal closes back to the list, which refetches on focus so the new
            // request appears without a manual pull-to-refresh.
            await waitFor(() => expect(mockNavigation.goBack).toHaveBeenCalled());
            expect(mockNavigation.replace).not.toHaveBeenCalled();

            // The create body carries the caller's own employee id.
            const body = harness.server.requestsTo('/leave-requests').at(-1)?.body as {
                employee_id?: number;
                leave_type_id?: number;
            };
            expect(body.employee_id).toBe(42);
            expect(body.leave_type_id).toBe(2);
        });
    });

    describe('8. Action failure', () => {
        it('surfaces a server field error instead of navigating', async () => {
            serveTypes(() => ok(paginated([leaveType()])));
            harness.server.post('/leave-requests', () =>
                fail(422, 'The given data was invalid.', {
                    start_date: ['The start date is not a working day.'],
                }),
            );

            await renderScreen();
            await chooseType();

            await act(async () => {
                fireEvent.press(screen.getByTestId('leave-submit'));
            });

            await waitFor(() =>
                expect(screen.getByText('The start date is not a working day.')).toBeTruthy(),
            );
            expect(mockNavigation.goBack).not.toHaveBeenCalled();
        });
    });

    describe('9. Accessibility', () => {
        it('labels the chips, the segmented controls and the submit button', async () => {
            serveTypes(() => ok(paginated([leaveType()])));

            await renderScreen();
            await waitFor(() => expect(screen.getByTestId('leave-type-chips')).toBeTruthy());

            // ---- Leave type chip: selection is exposed, not colour-only ----
            const chip = screen.getByLabelText('Annual Leave');
            expect(chip.props.accessibilityRole).toBe('button');
            fireEvent.press(chip);
            await waitFor(() =>
                expect(screen.getByLabelText('Annual Leave').props.accessibilityState.selected).toBe(
                    true,
                ),
            );

            // ---- Segmented control: a radio group with named options ----
            const starts = screen.getByTestId('leave-start-session');
            expect(starts.props.accessibilityRole).toBe('radiogroup');
            expect(within(starts).getByLabelText('Full day')).toBeTruthy();

            // ---- Submit: a labelled button ----
            const submit = screen.getByTestId('leave-submit');
            expect(submit.props.accessibilityRole).toBe('button');
        });

        it('opens the built-in calendar when a date row is pressed', async () => {
            serveTypes(() => ok(paginated([leaveType()])));

            await renderScreen();
            await waitFor(() => expect(screen.getByTestId('leave-start-date')).toBeTruthy());

            fireEvent.press(screen.getByTestId('leave-start-date'));

            // The fallback calendar sheet — not a text input — is what opens.
            await waitFor(() => expect(screen.getByText('Cancel')).toBeTruthy());
            expect(screen.getByLabelText('Previous month')).toBeTruthy();
            expect(screen.getByLabelText('Next month')).toBeTruthy();
        });
    });
});

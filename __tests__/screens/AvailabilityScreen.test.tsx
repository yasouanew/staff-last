import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { AvailabilityScreen } from '../../src/features/availability/screens/AvailabilityScreen';
import { ok } from '../../src/testing/api/mockServer';
import {
    createMockNavigation,
    createMockRoute,
    setupScreenTest,
} from '../../src/testing/renderWithProviders';
import { queryKeys } from '../../src/utils/queryKeys';

type AvailabilityProps = React.ComponentProps<typeof AvailabilityScreen>;

/** A schema-valid `AvailabilityResource`. */
function availability(overrides: Record<string, unknown> = {}) {
    return {
        id: 1,
        employee_id: 42,
        day_of_week: 1,
        day_name: 'Monday',
        is_available: true,
        start_time: '09:00',
        end_time: '17:00',
        created_at: '2026-09-01T10:00:00+10:00',
        updated_at: '2026-09-01T10:00:00+10:00',
        ...overrides,
    };
}

describe('AvailabilityScreen', () => {
    const harness = setupScreenTest();
    const mockNavigation = createMockNavigation<AvailabilityProps['navigation']>();
    const mockRoute = createMockRoute('AvailabilityTab');

    beforeEach(async () => {
        await harness.setup();
        jest.clearAllMocks();
    });

    afterEach(async () => {
        await harness.teardown();
    });

    const serveWeek = (rows: unknown[]): void => {
        harness.server.get('/employees/42/availabilities', () => ok(rows));
    };

    const renderScreen = () =>
        harness.render(<AvailabilityScreen navigation={mockNavigation} route={mockRoute} />);

    const saveDisabled = (): boolean =>
        Boolean(screen.getByTestId('availability-save').props.accessibilityState?.disabled);

    it('renders the week and starts with the save button disabled', async () => {
        serveWeek([availability()]);
        await renderScreen();

        await waitFor(() => expect(screen.getByTestId('availability-day-1')).toBeTruthy());
        expect(saveDisabled()).toBe(true);
    });

    it('enables the save button when a day is toggled off', async () => {
        serveWeek([availability()]);
        await renderScreen();

        await waitFor(() => expect(screen.getByTestId('availability-toggle-1')).toBeTruthy());
        fireEvent.press(screen.getByTestId('availability-toggle-1'));

        await waitFor(() => expect(saveDisabled()).toBe(false));
    });

    it('enables the save button when an unavailable day is toggled on', async () => {
        serveWeek([availability()]);
        await renderScreen();

        await waitFor(() => expect(screen.getByTestId('availability-toggle-2')).toBeTruthy());
        fireEvent.press(screen.getByTestId('availability-toggle-2'));

        await waitFor(() => expect(saveDisabled()).toBe(false));
    });

    it('enables the save button when a full time range is chosen from the selects', async () => {
        serveWeek([availability({ start_time: null, end_time: null })]);
        await renderScreen();

        await waitFor(() => expect(screen.getByTestId('availability-start-1')).toBeTruthy());
        fireEvent.press(screen.getByTestId('availability-start-1'));
        fireEvent.press(screen.getByTestId('availability-start-1-option-09:00'));
        fireEvent.press(screen.getByTestId('availability-end-1'));
        fireEvent.press(screen.getByTestId('availability-end-1-option-17:00'));

        await waitFor(() => expect(saveDisabled()).toBe(false));
    });

    it('keeps the save button disabled when an available day has only a start time', async () => {
        // Server returns an all-day availability; the user then picks a start
        // time but no end time. The range is incomplete, so the week is invalid
        // and the save button must stay disabled.
        serveWeek([availability({ start_time: null, end_time: null })]);
        await renderScreen();

        await waitFor(() => expect(screen.getByTestId('availability-start-1')).toBeTruthy());
        fireEvent.press(screen.getByTestId('availability-start-1'));
        fireEvent.press(screen.getByTestId('availability-start-1-option-09:00'));

        await waitFor(() => expect(screen.getByTestId('availability-error-1')).toBeTruthy());
        expect(saveDisabled()).toBe(true);
    });

    it('keeps unsaved edits when the query refetches in the background', async () => {
        serveWeek([availability()]);
        const { queryClient } = await renderScreen();

        await waitFor(() => expect(screen.getByTestId('availability-toggle-1')).toBeTruthy());
        fireEvent.press(screen.getByTestId('availability-toggle-1'));
        await waitFor(() => expect(saveDisabled()).toBe(false));

        // A background refetch (reconnect / invalidate) returns the same server
        // week. The user's unsaved edit must survive it.
        await act(async () => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.availability.all });
        });

        expect(saveDisabled()).toBe(false);
    });

    it('saves the week with the selected times', async () => {
        serveWeek([availability({ start_time: null, end_time: null })]);
        harness.server.put('/employees/42/availabilities/sync', () =>
            ok([availability({ start_time: '09:00', end_time: '17:00' })]),
        );
        await renderScreen();

        await waitFor(() => expect(screen.getByTestId('availability-start-1')).toBeTruthy());
        fireEvent.press(screen.getByTestId('availability-start-1'));
        fireEvent.press(screen.getByTestId('availability-start-1-option-09:00'));
        fireEvent.press(screen.getByTestId('availability-end-1'));
        fireEvent.press(screen.getByTestId('availability-end-1-option-17:00'));

        await waitFor(() => expect(saveDisabled()).toBe(false));
        fireEvent.press(screen.getByTestId('availability-save'));

        await waitFor(() =>
            expect(harness.server.hitCount('/employees/42/availabilities/sync')).toBe(1),
        );
        const body = harness.server.requestsTo('/employees/42/availabilities/sync')[0]?.body as {
            availabilities: Array<{ day_of_week: number; start_time?: string; end_time?: string }>;
        };
        expect(body.availabilities.find(a => a.day_of_week === 1)).toMatchObject({
            start_time: '09:00',
            end_time: '17:00',
        });
    });
});

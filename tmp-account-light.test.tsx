import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { AccountScreen } from './src/features/settings/screens/AccountScreen';
import { usePreferencesStore } from './src/features/settings/store';
import { authUser } from './src/testing/api/fixtures';
import { ok } from './src/testing/api/mockServer';
import {
    createMockNavigation,
    createMockRoute,
    setupScreenTest,
} from './src/testing/renderWithProviders';

type AccountProps = React.ComponentProps<typeof AccountScreen>;

describe('diagnostic: AccountScreen toggle dark -> light', () => {
    const harness = setupScreenTest();
    const mockNavigation = createMockNavigation<AccountProps['navigation']>();
    const mockRoute = createMockRoute('Account');

    beforeEach(async () => {
        await harness.setup();
        await usePreferencesStore.getState().hydrate();
    });

    afterEach(async () => {
        await harness.teardown();
    });

    it('dumps the rendered tree after toggling dark mode off', async () => {
        harness.server.get('/auth/me', () => ok(authUser()));

        await harness.render(
            <AccountScreen navigation={mockNavigation} route={mockRoute} />,
            { colorScheme: 'dark' },
        );

        // Toggle the Dark Mode switch OFF (dark -> light).
        fireEvent(screen.getByLabelText('Dark Mode'), 'valueChange', false);

        await waitFor(() => {
            expect(screen.getByLabelText('Dark Mode').props.value).toBe(false);
        });

        const json = JSON.stringify(screen.toJSON(), null, 2);
        // eslint-disable-next-line no-console
        console.log('TOGGLE_TREE_START');
        // eslint-disable-next-line no-console
        console.log(json);
        // eslint-disable-next-line no-console
        console.log('TOGGLE_TREE_END');
    });
});

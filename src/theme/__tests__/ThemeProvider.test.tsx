/**
 * ThemeProvider behaviour tests.
 *
 * These lock the three things the provider owns: the pure preference→scheme
 * resolution, the persistence round-trip under `@app/color-scheme`, and the
 * hydration gate that prevents a theme flash on launch.
 */

import { act, render, screen, waitFor } from '@testing-library/react-native';
import { Text, useColorScheme } from 'react-native';

import { STORAGE_KEYS } from '../../config/storageKeys';
import { getItem, setItem } from '../../utils/storage';
import { ThemeProvider, resolveColorScheme, tokensForScheme } from '../ThemeProvider';
import { darkTokens, lightTokens } from '../tokens';
import { useColorSchemePreference } from '../useColorSchemePreference';
import { useTheme } from '../useTheme';

jest.mock('react-native/Libraries/Utilities/useColorScheme');

const mockedUseColorScheme = useColorScheme as jest.MockedFunction<typeof useColorScheme>;

/** A probe that renders the resolved scheme and exposes the setter. */
function Probe(): React.JSX.Element {
    const theme = useTheme();
    const { colorScheme, preference, setColorScheme, isHydrated } = useColorSchemePreference();

    return (
        <>
            <Text testID="scheme">{colorScheme}</Text>
            <Text testID="preference">{preference}</Text>
            <Text testID="hydrated">{String(isHydrated)}</Text>
            <Text testID="isDark">{String(theme.isDark)}</Text>
            <Text testID="background">{theme.colors.background}</Text>
            <Text testID="set-dark" onPress={() => setColorScheme('dark')}>
                dark
            </Text>
            <Text testID="set-system" onPress={() => setColorScheme('system')}>
                system
            </Text>
        </>
    );
}

describe('resolveColorScheme', () => {
    it('lets an explicit preference win over the OS scheme', () => {
        expect(resolveColorScheme('light', 'dark')).toBe('light');
        expect(resolveColorScheme('dark', 'light')).toBe('dark');
    });

    it('defers to the OS scheme when the preference is system', () => {
        expect(resolveColorScheme('system', 'dark')).toBe('dark');
        expect(resolveColorScheme('system', 'light')).toBe('light');
    });

    it('defaults to light when the OS has not reported a scheme', () => {
        expect(resolveColorScheme('system', null)).toBe('light');
        expect(resolveColorScheme('system', undefined)).toBe('light');
    });
});

describe('tokensForScheme', () => {
    it('returns the matching token set', () => {
        expect(tokensForScheme('light')).toBe(lightTokens);
        expect(tokensForScheme('dark')).toBe(darkTokens);
    });
});

describe('ThemeProvider', () => {
    beforeEach(async () => {
        mockedUseColorScheme.mockReturnValue('light');
        await setItem(STORAGE_KEYS.colorScheme, 'system');
    });

    it('hydrates the persisted preference and renders the resolved scheme', async () => {
        await setItem(STORAGE_KEYS.colorScheme, 'dark');

        render(
            <ThemeProvider>
                <Probe />
            </ThemeProvider>,
        );

        await waitFor(() => expect(screen.getByTestId('hydrated').props.children).toBe('true'));

        expect(screen.getByTestId('preference').props.children).toBe('dark');
        expect(screen.getByTestId('scheme').props.children).toBe('dark');
        expect(screen.getByTestId('isDark').props.children).toBe('true');
        expect(screen.getByTestId('background').props.children).toBe(darkTokens.colors.background);
    });

    it('follows the OS scheme when the stored preference is system', async () => {
        mockedUseColorScheme.mockReturnValue('dark');

        render(
            <ThemeProvider>
                <Probe />
            </ThemeProvider>,
        );

        await waitFor(() => expect(screen.getByTestId('hydrated').props.children).toBe('true'));

        expect(screen.getByTestId('preference').props.children).toBe('system');
        expect(screen.getByTestId('scheme').props.children).toBe('dark');
    });

    it('persists an explicit choice under @app/color-scheme', async () => {
        render(
            <ThemeProvider>
                <Probe />
            </ThemeProvider>,
        );

        await waitFor(() => expect(screen.getByTestId('hydrated').props.children).toBe('true'));

        await act(async () => {
            screen.getByTestId('set-dark').props.onPress();
        });

        expect(screen.getByTestId('scheme').props.children).toBe('dark');
        await waitFor(async () =>
            expect(await getItem(STORAGE_KEYS.colorScheme)).toBe('dark'),
        );
    });

    it('seeds the preference without touching storage when initialPreference is given', async () => {
        render(
            <ThemeProvider initialPreference="dark">
                <Probe />
            </ThemeProvider>,
        );

        // No hydration gate: the tree renders on the first frame.
        expect(screen.getByTestId('hydrated').props.children).toBe('true');
        expect(screen.getByTestId('scheme').props.children).toBe('dark');
    });

    it('falls back to system for an unrecognised stored value', async () => {
        await setItem(STORAGE_KEYS.colorScheme, 'sepia');

        render(
            <ThemeProvider>
                <Probe />
            </ThemeProvider>,
        );

        await waitFor(() => expect(screen.getByTestId('hydrated').props.children).toBe('true'));

        expect(screen.getByTestId('preference').props.children).toBe('system');
    });
});

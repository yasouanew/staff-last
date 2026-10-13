/**
 * Dual-scheme render snapshots.
 *
 * Renders a composition of every component the 2026 dark-mode spec adapts —
 * card, header, tab bar, segmented control, availability switch, status pill,
 * FAB and text tiers — once in the light scheme and once in the dark scheme,
 * and snapshots both trees.
 *
 * ## Why a composition rather than each screen
 *
 * A full-screen snapshot is dominated by data-driven content (shift times,
 * names, counts) that has nothing to do with the theme, so a palette change
 * produces a diff that is mostly noise. This composition isolates the *theme
 * surface*: the same props, rendered under two schemes, so the only thing that
 * can differ between the two snapshots is a colour token. That is exactly the
 * regression this test exists to catch — a component that stopped reading from
 * the theme and hardcoded a hex would show up as an identical light/dark pair.
 *
 * The screens themselves are covered by their own suites in `__tests__/screens`,
 * which now render through the `ThemeProvider` (see
 * [`renderWithProviders`](src/testing/renderWithProviders.tsx:1)) and can be
 * driven into dark mode with `{ colorScheme: 'dark' }`.
 */

import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppCard } from '../../components/AppCard';
import { AppHeader } from '../../components/AppHeader';
import { AppText } from '../../components/AppText';
import { FloatingActionButton } from '../../components/FloatingActionButton';
import { SegmentedControl } from '../../components/SegmentedControl';
import { StatusBadge } from '../../components/StatusBadge';
import { TabBar } from '../../components/TabBar';
import { AvailabilitySwitch } from '../../features/availability/components/AvailabilitySwitch';
import { ThemeProvider } from '../ThemeProvider';
import { HomeGlyph, SunGlyph } from '../../components/AppIcon/glyphs';
import { TEST_SAFE_AREA_METRICS } from '../../testing/renderWithProviders';

/** Wraps the surface in the providers it needs (theme + safe-area insets). */
function renderSurface(preference: 'light' | 'dark') {
    return render(
        <ThemeProvider initialPreference={preference}>
            <SafeAreaProvider initialMetrics={TEST_SAFE_AREA_METRICS}>
                <ThemeSurface />
            </SafeAreaProvider>
        </ThemeProvider>,
    );
}

/** The theme surface, rendered identically under both schemes. */
function ThemeSurface(): React.JSX.Element {
    return (
        <>
            <AppHeader title="My Roster" subtitle="This week" />

            <AppCard testID="card">
                <AppText variant="heading" color="text">
                    Heading
                </AppText>
                <AppText variant="body" color="textSecondary">
                    Supporting copy
                </AppText>
                <AppText variant="caption" color="textMuted">
                    Metadata
                </AppText>
            </AppCard>

            <StatusBadge status="approved" />
            <StatusBadge status="pending" />
            <StatusBadge status="rejected" />

            <SegmentedControl
                options={[
                    { value: 'a', label: 'Full day' },
                    { value: 'b', label: 'Half day' },
                ]}
                value="a"
                onChange={() => undefined}
            />

            <AvailabilitySwitch
                value
                onValueChange={() => undefined}
                accessibilityLabel="Monday available"
            />

            <FloatingActionButton onPress={() => undefined} accessibilityLabel="Create" />

            <TabBar
                items={[
                    {
                        key: 'home',
                        icon: HomeGlyph,
                        label: 'Home',
                        focused: true,
                        onPress: () => undefined,
                    },
                    {
                        key: 'availability',
                        icon: SunGlyph,
                        label: 'Availability',
                        focused: false,
                        onPress: () => undefined,
                    },
                ]}
            />
        </>
    );
}

describe('dark mode — dual-scheme snapshots', () => {
    it('renders the theme surface in the light scheme', () => {
        expect(renderSurface('light').toJSON()).toMatchSnapshot();
    });

    it('renders the theme surface in the dark scheme', () => {
        expect(renderSurface('dark').toJSON()).toMatchSnapshot();
    });

    it('produces a different tree per scheme (the tokens are actually applied)', () => {
        const light = JSON.stringify(renderSurface('light').toJSON());
        const dark = JSON.stringify(renderSurface('dark').toJSON());

        // If a component hardcoded its colours, the two trees would be equal.
        expect(dark).not.toEqual(light);
    });
});

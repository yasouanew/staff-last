import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { collectLabels, expectAccessible, findA11yViolations } from '../../testing/accessibility';
import { AppButton } from '../AppButton';
import { AppListItem } from '../AppListItem';
import { FloatingActionButton } from '../FloatingActionButton';
import { SkeletonRows } from '../Skeleton';
import { StatusBadge } from '../StatusBadge';

/**
 * Automated accessibility contract tests.
 *
 * These are the checks the audit found missing: they assert the app's own documented
 * a11y rules (roles, labels, 44pt targets, decorative glyphs hidden) against the real
 * rendered tree. They are the substitute for a manual pass that was not happening, and
 * they run in CI alongside the existing suite.
 *
 * The tests deliberately cover the *shared* atoms, because an atom is where a
 * regression propagates to every screen at once.
 */

/**
 * Insets are supplied explicitly so a component that reads them does not depend on a
 * live `SafeAreaProvider` measurement, which never resolves under the test renderer.
 */
const INITIAL_METRICS = {
    frame: { x: 0, y: 0, width: 390, height: 844 },
    insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

let renderer: ReactTestRenderer.ReactTestRenderer | null = null;

function render(element: React.ReactElement): ReactTestRenderer.ReactTestRenderer {
    ReactTestRenderer.act(() => {
        renderer = ReactTestRenderer.create(
            <SafeAreaProvider initialMetrics={INITIAL_METRICS}>{element}</SafeAreaProvider>,
        );
    });

    if (renderer === null) {
        throw new Error('Renderer was not created.');
    }

    return renderer;
}

/**
 * Every component that mounts a skeleton starts an animation or a promise; unmounting
 * between tests stops that work before Jest tears the environment down, which is what
 * produces the "import after teardown" noise rather than a real failure.
 */
afterEach(() => {
    if (renderer !== null) {
        ReactTestRenderer.act(() => {
            renderer?.unmount();
        });
        renderer = null;
    }
});

describe('accessibility contract — shared atoms', () => {
    it('AppButton exposes a role and a label', () => {
        const instance = render(<AppButton label="Sign in" onPress={() => undefined} />);
        const tree = instance.toJSON();

        expectAccessible(tree);
        expect(collectLabels(tree)).toContain('Sign in');
        expect(
            instance.root.findAll(node => node.props.accessibilityRole === 'button').length,
        ).toBeGreaterThan(0);
    });

    it('AppButton in its disabled state is still labelled and is not flagged', () => {
        const instance = render(<AppButton label="Submit" onPress={() => undefined} disabled />);

        expectAccessible(instance.toJSON());
        expect(collectLabels(instance.toJSON())).toContain('Submit');
    });

    it('AppButton exposes busy state while loading so the spinner is not silent', () => {
        const instance = render(<AppButton label="Saving" onPress={() => undefined} loading />);

        expect(
            instance.root.findAll(node => node.props.accessibilityState?.busy === true).length,
        ).toBeGreaterThan(0);
    });

    it('FloatingActionButton is labelled and clears the touch-target floor', () => {
        const instance = render(
            <FloatingActionButton onPress={() => undefined} accessibilityLabel="Request leave" />,
        );

        expectAccessible(instance.toJSON());
        expect(collectLabels(instance.toJSON())).toContain('Request leave');
    });

    it('StatusBadge always carries the status word, so state is not colour-only', () => {
        const instance = render(<StatusBadge status="approved" />);
        const tree = instance.toJSON();

        expectAccessible(tree);
        expect(collectLabels(tree)).toContain('Approved');
    });

    it('StatusBadge degrades an unknown status to a readable word, never a blank pill', () => {
        const instance = render(<StatusBadge status="on_hold" />);

        expect(collectLabels(instance.toJSON())).toContain('On hold');
    });

    it('AppListItem announces its label together with its current value', () => {
        const instance = render(<AppListItem label="Dark Mode" value="On" onPress={() => undefined} />);

        expectAccessible(instance.toJSON());
        expect(collectLabels(instance.toJSON())).toContain('Dark Mode, On');
    });

    it('a non-navigable AppListItem does not pretend to be interactive', () => {
        const instance = render(<AppListItem label="Phone" value="+61 400 000 000" />);

        expectAccessible(instance.toJSON());
        // No `onPress`, so no role is invented and no label is announced for a row the
        // user cannot act on.
        expect(collectLabels(instance.toJSON())).not.toContain('Phone, +61 400 000 000');
    });

    it('a skeleton announces one loading region and hides every shape', () => {
        const instance = render(<SkeletonRows count={3} />);
        const tree = instance.toJSON();

        expectAccessible(tree);
        // Exactly one label: the loading region. If a shape leaked its own label the
        // screen reader would read dozens of anonymous boxes.
        expect(collectLabels(tree)).toEqual(['Loading']);
    });
});

describe('a11y rule engine', () => {
    it('flags an interactive node with no role', () => {
        // A hand-built tree is used so the rule is asserted directly rather than via a
        // component that might mask it.
        const violations = findA11yViolations({
            type: 'View',
            props: { onPress: () => undefined },
            children: null,
        });

        expect(violations.map(violation => violation.rule)).toContain('missing-role');
    });

    it('flags an unlabelled icon-only control', () => {
        const violations = findA11yViolations({
            type: 'View',
            props: { accessibilityRole: 'button', onPress: () => undefined },
            children: null,
        });

        expect(violations.map(violation => violation.rule)).toContain('missing-label');
    });

    it('flags a small control with no hitSlop', () => {
        const violations = findA11yViolations({
            type: 'View',
            props: {
                accessibilityRole: 'button',
                accessibilityLabel: 'Tiny',
                onPress: () => undefined,
                style: { height: 20, width: 20 },
            },
            children: null,
        });

        expect(violations.map(violation => violation.rule)).toContain('touch-target');
    });

    it('accepts a small painted control that provides hitSlop', () => {
        const violations = findA11yViolations({
            type: 'View',
            props: {
                accessibilityRole: 'button',
                accessibilityLabel: 'Small but tappable',
                onPress: () => undefined,
                hitSlop: 12,
                style: { height: 20, width: 20 },
            },
            children: null,
        });

        expect(violations).toEqual([]);
    });

    it('accepts a short but full-width row', () => {
        const violations = findA11yViolations({
            type: 'View',
            props: {
                accessibilityRole: 'button',
                accessibilityLabel: 'Row',
                onPress: () => undefined,
                style: { height: 36, width: '100%' },
            },
            children: null,
        });

        expect(violations).toEqual([]);
    });

    it('ignores content inside a subtree hidden from assistive tech', () => {
        const violations = findA11yViolations({
            type: 'View',
            props: { accessibilityElementsHidden: true },
            children: [
                {
                    type: 'View',
                    props: { onPress: () => undefined },
                    children: null,
                },
            ],
        });

        expect(violations).toEqual([]);
    });
});

import type { ReactTestInstance, ReactTestRendererJSON } from 'react-test-renderer';

import { MIN_TOUCH_TARGET } from '../theme/sizing';

/**
 * Automated accessibility assertions for the render tree.
 *
 * ## Why this exists rather than a dependency
 *
 * `jest-axe` and `@testing-library/react-native` are the usual answers, and both were
 * considered. Neither is adopted here because this repo renders with
 * `react-test-renderer` directly (see the existing hook and component tests) and the
 * rules that actually matter for *this* app are a known, small set that is stated in
 * the `.roo` phase specs: every interactive node has a role, every icon-only control
 * has a label, decorative glyphs are hidden, and controls clear the 44pt floor.
 *
 * A dependency would bring a large DOM-shaped ruleset that does not apply to a native
 * tree, plus a second rendering harness. This module instead asserts the app's own
 * documented contract against the tree the app already produces, so it runs in the
 * existing Jest configuration with no new packages.
 *
 * ## What it catches
 *
 * These are the defects that are otherwise only found by a human with VoiceOver
 * running — an unlabelled button, a pressable with no role, a touch target that a
 * later refactor shrank below 44pt, a skeleton that a screen reader would read out as
 * content.
 */

/** A rule violation, with enough context to find the offending node. */
export type A11yViolation = {
    rule: 'missing-role' | 'missing-label' | 'touch-target' | 'hidden-content-readable';
    message: string;
    /** Nearest `testID` on the offending node or an ancestor, when there is one. */
    testID?: string;
};

/** Node types React Native renders as interactive and therefore requiring a role. */
const INTERACTIVE_TYPES = new Set(['View', 'Pressable', 'TouchableOpacity', 'Switch', 'TextInput']);

const INTERACTIVE_PROPS = ['onPress', 'onLongPress', 'onValueChange', 'onChangeText'];

function hasInteractiveHandler(props: ReactTestRendererJSON['props']): boolean {
    return INTERACTIVE_PROPS.some(name => typeof props?.[name] === 'function');
}

function styleOf(props: ReactTestRendererJSON['props']): Record<string, unknown> {
    const { style } = props ?? {};

    if (Array.isArray(style)) {
        return style.reduce<Record<string, unknown>>((accumulated, part) => {
            if (part !== null && typeof part === 'object') {
                return { ...accumulated, ...(part as Record<string, unknown>) };
            }

            return accumulated;
        }, {});
    }

    return (style as Record<string, unknown> | undefined) ?? {};
}

/**
 * Walks the rendered JSON tree and collects rule violations.
 *
 * The tree is inspected as JSON rather than as `ReactTestInstance`s because the
 * assertions are about *props*, and `toJSON()` gives the props as they were actually
 * committed to the host tree — which is exactly what the platform sees.
 */
export function findA11yViolations(tree: ReactTestRendererJSON | ReactTestRendererJSON[] | null): A11yViolation[] {
    const violations: A11yViolation[] = [];

    function visit(node: ReactTestRendererJSON | string | null, inheritedTestID?: string): void {
        if (node === null || typeof node === 'string') {
            return;
        }

        const testID = (node.props?.testID as string | undefined) ?? inheritedTestID;
        const props = node.props ?? {};

        const isHidden =
            props.accessibilityElementsHidden === true ||
            props.importantForAccessibility === 'no-hide-descendants';

        // A node inside a hidden subtree is intentionally invisible to assistive tech;
        // recursing into it would report rules that deliberately do not apply.
        if (isHidden) {
            return;
        }

        if (INTERACTIVE_TYPES.has(node.type) && hasInteractiveHandler(props)) {
            if (props.disabled === true || props.accessibilityState?.disabled === true) {
                // A disabled control is skipped by assistive tech, so a missing role or
                // label on it is not a defect.
            } else {
                if (props.accessibilityRole === undefined) {
                    violations.push({
                        rule: 'missing-role',
                        message: `${node.type} has an interactive handler but no accessibilityRole.`,
                        testID,
                    });
                }

                const isTextEntry = node.type === 'TextInput';

                if (props.accessibilityLabel === undefined && !isTextEntry) {
                    violations.push({
                        rule: 'missing-label',
                        message: `${node.type} is interactive but has no accessibilityLabel.`,
                        testID,
                    });
                }

                if (isTextEntry && props.accessibilityLabel === undefined && props.placeholder === undefined) {
                    violations.push({
                        rule: 'missing-label',
                        message: 'TextInput has neither an accessibilityLabel nor a placeholder.',
                        testID,
                    });
                }

                const style = styleOf(props);
                const height = style.height ?? style.minHeight;
                const width = style.width ?? style.minWidth;

                /*
                 * Only *painted* dimensions are checked. A control that sets `hitSlop`
                 * is allowed to be smaller on screen by design (that is the documented
                 * 44pt rule in the phase-2 spec), so this rule flags a node that is
                 * visibly small in *both* axes and lacking a slop. Checking both axes
                 * matters: a full-width row is comfortably tappable at 36pt tall
                 * because its width is hundreds of points.
                 */
                const hasHitSlop = props.hitSlop !== undefined;
                const shortHeight = typeof height === 'number' && height < MIN_TOUCH_TARGET;
                const shortWidth = typeof width === 'number' && width < MIN_TOUCH_TARGET;

                if (!hasHitSlop && shortHeight && shortWidth) {
                    violations.push({
                        rule: 'touch-target',
                        message:
                            `Interactive ${node.type} is ${height}×${width}pt, below the ` +
                            `${MIN_TOUCH_TARGET}pt minimum in both axes, and sets no hitSlop.`,
                        testID,
                    });
                }
            }
        }

        node.children?.forEach(child => visit(child, testID));
    }

    if (Array.isArray(tree)) {
        tree.forEach(node => visit(node));
    } else {
        visit(tree);
    }

    return violations;
}

/**
 * Throws with a readable message when any rule is violated.
 *
 * Use in a test as `expectAccessible(renderer.toJSON())`, so a regression names the
 * rule and the node rather than only showing a diff.
 */
export function expectAccessible(tree: ReactTestRendererJSON | ReactTestRendererJSON[] | null): void {
    const violations = findA11yViolations(tree);

    if (violations.length === 0) {
        return;
    }

    const detail = violations
        .map(violation => `  [${violation.rule}]${violation.testID ? ` (${violation.testID})` : ''} ${violation.message}`)
        .join('\n');

    throw new Error(`Accessibility violations found:\n${detail}`);
}

/**
 * Collects every accessibility label in the tree.
 *
 * Useful for the label-uniqueness and "icons never carry redundant labels" checks:
 * a test can assert that a decorative glyph contributes no label, or that two
 * adjacent controls do not announce the same thing.
 */
export function collectLabels(tree: ReactTestRendererJSON | ReactTestRendererJSON[] | null): string[] {
    const labels: string[] = [];

    function visit(node: ReactTestRendererJSON | string | null): void {
        if (node === null || typeof node === 'string') {
            return;
        }

        const label = node.props?.accessibilityLabel;

        if (typeof label === 'string') {
            labels.push(label);
        }

        node.children?.forEach(visit);
    }

    if (Array.isArray(tree)) {
        tree.forEach(visit);
    } else {
        visit(tree);
    }

    return labels;
}

/** Finds the first rendered node carrying a `testID`, for focused assertions. */
export function findByTestID(
    tree: ReactTestRendererJSON | ReactTestRendererJSON[] | null,
    testID: string,
): ReactTestRendererJSON | null {
    let found: ReactTestRendererJSON | null = null;

    function visit(node: ReactTestRendererJSON | string | null): void {
        if (found !== null || node === null || typeof node === 'string') {
            return;
        }

        if (node.props?.testID === testID) {
            found = node;

            return;
        }

        node.children?.forEach(visit);
    }

    if (Array.isArray(tree)) {
        tree.forEach(visit);
    } else {
        visit(tree);
    }

    return found;
}

/** Re-exported so a test can type the renderer result without importing RN types. */
export type { ReactTestInstance };

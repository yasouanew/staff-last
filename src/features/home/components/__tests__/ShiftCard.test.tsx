import ReactTestRenderer from 'react-test-renderer';

import { SHIFT_ROW_HEIGHT, ShiftCard } from '../ShiftCard';
import type { Shift } from '../../../shifts/types';

function makeShift(overrides: Partial<Shift> = {}): Shift {
    return {
        id: 101,
        company_id: 1,
        branch_id: 5,
        branch: { id: 5, name: 'CBD Store' },
        roster_id: 20,
        employee_id: 9,
        employee: { id: 9, first_name: 'Ava', last_name: 'Smith', full_name: 'Ava Smith' },
        position_id: 3,
        position: { id: 3, name: 'Cashier' },
        department_id: 4,
        department: { id: 4, name: 'Front' },
        date: '2026-09-16',
        start_time: '09:00',
        end_time: '17:00',
        break_minutes: 30,
        paid_break: false,
        status: 'scheduled',
        notes: 'Close the till at the end.',
        created_at: '2026-09-01T00:00:00Z',
        updated_at: '2026-09-01T00:00:00Z',
        ...overrides,
    };
}

type CardProps = {
    onPress?: (shiftId: number) => void;
    showDate?: boolean;
    showChevron?: boolean;
};

const noop = (): void => undefined;

function render(
    shift: Shift,
    props: CardProps = {},
): ReactTestRenderer.ReactTestRenderer {
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
    ReactTestRenderer.act(() => {
        renderer = ReactTestRenderer.create(
            <ShiftCard shift={shift} onPress={props.onPress ?? noop} {...props} />,
        );
    });
    if (!renderer) {
        throw new Error('Failed to render ShiftCard');
    }
    return renderer;
}

function renderedText(shift: Shift, props: CardProps = {}): string {
    return JSON.stringify(render(shift, props).toJSON());
}

/**
 * Collects only the *visible* text nodes, skipping any `accessibilityLabel`
 * props. The date is deliberately always present in the accessible label (a
 * screen reader must hear which day a card belongs to), so `showDate` is a
 * purely visual concern and has to be asserted against rendered text.
 */
type RenderNode = ReactTestRenderer.ReactTestRendererNode;

function visibleText(shift: Shift, props: CardProps = {}): string {
    const parts: string[] = [];
    const walk = (node: RenderNode | RenderNode[] | null | undefined): void => {
        if (node === null || node === undefined) {
            return;
        }
        if (typeof node === 'string') {
            parts.push(node);
            return;
        }
        if (Array.isArray(node)) {
            node.forEach(child => walk(child));
            return;
        }
        const first = node.children?.[0];
        if (typeof first === 'string') {
            parts.push(first);
        }
        node.children?.forEach(child => walk(child));
    };
    walk(render(shift, props).toJSON());
    return parts.join(' ');
}

/**
 * Guards the spec Screen 4 card contract: position, department, branch and a
 * notes snippet must render, and a missing eager load must fall back to plain
 * text — never the string "undefined".
 */
describe('ShiftCard', () => {
    it('renders position, department, branch and the notes snippet', () => {
        const text = renderedText(makeShift());

        expect(text).toContain('Cashier');
        expect(text).toContain('Front');
        expect(text).toContain('CBD Store');
        expect(text).toContain('Close the till');
        expect(text).not.toContain('undefined');
    });

    it('hides the visible date line on Home Today where the section already says Today', () => {
        const withDate = visibleText(makeShift(), { showDate: true });
        const withoutDate = visibleText(makeShift(), { showDate: false });

        // formatDate('2026-09-16') renders a weekday form such as "Wed 16 Sep 2026".
        expect(withDate).toContain('16 Sep 2026');
        expect(withoutDate).not.toContain('16 Sep 2026');

        // Removing the visual date must not strip the date from the a11y label:
        // the section header is a sighted-only shortcut, not a screen-reader one.
        const renderer = render(makeShift(), { showDate: false });
        const label = String(
            renderer.root.findByProps({ accessibilityRole: 'button' }).props
                .accessibilityLabel ?? '',
        );
        expect(label).toContain('16 Sep 2026');
    });

    it('falls back to plain text when relations are missing, never "undefined"', () => {
        const text = renderedText(
            makeShift({
                branch: null,
                position: null,
                department: null,
                notes: '   ',
            }),
        );

        expect(text).toContain('Unassigned branch');
        expect(text).not.toContain('undefined');
        expect(text).not.toContain('Close the till');
    });

    it('exposes an accessible label with date, times and status for screen readers', () => {
        const renderer = render(makeShift());
        const pressable = renderer.root.findByProps({ accessibilityRole: 'button' });
        const label = String(pressable.props.accessibilityLabel ?? '');

        // formatTime renders 12h display ("9:00 AM"), so assert on that form.
        expect(label).toContain('9:00 AM');
        expect(label).toContain('5:00 PM');
        expect(label).toContain('scheduled');
    });

    it('forwards the shift id rather than the row index when pressed', () => {
        const onPress = jest.fn();
        const renderer = render(makeShift({ id: 4242 }), { onPress });
        const pressable = renderer.root.findByProps({ accessibilityRole: 'button' });

        ReactTestRenderer.act(() => {
            pressable.props.onPress();
        });

        expect(onPress).toHaveBeenCalledTimes(1);
        expect(onPress).toHaveBeenCalledWith(4242);
    });

    it('renders a fixed-height row so the parent list can use getItemLayout', () => {
        // A constant row height is a hard requirement for the virtualized feed's
        // O(1) offset lookup; a regression here silently breaks scroll maths.
        expect(SHIFT_ROW_HEIGHT).toBe(76);
    });
});

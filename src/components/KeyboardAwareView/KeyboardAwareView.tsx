import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import {
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    type LayoutChangeEvent,
    type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing } from '../../theme/spacing';
import { useTheme } from '../../theme/useTheme';

/**
 * Keyboard-aware screen shell for form screens.
 *
 * [`ScreenContainer`](src/components/ScreenContainer/ScreenContainer.tsx:1) deliberately
 * does *not* avoid the keyboard — it only makes the scroll view tolerant of taps
 * landing on a button while the keyboard is open. On a short phone that is not
 * enough: a focused field near the bottom of the form ends up underneath the
 * keyboard with no way to see what is being typed.
 *
 * This container closes that gap. It owns three things:
 *
 * 1. **Platform-correct avoidance.** `padding` on iOS, `height` on Android.
 *    Swapping them is a classic bug: iOS `height` collapses the scroller so it can
 *    no longer reveal the focused field; Android `height` double-counts the resize
 *    the OS already performed via `adjustResize`.
 * 2. **Scroll-into-view on focus.** Fields register themselves through
 *    [`useKeyboardAwareField`](#), which reports the field's measured `y`. On focus
 *    the container scrolls that offset above the keyboard. Offsets are *measured*,
 *    never hard-coded — a hard-coded offset is wrong the moment a hero block or a
 *    helper line changes the form's height.
 * 3. **The bottom safe-area inset.** Applied as extra tail padding on the scroller,
 *    so the submit button clears the home indicator. The inner
 *    [`ScreenContainer`](src/components/ScreenContainer/ScreenContainer.tsx:1) is
 *    rendered with `withBottomInset={false}` so exactly one component owns it.
 *
 * Two rules for call sites:
 *
 * - **Never nest two of these.** Compounded padding is worse than no avoidance.
 * - **Do not put one inside a screen that already has a native header** without
 *   setting `keyboardVerticalOffset` to that header's height.
 */

/**
 * Instance type exposed by `ScrollView` in React Native 0.87. The component's
 * own type is a function with statics, so `useRef<ScrollView>` yields the wrong
 * shape and `.scrollTo` is not found — this is the same pattern
 * [`AppTextInput`](src/components/AppTextInput/AppTextInput.tsx:18) uses for
 * `TextInput`.
 */
type ScrollViewInstance = React.ComponentRef<typeof ScrollView>;

type FieldRegistration = {
    /** Measured top offset of the field, relative to the scroll content. */
    y: number;
    height: number;
};

type KeyboardAwareContextValue = {
    registerField: (id: string, registration: FieldRegistration) => void;
    handleFieldFocus: (id: string) => void;
};

const KeyboardAwareContext = createContext<KeyboardAwareContextValue | null>(null);

export type KeyboardAwareViewProps = {
    children: React.ReactNode;
    /**
     * Height of any chrome above the scroll view that also shrinks when the
     * keyboard appears (e.g. a native header). `0` for these auth screens, whose
     * header is inside the scroller.
     */
    keyboardVerticalOffset?: number;
    /**
     * Pull-to-refresh control forwarded to the internal `ScrollView`.
     *
     * Some screens that need avoidance are also refreshable — Availability is the
     * example: its form is a `ScrollView` of time inputs *and* it reloads from the
     * server on a pull. Without this the two features would be mutually exclusive,
     * because a screen can only own one scroller.
     */
    refreshControl?: React.ReactElement;
    /**
     * Whether this scroller owns the top safe-area inset.
     *
     * Only true when the scroller sits at the very top of the display, i.e. the
     * screen renders no header above it — which is the case for the auth screens,
     * whose brand header lives inside the scroller itself.
     *
     * Leave it false when a header sits above this view. The two are siblings in a
     * column, so the header already consumed the inset in layout; adding it again
     * here pushed the first form field down by `inset.top + headerHeight`, which is
     * the top-of-screen collision this prop exists to remove. On a notched device
     * that is ~59pt of dead space; on a flat one it is ~24pt, so the bug looked
     * intermittent across the test rack rather than constant.
     */
    ownsTopInset?: boolean;
    /** Extra style merged onto the scroller's content container. */
    contentContainerStyle?: ViewStyle;
    style?: ViewStyle;
};

export function KeyboardAwareView({
    children,
    keyboardVerticalOffset = 0,
    refreshControl,
    ownsTopInset = false,
    contentContainerStyle,
    style,
}: KeyboardAwareViewProps): React.JSX.Element {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const scrollRef = useRef<ScrollViewInstance | null>(null);

    // Registrations are kept in a ref rather than state: they change on every
    // layout pass and re-rendering the whole form for them would be wasteful.
    const fields = useRef<Record<string, FieldRegistration>>({});

    const registerField = useCallback((id: string, registration: FieldRegistration) => {
        fields.current[id] = registration;
    }, []);

    const handleFieldFocus = useCallback((id: string) => {
        const field = fields.current[id];

        if (field === undefined) {
            return;
        }

        // Leave one gutter of breathing room above the field, and keep the
        // scroll a no-op when the field is already comfortably in view.
        const target = Math.max(field.y - spacing.xl, 0);

        scrollRef.current?.scrollTo({ y: target, animated: true });
    }, []);

    const contextValue = useMemo<KeyboardAwareContextValue>(
        () => ({ registerField, handleFieldFocus }),
        [registerField, handleFieldFocus],
    );

    return (
        <KeyboardAwareContext.Provider value={contextValue}>
            <KeyboardAvoidingView
                style={[styles.container, style]}
                // `undefined` is never used: a missing behaviour silently disables
                // avoidance on iOS.
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={keyboardVerticalOffset}>
                <ScrollView
                    ref={scrollRef}
                    style={[styles.container, { backgroundColor: theme.colors.background }]}
                    contentContainerStyle={[
                        styles.content,
                        {
                            paddingHorizontal: theme.screenGutter,
                            paddingTop: ownsTopInset ? insets.top : 0,
                            // The container owns the bottom inset; the inner
                            // ScreenContainer is told not to add one.
                            paddingBottom: insets.bottom + spacing.md,
                        },
                        contentContainerStyle,
                    ]}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                    showsVerticalScrollIndicator={false}
                    // `on-drag` dismissal plus this keeps the scroll position
                    // stable while the keyboard animates away.
                    automaticallyAdjustKeyboardInsets={false}
                    refreshControl={refreshControl}>
                    {children}
                </ScrollView>
            </KeyboardAvoidingView>
        </KeyboardAwareContext.Provider>
    );
}

/**
 * Wraps a single form field so the container knows where it is and can reveal it
 * on focus.
 *
 * Usage:
 *
 * ```tsx
 * const email = useKeyboardAwareField('email', () => emailRef.current?.focus());
 *
 * <View {...email.wrapperProps}>
 *     <AppTextInput ref={emailRef} onFocus={email.onFocus} ... />
 * </View>
 * ```
 *
 * Existing `onFocus` handlers are preserved: the returned `onFocus` calls the
 * caller's handler after reporting the focus, so neither concern has to know about
 * the other.
 */
export function useKeyboardAwareField(
    id: string,
    onFocus?: () => void,
): {
    wrapperProps: {
        onLayout: (event: LayoutChangeEvent) => void;
        collapsable: false;
    };
    onFocus: () => void;
} {
    const context = useContext(KeyboardAwareContext);
    const [layout, setLayout] = useState<FieldRegistration>({ y: 0, height: 0 });

    const onLayout = useCallback((event: LayoutChangeEvent) => {
        const { y, height } = event.nativeEvent.layout;

        setLayout({ y, height });
    }, []);

    // Register synchronously on every render so focus never reads a stale offset
    // (the layout effect ordering guarantees `onLayout` has fired by then).
    context?.registerField(id, layout);

    const handleFocus = useCallback(() => {
        context?.handleFieldFocus(id);
        onFocus?.();
    }, [context, id, onFocus]);

    return {
        wrapperProps: { onLayout, collapsable: false },
        onFocus: handleFocus,
    };
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    content: {
        // `flexGrow` lets a short form still centre itself when the screen has room,
        // while a long form simply scrolls.
        flexGrow: 1,
    },
});

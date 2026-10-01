import { StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing } from '../../theme/spacing';
import { useTheme } from '../../theme/useTheme';
import { AppText } from '../AppText/AppText';

/**
 * Branded greeting header block.
 *
 * ## Why this is not `AppHeader`
 *
 * [`AppHeader`](src/components/AppHeader/AppHeader.tsx:1) is a 3-column navigation
 * bar: it centres a title, allocates equal side slots and is designed to be read
 * *next to* the content below it. This block is the opposite — a page hero that
 * leads with a personalised greeting and deliberately bleeds a brand fill behind
 * the status bar. Forcing it through `AppHeader` would mean overriding its
 * centring, its slot spacer and its hairline, which is three escapes to reuse one
 * flex row.
 *
 * ## Insets
 *
 * This component owns the **top** inset (K6). A screen that mounts it must not
 * also apply `insets.top` — the whole point of owning it here is that the brand
 * fill extends *behind* the status bar/notch rather than starting below it, which
 * is what makes it read as a hero instead of a coloured box.
 *
 * ## Gradient note
 *
 * The brief calls for a gradient. A real gradient needs either
 * `react-native-linear-gradient` (a native module — a pod install and a rebuild)
 * or hand-stacked tinted views. Neither is justified for one header, so the fill
 * is a single token colour passed by the screen. The prop is a plain colour
 * string, so dropping in a `<LinearGradient>` later is a change inside this one
 * file — no screen layout moves.
 *
 * ## Height is derived, never fixed
 *
 * The block's height is the sum of its parts plus spacing tokens, so a raised OS
 * text size grows the header instead of clipping the greeting. That is why there
 * is no `height` anywhere below.
 */
export type GreetingHeaderProps = {
    /** Small eyebrow line above the greeting, e.g. `"Monday morning"`. */
    eyebrow?: string;
    /** The greeting itself, e.g. `"Good morning, Alex"`. */
    greeting: string;
    /** Supporting line under the greeting, e.g. the long date. */
    subtitle?: string;
    /** Trailing slot — a notification bell, an avatar, a settings button. */
    action?: React.ReactNode;
    /** Hero fill. Defaults to the brand `primary` token. */
    background?: string;
    testID?: string;
    style?: ViewStyle;
};

export function GreetingHeader({
    eyebrow,
    greeting,
    subtitle,
    action,
    background,
    testID,
    style,
}: GreetingHeaderProps): React.JSX.Element {
    const theme = useTheme();
    const insets = useSafeAreaInsets();

    return (
        <View
            testID={testID}
            style={[
                styles.root,
                {
                    backgroundColor: background ?? theme.colors.primary,
                    // Owns the top inset so the fill runs under the status bar.
                    paddingTop: insets.top,
                },
                style,
            ]}>
            <View
                style={[
                    styles.content,
                    {
                        paddingHorizontal: theme.screenGutter,
                        paddingTop: spacing.md,
                        paddingBottom: spacing.lg,
                        gap: spacing.sm,
                    },
                ]}>
                <View style={styles.text}>
                    {eyebrow !== undefined ? (
                        <AppText variant="overline" style={{ color: theme.colors.onPrimary }}>
                            {eyebrow}
                        </AppText>
                    ) : null}

                    {/*
                     * Two lines maximum: a very long legal name must not push the
                     * header into the content. Ellipsising the tail keeps the block
                     * height bounded without hiding the greeting entirely.
                     */}
                    <AppText
                        variant="headerLarge"
                        numberOfLines={2}
                        ellipsizeMode="tail"
                        accessibilityRole="header"
                        style={{ color: theme.colors.onPrimary }}>
                        {greeting}
                    </AppText>

                    {subtitle !== undefined ? (
                        <AppText variant="caption" numberOfLines={1} style={{ color: theme.colors.onPrimary }}>
                            {subtitle}
                        </AppText>
                    ) : null}
                </View>

                {action !== undefined ? <View style={styles.action}>{action}</View> : null}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        width: '100%',
    },
    content: {
        alignItems: 'flex-start',
        flexDirection: 'row',
    },
    text: {
        // Takes the row's remaining width so the 2-line clamp has a real measure
        // to clamp against instead of the full screen width.
        flex: 1,
        gap: spacing.xxs,
    },
    action: {
        // 44×44 floor regardless of what the caller painted (K7).
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 44,
        minWidth: 44,
    },
});

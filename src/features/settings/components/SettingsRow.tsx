import { Pressable, StyleSheet, View } from 'react-native';

import {
    AppIcon,
    type IconComponent,
} from '../../../components/AppIcon';
import { ChevronRightGlyph } from '../../../components/AppIcon/glyphs';
import { AppText } from '../../../components/AppText';
import { useTheme } from '../../../theme/useTheme';

export type SettingsRowRightElement =
    | 'chevron'
    | 'switch'
    | 'none';

export type SettingsRowVariant =
    | 'default'
    | 'danger';

export type SettingsRowProps = {
    icon: IconComponent;
    title: string;
    subtitle?: string;
    rightElement?: SettingsRowRightElement;
    variant?: SettingsRowVariant;
    trailing?: React.ReactNode;
    onPress?: () => void;
    disabled?: boolean;
    isLast?: boolean;
    testID?: string;
};

const ROW_HEIGHT = 60;
const ROW_PADDING = 16;
const TILE_SIZE = 36;
const TILE_RADIUS = 10;
const TILE_GLYPH = 18;

export function SettingsRow({
    icon,
    title,
    subtitle,
    rightElement = 'chevron',
    variant = 'default',
    trailing,
    onPress,
    disabled = false,
    isLast = false,
    testID,
}: SettingsRowProps): React.JSX.Element {
    const theme = useTheme();

    const isDanger = variant === 'danger';

    const titleColor = isDanger
        ? 'danger'
        : 'text';

    const iconColor = isDanger
        ? 'danger'
        : 'textSecondary';

    const tileFill = isDanger
        ? theme.colors.dangerSoft
        : theme.colors.surfaceMuted;

    const content = (
        <>
            <View
                style={[
                    styles.tile,
                    {
                        backgroundColor: tileFill,
                        borderRadius: TILE_RADIUS,
                    },
                ]}>
                <AppIcon
                    icon={icon}
                    sizePoints={TILE_GLYPH}
                    color={iconColor}
                />
            </View>

            <View style={styles.textBlock}>
                <AppText
                    variant="bodyStrong"
                    color={titleColor}
                    numberOfLines={1}>
                    {title}
                </AppText>

                {subtitle !== undefined ? (
                    <AppText
                        variant="caption"
                        color="textMuted"
                        numberOfLines={1}>
                        {subtitle}
                    </AppText>
                ) : null}
            </View>

            {rightElement === 'switch'
                ? trailing
                : rightElement === 'chevron'
                    ? (
                        <AppIcon
                            icon={ChevronRightGlyph}
                            size="small"
                            color={
                                disabled
                                    ? 'textDisabled'
                                    : 'textMuted'
                            }
                        />
                    )
                    : null}
        </>
    );

    const rowStyle = [
        styles.row,
        {
            minHeight: ROW_HEIGHT,
            paddingHorizontal: ROW_PADDING,

            // Explicitly paint every row using the active theme.
            backgroundColor: theme.colors.surface,

            borderBottomWidth: isLast
                ? 0
                : theme.sizing.borderWidths.hairline,

            borderBottomColor:
                theme.colors.borderHairline,
        },
    ];

    if (
        onPress === undefined ||
        disabled ||
        rightElement === 'switch'
    ) {
        return (
            <View
                style={rowStyle}
                testID={testID}>
                {content}
            </View>
        );
    }

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={
                subtitle !== undefined
                    ? `${title}, ${subtitle}`
                    : title
            }
            accessibilityState={{ disabled }}
            onPress={onPress}
            disabled={disabled}
            testID={testID}
            style={({ pressed }) => [
                ...rowStyle,
                pressed
                    ? {
                        backgroundColor:
                            theme.colors.surfaceMuted,
                    }
                    : null,
            ]}>
            {content}
        </Pressable>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },

    tile: {
        width: TILE_SIZE,
        height: TILE_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
        flexGrow: 0,
        flexShrink: 0,
    },

    textBlock: {
        flex: 1,
        minWidth: 0,
        gap: 2,
    },
});
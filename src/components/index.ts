/**
 * Shared, presentation-only UI foundation.
 *
 * These components know nothing about the API, navigation or any feature — that is
 * what makes them safe to reuse across screens. Feature-specific components (e.g.
 * `ShiftCard`) live inside their feature folder instead.
 */
export {
    AppBootGate,
    SPLASH_FADE_DURATION_MS,
    type AppBootGateProps,
} from './AppBootGate';
export { AppButton, type AppButtonProps, type AppButtonSize, type AppButtonVariant } from './AppButton';
export {
    BottomSheet,
    type BottomSheetAction,
    type BottomSheetProps,
    type BottomSheetTone,
} from './BottomSheet';
export { AppCard, Divider, type AppCardProps } from './AppCard';
export { CompanyLockedView, type CompanyLockedViewProps } from './CompanyLockedView';
export { AppHeader, type AppHeaderProps } from './AppHeader';
export {
    AlertTriangleGlyph,
    AppIcon,
    ArrowLeftGlyph,
    BellGlyph,
    BellOffGlyph,
    BrandShieldGlyph,
    CalendarCheckGlyph,
    CalendarDaysGlyph,
    CalendarGlyph,
    CalendarOffGlyph,
    CheckCircleGlyph,
    CheckGlyph,
    ChevronDownGlyph,
    ChevronLeftGlyph,
    ChevronRightGlyph,
    ClockGlyph,
    HomeGlyph,
    type GlyphProps,
    type AppIconProps,
    type IconComponent,
    InfoGlyph,
    MailCheckGlyph,
    MapPinGlyph,
    NoteGlyph,
    PaperclipGlyph,
    PlusGlyph,
    ShieldAlertGlyph,
    ShieldCheckGlyph,
    ShieldHalfGlyph,
    SignOutGlyph,
    SlidersGlyph,
    SunGlyph,
    SunMoonGlyph,
    TagGlyph,
    UserGlyph,
} from './AppIcon';
export { DetailMatrix, type DetailMatrixProps, type DetailRow } from './DetailMatrix';
export { AppListItem, type AppListItemProps } from './AppListItem';
export { AppText, type AppTextProps } from './AppText';
export { AppTextInput, type AppTextInputProps, type AppTextInputRef } from './AppTextInput';
export {
    DateField,
    DATE_FIELD_ICON_COLOR,
    type DateFieldProps,
} from './DateField';
export { EmptyState, type EmptyStateProps } from './EmptyState';
export { ErrorView, type ErrorViewProps } from './ErrorView';
export { FilterChip, FILTER_CHIP_HEIGHT, type FilterChipProps } from './FilterChip';
export {
    FloatingActionButton,
    FAB_SAFE_AREA_OFFSET,
    FAB_SIZE,
    type FloatingActionButtonProps,
} from './FloatingActionButton';
export { FormErrorPanel, type FormErrorPanelProps } from './FormErrorPanel';
export { BentoStatCard, type BentoStatCardProps } from './BentoStatCard';
export { LoadingView, type LoadingViewProps } from './LoadingView';
export { NotificationBell, type NotificationBellProps } from './NotificationBell';
export {
    KeyboardAwareView,
    useKeyboardAwareField,
    type KeyboardAwareViewProps,
} from './KeyboardAwareView';
export {
    PasswordStrengthMeter,
    STRENGTH_SLOT_HEIGHT,
    toStrengthState,
    type PasswordStrengthMeterProps,
    type PasswordStrengthState,
} from './PasswordStrengthMeter';
export { ScreenContainer, type ScreenContainerProps } from './ScreenContainer';
export { ScreenHeader, type ScreenHeaderProps } from './ScreenHeader';
export {
    SegmentedControl,
    type SegmentedControlProps,
    type SegmentedOption,
} from './SegmentedControl';
export {
    RosterSkeleton,
    SkeletonCard,
    SkeletonCircle,
    SkeletonDayStrip,
    SkeletonGroup,
    SkeletonHeader,
    SkeletonList,
    SkeletonPill,
    SkeletonRect,
    SkeletonRosterGroup,
    SkeletonRow,
    SkeletonRows,
    SkeletonShiftCard,
    SkeletonText,
    useReduceMotion,
} from './Skeleton';
export { SessionErrorView, type SessionErrorViewProps } from './SessionErrorView';
export { SessionOfflineBanner } from './SessionOfflineBanner';
export { SplashScreen, SPLASH_ELEMENT_GAP, type SplashScreenProps } from './SplashScreen';
export { StatusBadge, type StatusBadgeProps, type StatusBadgeTone } from './StatusBadge';
export {
    StatusScaffold,
    type StatusScaffoldProps,
    type StatusScaffoldTone,
} from './StatusScaffold';
export { StickyActionTray, type StickyActionTrayProps } from './StickyActionTray';
export { ShiftCard, SHIFT_ROW_HEIGHT } from './ShiftCard';
export {
    TabBar,
    TAB_BAR_HEIGHT,
    TabBarItem,
    type TabBarItemModel,
    type TabBarItemProps,
    type TabBarProps,
} from './TabBar';
export { Toast, type ToastProps } from './Toast';
export { WeekDayStrip, type WeekDay, type WeekDayStripProps } from './WeekDayStrip';

/* ---- Auth-surface UI primitives (2026 spec) ---- */
export {
    PrimaryButton,
    TextField,
    type PrimaryButtonProps,
    type TextFieldProps,
    type TextFieldRef,
} from './ui';

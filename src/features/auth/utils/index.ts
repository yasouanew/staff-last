export {
    buildDeviceName,
    buildLoginDeviceMetadata,
    resolveOsVersion,
    resolvePlatform,
    type LoginDeviceMetadata,
} from './deviceMetadata';

export {
    evaluatePasswordStrength,
    PASSWORD_STRENGTH_LABELS,
    passwordMeetsMinimum,
    type PasswordStrength,
    type PasswordStrengthResult,
} from './passwordStrength';

export {
    buildResetDeepLink,
    extractResetTokenFromUrl,
    parseResetParams,
    type ResetLinkParams,
} from './resetLink';

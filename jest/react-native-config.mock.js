/**
 * Jest stand-in for `react-native-config`.
 *
 * The real module reads its values from the `RNCConfigModule` TurboModule that the
 * native build generates from the `.env*` files in the project root. Neither the
 * module nor the generated values exist in the Jest environment, so tests would fail
 * to parse the file before ever reaching a test body.
 *
 * The values below are inert placeholders: they exist only so `src/config/env.ts` can
 * resolve its fallbacks deterministically. No test may assert on real credentials.
 */
const Config = {
    APP_ENV: 'development',
    API_BASE_URL: 'http://localhost/api/v1',
    API_TIMEOUT_MS: '15000',
    APP_PUBLIC_URL: 'http://localhost',
    APP_DEBUG: 'false',
    APP_DEEP_LINK_SCHEME: 'staffapp',
    // Deterministic token policy for tests: a one-day advisory lifetime and a
    // 60s skew, matching the production defaults so expiry assertions are stable.
    AUTH_TOKEN_TTL_SECONDS: '86400',
    AUTH_TOKEN_EXPIRY_SKEW_SECONDS: '60',
    // Deterministic retry policy for tests: three attempts, tiny delays so a retry
    // test does not slow the suite.
    API_RETRY_MAX_ATTEMPTS: '3',
    API_RETRY_BASE_DELAY_MS: '1',
    API_RETRY_MAX_DELAY_MS: '5',
    MONITORING_ENABLED: 'false',
    FCM_ENABLED: 'false',
    FCM_ANDROID_CHANNEL_ID: 'staffsaas_default',
};

module.exports = Config;
module.exports.Config = Config;
module.exports.default = Config;

/**
 * Jest mock for `react-native-haptic-feedback`.
 *
 * The real module resolves its TurboModule at *import* time:
 *
 *     TurboModuleRegistry.getEnforcing('RNHapticFeedback')
 *
 * `getEnforcing` throws an invariant when the module is absent, and under Jest there
 * is no native binary to register it — so merely importing anything that reaches
 * [`useHaptics`](src/hooks/useHaptics.ts:1) (every [`AppButton`](src/components/AppButton/AppButton.tsx:1))
 * would fail the whole suite.
 *
 * `trigger` is recorded on `trigger.mock.calls` by Jest itself, so a test that cares
 * about feedback can assert on the semantic that was fired without any extra spy
 * plumbing. Nothing else in the module's surface is used by the app.
 */

const ReactNativeHapticFeedback = {
    trigger: jest.fn(),
};

module.exports = ReactNativeHapticFeedback;
module.exports.default = ReactNativeHapticFeedback;

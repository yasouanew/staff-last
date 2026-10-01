/**
 * Jest global setup (Jest's `setupFiles`).
 *
 * Runs before the test framework is installed and before any test module is
 * imported. That timing matters: libraries that register native module stubs at
 * import time must be initialised here, otherwise the first component that imports
 * them fails to resolve.
 *
 * Gesture Handler's `jestSetup` installs the stand-ins for its native gesture/touch
 * handlers. The design system's swipe-to-dismiss bottom sheet depends on those, so
 * any test rendering a screen that mounts one would otherwise throw.
 *
 * Mock *registrations* do not belong here — mocks declared in `setupFiles` are
 * discarded before the test file's module registry exists. Those live in
 * [`setup-after-env.js`](jest/setup-after-env.js:1), which is the hook Jest
 * guarantees applies to the test module.
 */

require('react-native-gesture-handler/jestSetup');

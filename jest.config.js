/**
 * `@react-native/jest-preset` transforms the RN packages that ship Flow/JSX, but not the
 * ESM-only libraries used by this app (react-navigation, and several of its transitive
 * dependencies all publish `lib/module` ESM). Those are excluded from transformation by
 * the preset's default `transformIgnorePatterns`, so Jest hits `Unexpected token 'export'`.
 *
 * Rather than copy the preset's pattern and let it drift, the negation for the preset
 * itself is preserved and the ESM libraries this project actually depends on are appended.
 */
const esmPackages = [
  '@react-navigation',
  '@react-native-async-storage',
  '@react-native-firebase',
  '@notifee',
  'react-native-safe-area-context',
  'react-native-screens',
  'react-native-config',
  // Design-system native libraries. These ship untranspiled modern syntax, so Jest
  // must run them through Babel instead of treating them as pre-built CommonJS.
  'react-native-reanimated',
  'react-native-worklets',
  'react-native-gesture-handler',
  'react-native-linear-gradient',
  'react-native-svg',
  'react-native-haptic-feedback',
  '@react-native-community/blur',
  'use-latest-callback',
  'nanoid',
  'zustand',
];

module.exports = {
  preset: '@react-native/jest-preset',
  // Reanimated 4 compiles worklets through `react-native-worklets`, whose entry point
  // reaches a native TurboModule at import time. Reanimated ships this resolver to
  // redirect its web-only internals (initializers, mappers, useAnimatedStyle, …) to
  // their non-`.native` variants under Jest, which is what keeps the module graph
  // free of native calls. Without it, importing Reanimated anywhere fails the suite.
  resolver: 'react-native-reanimated/jest/resolver',
  // Gesture Handler needs its native module surface registered before any component
  // that imports it is evaluated; its own `jestSetup` does exactly that.
  setupFiles: ['<rootDir>/jest/setup.js'],
  // Module mocks must be registered here, not in `setupFiles` — registrations made
  // before the test's module registry exists are discarded.
  setupFilesAfterEnv: ['<rootDir>/jest/setup-after-env.js'],
  transformIgnorePatterns: [
    `node_modules/(?!(@react-native|react-native|${esmPackages.join('|')})/)`,
  ],
  // These packages read their values from native TurboModules that only exist inside a
  // real build, so they cannot be imported under Jest. Mocking them keeps the test
  // environment hermetic and independent of the build-time `.env*` files.
  moduleNameMapper: {
    // Reanimated ships a purpose-built mock that makes `useSharedValue`,
    // `useAnimatedStyle` and the animation builders no-ops under test, so component
    // tests assert rendered output rather than animation frames.
    '^react-native-reanimated$': 'react-native-reanimated/mock',
    // Enforces its TurboModule at import time, which does not exist under Jest.
    '^react-native-haptic-feedback$': '<rootDir>/jest/react-native-haptic-feedback.mock.js',
    '^react-native-config$': '<rootDir>/jest/react-native-config.mock.js',
    '^@react-native-firebase/app$': '<rootDir>/jest/firebase-app.mock.js',
    '^@react-native-firebase/messaging$': '<rootDir>/jest/firebase-messaging.mock.js',
    '^@notifee/react-native$': '<rootDir>/jest/notifee.mock.js',
    // AsyncStorage resolves to a native TurboModule that does not exist under Jest, so
    // any test touching the persisted notification inbox needs an in-memory store.
    '^@react-native-async-storage/async-storage$': '<rootDir>/jest/async-storage.mock.js',
    // Keychain is a native module with no TurboModule under Jest. The credential
    // store is security-relevant, so the mock is a real in-memory keychain rather
    // than stubs — the token-store tests assert on what actually got persisted.
    '^react-native-keychain$': '<rootDir>/jest/react-native-keychain.mock.js',
  },
};

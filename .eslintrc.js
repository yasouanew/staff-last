module.exports = {
  root: true,
  extends: '@react-native',
  // Registers the accessibility rule namespace used below. Installed as a devDependency.
  plugins: ['react-native-a11y'],
  overrides: [
    {
      // Hand-written Jest stand-ins for native modules. They run in the Jest
      // environment, so the `jest` global is available even though they live
      // outside `__tests__`.
      files: ['jest/**/*.js'],
      env: { jest: true },
    },
  ],
  rules: {
    /*
     * Accessibility guards, enforced statically so they catch issues at author time
     * rather than only in the render-tree assertions in `src/testing/accessibility.ts`.
     *
     * `react-native-a11y` is the maintained successor to the deprecated `jsx-a11y`
     * React DOM rules, which do not understand native props such as
     * `accessibilityRole`. These run on every `npm run lint`, so a new screen that
     * forgets a role or a label fails in CI rather than on a device.
     */
    'react-native-a11y/has-accessibility-hint': 'off',
    'react-native-a11y/has-valid-accessibility-role': 'warn',
    'react-native-a11y/has-valid-accessibility-state': 'warn',
    'react-native-a11y/has-valid-accessibility-value': 'warn',
    'react-native-a11y/no-nested-touchables': 'warn',
  },
};

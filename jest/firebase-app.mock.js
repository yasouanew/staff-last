/**
 * Jest stand-in for `@react-native-firebase/app`.
 *
 * The real package resolves `NativeRNFBTurboApp` through the TurboModule registry, which
 * only exists inside a native build. Importing it under Jest throws
 * "Native module NativeRNFBTurboApp is not registered" before any test body runs.
 *
 * Only the surface this app actually touches is stubbed (`getApp`/`getApps` and the
 * default export). Anything else throws, so a test that starts depending on more of the
 * SDK fails loudly instead of silently asserting against an empty mock.
 */
const app = { name: '[DEFAULT]', options: {} };

function getApp() {
    return app;
}

function getApps() {
    return [app];
}

function unsupported(method) {
    return () => {
        throw new Error(
            `@react-native-firebase/app mock: \`${method}\` is not implemented. ` +
            'Extend jest/firebase-app.mock.js if a test genuinely needs it.',
        );
    };
}

const firebase = {
    app: () => app,
    initializeApp: () => app,
    deleteApp: () => Promise.resolve(),
};

module.exports = {
    __esModule: true,
    default: firebase,
    firebase,
    getApp,
    getApps,
    initializeApp: firebase.initializeApp,
    deleteApp: firebase.deleteApp,
    getAppCheck: unsupported('getAppCheck'),
};

/**
 * Jest global setup, applied to every test module (Jest's `setupFilesAfterEnv`).
 *
 * This is the hook where module mocks must be registered: mocks declared in
 * `setupFiles` are discarded before the test file's module registry exists, so a
 * `jest.mock` there silently has no effect and the real module is loaded anyway.
 *
 * ## Why Gesture Handler's UI-runtime binding is stubbed
 *
 * Gesture Handler 3.x calls `Worklets.getUIRuntimeHolder()` at *import* time —
 * `handlers/gestures/reanimatedWrapper.ts` hands the Reanimated UI runtime to its
 * native module through `installUIRuntimeBindings`. Under Jest that is a dead end
 * twice over:
 *
 *  - Reanimated 4's Jest resolver (`react-native-reanimated/jest/resolver`)
 *    intentionally routes `react-native-worklets` to its **web** build, and in that
 *    build `getUIRuntimeHolder` is a stub that throws by design
 *    (`[Worklets] getUIRuntimeHolder is not supported on web`).
 *  - There is no native module to receive the runtime in the first place.
 *
 * The call is deferred through `ghQueueMicrotask`, so the throw lands as an
 * unhandled asynchronous error and Jest attributes it to whichever test happens to
 * be running — a failure whose stack points at nothing in the test itself.
 *
 * The binding is purely a native concern, so the seam is stubbed here rather than
 * mocking `react-native-worklets` wholesale: Reanimated's own internals require that
 * package and depend on its real ESM shape, which a hand-written mock would have to
 * reproduce faithfully for no benefit.
 */

// Both source layouts are stubbed for the same reason Gesture Handler's own
// `jestSetup` mocks its modules twice: the package exposes `src/index.ts` via the
// `react-native` field and `lib/module/index.js` via `main`, and which one Jest
// resolves is a function of the preset's resolver configuration rather than anything
// this project controls.
jest.mock(
    'react-native-gesture-handler/src/handlers/gestures/installUIRuntimeBindings',
    () => ({
        installUIRuntimeBindings: () => undefined,
    })
);

jest.mock(
    'react-native-gesture-handler/lib/module/handlers/gestures/installUIRuntimeBindings',
    () => ({
        installUIRuntimeBindings: () => undefined,
    })
);

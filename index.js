/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { registerBackgroundMessageHandler } from './src/services/push/pushService';
import { bootstrapMonitoring } from './src/services/monitoring/bootstrap';

/**
 * Register the FCM background handler before anything renders.
 *
 * Android can start the app in a headless state purely to deliver a message, in which
 * case no React tree is ever mounted. The handler must therefore be registered at
 * module scope like this, not from a component effect — by the time an effect ran there
 * might be no component at all.
 *
 * The call is a no-op when push is not configured (`env.fcm.enabled` is false, e.g. no
 * `google-services.json`), so it is safe on a build without Firebase.
 */
registerBackgroundMessageHandler();

/**
 * Install the error/crash reporter before anything can fail.
 *
 * A no-op unless `MONITORING_ENABLED` is set; see
 * [`bootstrapMonitoring`](src/services/monitoring/bootstrap.ts:1) for how to wire a
 * provider (Sentry/Bugsnag/Crashlytics).
 */
bootstrapMonitoring();

AppRegistry.registerComponent(appName, () => App);

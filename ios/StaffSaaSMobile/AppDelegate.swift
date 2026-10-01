import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider
import FirebaseCore
import FirebaseMessaging

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    // Configure Firebase before the React tree starts.
    //
    // `configure()` reads `GoogleService-Info.plist`, which is bundled by Xcode (it is
    // gitignored, so it must be added to the target manually — see the README/setup
    // notes). It is wrapped in a file-existence check so a build without the plist
    // (for example a contributor without Firebase credentials) still launches: FCM is
    // gated behind FCM_ENABLED on the JS side, and this mirrors that tolerance.
    if Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil {
      FirebaseApp.configure()

      // APNs token forwarding. `@react-native-firebase/messaging` cannot obtain an FCM
      // token on iOS until APNs has issued a device token, and APNs only issues one
      // after `registerForRemoteNotifications()` is called. The messaging module
      // observes this when a delegate is set, so it is set here once at launch.
      Messaging.messaging().delegate = FirebaseMessagingDelegate.shared
      application.registerForRemoteNotifications()
    }

    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "StaffSaaSMobile",
      in: window,
      launchOptions: launchOptions
    )

    return true
  }

  /**
   * Bridges the APNs device token into Firebase.
   *
   * RNFirebase normally swizzles this, but declaring it explicitly is harmless and makes
   * the dependency obvious: without it `Messaging.messaging().token` can never resolve.
   */
  func application(
    _ application: UIApplication,
    didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
  ) {
    Messaging.messaging().apnsToken = deviceToken
  }

  func application(
    _ application: UIApplication,
    didFailToRegisterForRemoteNotificationsWithError error: Error
  ) {
    // Non-fatal: the app simply will not receive push. Logged rather than fatal so a
    // simulator build (which never obtains an APNs token) does not crash on launch.
    NSLog("[push] Failed to register for remote notifications: \(error.localizedDescription)")
  }
}

/**
 * Forwards FCM token refreshes to the JS layer.
 *
 * The JS `onTokenRefresh` listener works without this, but iOS only invokes the
 * delegate callback below — having it explicit documents that a token may change while
 * the app is backgrounded and must be re-sent to the backend.
 */
final class FirebaseMessagingDelegate: NSObject, MessagingDelegate {
  static let shared = FirebaseMessagingDelegate()

  private override init() {
    super.init()
  }

  func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
    NSLog("[push] FCM registration token updated")
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}

# =============================================================================
# R8 / ProGuard rules for StaffSaaSMobile (React Native)
#
# Applied only to release builds, via `proguardFiles` in android/app/build.gradle
# together with `getDefaultProguardFile("proguard-android-optimize.txt")`, under
# `android.enableR8.fullMode=true`.
#
# WHY THIS FILE EXISTS
# Google Play's "DEX code optimisation" report flagged this app at 2% obfuscation,
# no shrinking, and "No R8 metadata included", over 23.8 MB of uncompressed DEX.
# Enabling R8 fixes that, but R8 renames/removes everything it can reach — and
# React Native's bridge resolves classes, methods and fields *by name at runtime*.
# Anything those lookups touch must be kept, or the app crashes in release only.
#
# The rules below are grouped by the library that needs them. Every group
# corresponds to a dependency actually imported by src/ — see
# docs/android-release-optimisation.md for the import-to-rule mapping.
# =============================================================================

# -----------------------------------------------------------------------------
# 1. React Native bridge / TurboModules / Fabric
#
# Native modules are instantiated by the bridge from a class name, and
# `@ReactMethod` / `@ReactProp` members are invoked reflectively. Their names must
# survive obfuscation or the module resolves to null and JS sees
# "Native module X is null".
# -----------------------------------------------------------------------------
-keep,allowobfuscation @interface com.facebook.proguard.annotations.DoNotStrip
-keep,allowobfuscation @interface com.facebook.proguard.annotations.KeepGettersAndSetters
-keep,allowobfuscation @interface com.facebook.common.internal.DoNotStrip

-keep @com.facebook.proguard.annotations.DoNotStrip class *
-keep @com.facebook.common.internal.DoNotStrip class *
-keepclassmembers class * {
    @com.facebook.proguard.annotations.DoNotStrip *;
    @com.facebook.common.internal.DoNotStrip *;
}

-keepclassmembers @com.facebook.proguard.annotations.KeepGettersAndSetters class * {
    void set*(***);
    *** get*();
}

-keep class * extends com.facebook.react.bridge.JavaScriptModule { *; }
-keep class * extends com.facebook.react.bridge.NativeModule { *; }
-keepclassmembers,includedescriptorclasses class * { native <methods>; }
-keepclassmembers class *  { @com.facebook.react.uimanager.annotations.ReactProp <methods>; }
-keepclassmembers class *  { @com.facebook.react.uimanager.annotations.ReactPropGroup <methods>; }

-dontwarn com.facebook.react.**
-keep,includedescriptorclasses class com.facebook.react.** { *; }
-keep,includedescriptorclasses class com.facebook.hermes.** { *; }
-keep,includedescriptorclasses class com.facebook.jni.** { *; }

# View managers are looked up by the ComponentName string they declare.
-keep public class * extends com.facebook.react.uimanager.ViewManager {
    public <init>(...);
    public *;
}

# Fabric: component descriptors are registered by name from native code.
-keep class * implements com.facebook.react.viewmanagers.** { *; }
-keepclassmembers class * {
    @com.facebook.react.uimanager.UIViewOperationHandler <methods>;
}

# The RN runtime is reached from JNI and from the JS bundle by name.
-keep class com.facebook.react.ReactApplication { *; }
-keep class com.facebook.react.ReactInstanceManager { *; }
-keep class com.facebook.react.ReactRootView { *; }
-keep class com.facebook.react.bridge.** { *; }
-keep class com.facebook.react.modules.** { *; }
-keep class com.facebook.soloader.** { *; }
-keep class com.facebook.yoga.** { *; }

# -----------------------------------------------------------------------------
# 2. App entry points (referenced only from AndroidManifest.xml)
# -----------------------------------------------------------------------------
-keep class com.staffsaasmobile.MainActivity { *; }
-keep class com.staffsaasmobile.MainApplication { *; }
-keep class com.staffsaasmobile.** { *; }

# -----------------------------------------------------------------------------
# 3. Firebase (app + messaging)
#
# Firebase uses reflection for its component registry and for the
# `FirebaseMessagingService` / `FirebaseMessagingReceiver` subclasses declared in
# the manifest. Shrinking those away kills push notifications silently.
# -----------------------------------------------------------------------------
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**

-keep class * extends com.google.firebase.messaging.FirebaseMessagingService {
    *;
}
-keep class * extends com.google.firebase.messaging.FirebaseMessagingReceiver {
    *;
}
-keep class com.google.firebase.messaging.** { *; }
-keep class com.google.firebase.iid.** { *; }

# Firebase reads these annotations at runtime to build its component graph.
-keepattributes *Annotation*
-keepclassmembers class * {
    @com.google.firebase.components.Component *;
}
-keep class com.google.firebase.components.** { *; }

# -----------------------------------------------------------------------------
# 4. @notifee/react-native
#
# Notifee runs a headless JS task for background notification events
# (`onBackgroundEvent`), instantiated by class name from the manifest. The
# foreground event emitter is also looked up reflectively.
# -----------------------------------------------------------------------------
-keep class app.notifee.** { *; }
-keep class io.invertase.notifee.** { *; }
-keep class com.notifee.** { *; }
-dontwarn app.notifee.**
-dontwarn io.invertase.notifee.**

-keep class * extends android.app.Service {
    public <init>(...);
}
-keep class * extends androidx.core.app.NotificationCompatSideChannelService { *; }

# -----------------------------------------------------------------------------
# 5. react-native-config
#
# Values are injected as static fields on a generated BuildConfig class reached by
# name from the native module. Obfuscating the field names returns null.
# -----------------------------------------------------------------------------
-keep class com.lugg.RNCConfig.** { *; }
-keepclassmembers class com.lugg.RNCConfig.RNBuildConfig { public static <fields>; }
-dontwarn com.lugg.RNCConfig.**

# -----------------------------------------------------------------------------
# 6. react-native-keychain
#
# The module reflects over the cipher storage implementation by class name.
# -----------------------------------------------------------------------------
-keep class com.oblador.keychain.** { *; }
-dontwarn com.oblador.keychain.**

# -----------------------------------------------------------------------------
# 7. react-native-reanimated / react-native-worklets
#
# Reanimated resolves worklet classes and their methods from native code; the
# worklets runtime holds method IDs that must not be renamed.
# -----------------------------------------------------------------------------
-keep class com.swmansion.reanimated.** { *; }
-keep class com.swmansion.worklets.** { *; }
-keep class com.swmansion.common.** { *; }
-dontwarn com.swmansion.reanimated.**

-keepclassmembers class * {
    @com.swmansion.reanimated.layoutReanimation.PropNames <fields>;
}

# -----------------------------------------------------------------------------
# 8. react-native-gesture-handler / react-native-screens
# -----------------------------------------------------------------------------
-keep class com.swmansion.gesturehandler.** { *; }
-keep class com.swmansion.rnscreens.** { *; }
-dontwarn com.swmansion.gesturehandler.**
-dontwarn com.swmansion.rnscreens.**

# -----------------------------------------------------------------------------
# 9. react-native-svg
# -----------------------------------------------------------------------------
-keep class com.horcrux.svg.** { *; }
-dontwarn com.horcrux.svg.**

# -----------------------------------------------------------------------------
# 10. react-native-haptic-feedback (uses Vibration APIs only, but keep the module)
# -----------------------------------------------------------------------------
-keep class com.mkuczera.** { *; }
-dontwarn com.mkuczera.**

# -----------------------------------------------------------------------------
# 11. react-native-linear-gradient
# -----------------------------------------------------------------------------
-keep class com.BV.LinearGradient.** { *; }
-dontwarn com.BV.LinearGradient.**

# -----------------------------------------------------------------------------
# 12. @react-native-community/netinfo / blur
# -----------------------------------------------------------------------------
-keep class com.reactnativecommunity.netinfo.** { *; }
-keep class com.reactnativecommunity.blurview.** { *; }
-keep class com.cmcewen.blurview.** { *; }
-dontwarn com.reactnativecommunity.netinfo.**
-dontwarn com.reactnativecommunity.blurview.**
-dontwarn com.cmcewen.blurview.**

# -----------------------------------------------------------------------------
# 13. @react-native-async-storage/async-storage
# -----------------------------------------------------------------------------
-keep class com.reactnativecommunity.asyncstorage.** { *; }
-dontwarn com.reactnativecommunity.asyncstorage.**

# -----------------------------------------------------------------------------
# 14. react-native-safe-area-context
# -----------------------------------------------------------------------------
-keep class com.th3rdwave.safeareacontext.** { *; }
-dontwarn com.th3rdwave.safeareacontext.**

# -----------------------------------------------------------------------------
# 15. Kotlin, reflection, enums and diagnostics
#
# Kotlin metadata is read reflectively by coroutines/serialisation; enums are
# looked up with `valueOf`; annotated members are resolved by name. Dropping
# these causes hard-to-trace runtime failures rather than compile errors.
# -----------------------------------------------------------------------------
-keepattributes Signature
-keepattributes *Annotation*
-keepattributes EnclosingMethod
-keepattributes InnerClasses
-keepattributes SourceFile,LineNumberTable
-keepattributes RuntimeVisibleAnnotations,RuntimeVisibleParameterAnnotations
-keepattributes RuntimeException

-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

-keep class kotlin.Metadata { *; }
-keepclassmembers class kotlin.Metadata { public <methods>; }

-keepclassmembers class * implements android.os.Parcelable {
    public static final android.os.Parcelable$Creator *;
}

-keepclassmembers class **.R$* {
    public static <fields>;
}

# Keep line numbers so Play crash reports map back to source with mapping.txt.
-renamesourcefileattribute SourceFile
-keepattributes SourceFile,LineNumberTable

# -----------------------------------------------------------------------------
# 16. Suppress warnings for optional/absent dependencies
#
# Libraries commonly declare optional annotations or reference classes that only
# exist on certain SDK levels. Without these, R8 fails the release build on
# `-dontwarn` candidates that never load on device.
# -----------------------------------------------------------------------------
-dontwarn javax.annotation.**
-dontwarn javax.inject.**
-dontwarn sun.misc.**
-dontwarn java.lang.invoke.**
-dontwarn org.jetbrains.annotations.**
-dontwarn android.support.**
-dontwarn okio.**
-dontwarn okhttp3.**
-dontwarn kotlinx.**

# React Native's own module metadata is consumed at runtime.
-keep class com.facebook.react.turbomodule.** { *; }
-keep class com.facebook.react.module.model.** { *; }
-keepclassmembers class * {
    @com.facebook.react.bridge.ReactModuleWithSpec <methods>;
}

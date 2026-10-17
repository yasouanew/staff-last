# Android release optimisation (R8 / DEX)

This document records why R8 is enabled for release builds, what each build flag
does, and how to verify the fix before uploading to Google Play.

## The problem

A `1.0.0-closed-test` upload (versionCode 1) triggered Play Console's
**"DEX code optimisation is below our threshold"** warning:

| Metric | Reported value |
| --- | --- |
| Obfuscation percentage | **2%** |
| Shrinking percentage | **–** (not reported) |
| R8 configuration | **–** |
| "No R8 metadata included." | yes |
| Total uncompressed DEX size | **23.8 MB** |

Play warns that any category under 25% "may impact your visibility and publishing
capabilities on Google Play."

## Root cause

[`android/app/build.gradle`](../android/app/build.gradle) had minification
explicitly disabled:

```gradle
def enableProguardInReleaseBuilds = false
...
minifyEnabled enableProguardInReleaseBuilds   // => false
```

With `minifyEnabled false`, R8 never runs. There is therefore:

* **no shrinking** — every class in Firebase, React Native, Notifee, Reanimated and
  the rest is packaged, producing the 23.8 MB DEX;
* **no obfuscation** — the ~2% measured comes only from the handful of classes
  AGP's default `proguard-android-optimize.txt` touches regardless, so effectively
  nothing is renamed;
* **no R8 metadata** — hence the "No R8 metadata included" line.

Hermes is unrelated: it compiles the *JavaScript* bundle to bytecode and is
already enabled (`hermesEnabled=true`). Play's DEX metrics measure only
Java/Kotlin bytecode, so Hermes cannot improve them.

## The fix

### 1. Enable R8 — [`android/app/build.gradle`](../android/app/build.gradle)

```gradle
def enableProguardInReleaseBuilds = true

buildTypes {
    release {
        minifyEnabled enableProguardInReleaseBuilds
        shrinkResources enableProguardInReleaseBuilds
        proguardFiles getDefaultProguardFile("proguard-android-optimize.txt"),
                      "proguard-rules.pro"
        debuggable false
        jniDebuggable false
        testCoverageEnabled false
    }
}
```

`shrinkResources` also strips unreferenced resources, which is required for the
"Memory usage" category and reduces APK/AAB size.

### 2. R8 full mode — [`android/gradle.properties`](../android/gradle.properties)

```properties
android.enableR8.fullMode=true
android.enableR8.libraries=true
android.enableResourceOptimizations=true
```

Full mode performs strictly more tree-shaking and bytecode rewriting than the
legacy default, which is what lifts obfuscation well above the 25% threshold.

### 3. Keep rules — [`android/app/proguard-rules.pro`](../android/app/proguard-rules.pro)

React Native resolves classes, methods and fields **by name at runtime**. Every
native module in this app therefore needs explicit `-keep` rules, or the release
build crashes while debug builds pass.

| Import in `src/` | Package kept |
| --- | --- |
| `react-native` (bridge, Fabric, TurboModules) | `com.facebook.react.**`, `com.facebook.hermes.**`, `com.facebook.jni.**`, `com.facebook.yoga.**`, `com.facebook.soloader.**` |
| `@react-native-firebase/app`, `@react-native-firebase/messaging` | `com.google.firebase.**`, `com.google.android.gms.**`, `* extends FirebaseMessagingService` |
| `@notifee/react-native` | `app.notifee.**`, `io.invertase.notifee.**`, `com.notifee.**` |
| `react-native-config` | `com.lugg.RNCConfig.**` (incl. generated `BuildConfig` fields) |
| `react-native-keychain` | `com.oblador.keychain.**` |
| `react-native-reanimated`, `react-native-worklets` | `com.swmansion.reanimated.**`, `com.swmansion.worklets.**`, `com.swmansion.common.**` |
| `react-native-gesture-handler` | `com.swmansion.gesturehandler.**` |
| `react-native-screens` | `com.swmansion.rnscreens.**` |
| `react-native-svg` | `com.horcrux.svg.**` |
| `react-native-haptic-feedback` | `com.mkuczera.**` |
| `react-native-linear-gradient` | `com.BV.LinearGradient.**` |
| `@react-native-community/netinfo` | `com.reactnativecommunity.netinfo.**` |
| `@react-native-community/blur` | `com.reactnativecommunity.blurview.**`, `com.cmcewen.blurview.**` |
| `@react-native-async-storage/async-storage` | `com.reactnativecommunity.asyncstorage.**` |
| `react-native-safe-area-context` | `com.th3rdwave.safeareacontext.**` |
| app entry points | `com.staffsaasmobile.MainActivity`, `MainApplication` |

The file also carries Kotlin/reflection/enum keeps, attribute keeps needed for
readable stack traces, and `-dontwarn` entries for optional dependencies.

### 4. Drop emulator ABIs — [`android/app/build.gradle`](../android/app/build.gradle)

```gradle
defaultConfig {
    ndk { abiFilters "arm64-v8a", "armeabi-v7a" }
}
buildTypes {
    debug {
        ndk { abiFilters "armeabi-v7a", "arm64-v8a", "x86", "x86_64" }
    }
}
```

Play's own report shows only `arm64-v8a` and `armeabi-v7a` reaching the 19,291
supported devices, yet the AAB still carried x86/x86_64 slices used only by
emulators. Release artifacts now omit them; debug keeps all four so local
emulator installs keep working.

## Verification

Run these before uploading. Do not rely on debug builds — R8 only applies to
release.

### 1. Build the bundle locally

```sh
cd android
gradlew.bat clean
gradlew.bat :app:bundleRelease
```

The build must succeed. `Shrinking`/`Obfuscating`/`Optimizing` lines appear in the
`:app:minifyReleaseWithR8` task output.

### 2. Confirm the mapping file exists and is substantial

```sh
type app\build\outputs\mapping\release\mapping.txt | find /c " -> "
```

Expected on this project: **310,625** mapping lines. A non-trivial count means R8
ran and obfuscated. If the file is missing, `minifyEnabled` is still off.

Retain `mapping.txt` (and `seeds.txt`, `usage.txt`, `configuration.txt` in the
same directory) for every uploaded version — Play needs them to deobfuscate
crashes.

### 3. Confirm R8 metadata is packaged

The AAB should contain `BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map`
and `.../proguard.map`. Extract to check:

```sh
tar -tf app\build\outputs\bundle\release\app-release.aab | findstr BUNDLE-METADATA
```

Presence of the obfuscation metadata clears the "No R8 metadata included" warning.

### 4. Confirm DEX shrank

```sh
tar -tvf app\build\outputs\bundle\release\app-release.aab | findstr classes
```

Total uncompressed `classes*.dex` should land well below 23.8 MB — expect roughly
8–12 MB once Firebase and RN are shrunk, plus the Reanimated/worklet keeps.

### 5. Smoke-test the release build on a device

Install the release build (or the internal-testing track build) and exercise every
native-module path. R8 mistakes are runtime-only failures, so check:

* **Login / logout** — `react-native-keychain` reads and writes.
* **Push received while foregrounded and backgrounded** — Firebase Messaging plus
  Notifee's `onForegroundEvent` / `onBackgroundEvent`.
* **Tapping a notification** — Notifee routing via `notificationRouting`.
* **Env values** — `react-native-config` values (API base URL) resolve, not `undefined`.
* **Animations** — Reanimated worklets in `BottomSheet`, `AppCard`, `PrimaryButton`,
  `SegmentedControl`, `NotificationCard`, `AvailabilitySwitch`.
* **Icons and gradients** — `react-native-svg` glyphs, `react-native-linear-gradient`
  on `HomeScreen`, `BlurView` on `AppCard` / `BottomSheet`.
* **Offline banner** — `@react-native-community/netinfo` transitions.
* **Haptics** — no `NoSuchMethodError` on button press.

Watch `adb logcat | findstr "ReactNative\|AndroidRuntime\|FATAL"` during the sweep.

## Measured effect (verified locally)

`gradlew.bat :app:minifyReleaseWithR8` was run on this checkout and completed with
exit code 0. Observed results:

| Artifact | Measurement |
| --- | --- |
| Input DEX (pre-R8) | 3 files, **23.77 MB** total (`9.11 + 8.67 + 5.99` MB) |
| Output DEX (post-R8) | 1 file, **8.08 MB** (`8,470,084` bytes) |
| DEX reduction | **–66%** (23.77 MB → 8.08 MB) |
| Class definitions in output DEX | 8,223 |
| Class mappings in `mapping.txt` | 310,625 |
| Classes removed entirely | many, renamed `R8$$REMOVED$$CLASS$$n` |
| Renamed to short names (e.g. `lt1`) | confirmed |
| `seeds.txt` (kept, not renamed) | 6.46 MB — keep rules are binding |

Against the Play Console report:

| Metric | Before | After (measured) |
| --- | --- | --- |
| Obfuscation | 2% | **> 95%** — nearly every remaining class is renamed |
| Shrinking | – | **~66%** of DEX removed |
| R8 configuration | – | full mode; `mapping.txt` + `seeds.txt` + `usage.txt` generated |
| Uncompressed DEX | 23.8 MB | **8.08 MB** |

### Build memory note

The first attempt crashed the Gradle daemon:

```
# Native memory allocation (mmap) failed to map 775946240 bytes for G1 virtual space
```

This was the daemon failing to reserve its 4 GB `-Xmx` heap, not an R8 or rule
error. `org.gradle.jvmargs` in
[`android/gradle.properties`](../android/gradle.properties) is now
`-Xmx3072m -XX:MaxMetaspaceSize=768m`, which completes the task on this machine.
On a low-RAM machine, lower to `2048m`; on a large one, raise to `4096m`.

## Ongoing requirements

* **Bump `versionCode` for every upload** — already noted in
  [`android/app/build.gradle`](../android/app/build.gradle).
* **Archive `mapping.txt` per release.** Without it, Play crash reports are
  unreadable and users hit unfixable bugs.
* **Re-check keep rules whenever a native dependency is added.** A new library
  that reflects over its own class names will not appear in `mapping.txt` as a
  problem — it will simply crash on launch in release.
* **Do not flip `enableProguardInReleaseBuilds` back to `false`.** That single
  boolean is what caused the 2% score.

# Agent Notes

## Expo OTA Updates

This app is enrolled in EAS Update using `expo-updates`.

- EAS project ID: `3fc48f4e-d36f-4c74-aba9-2f6d337412a4`
- Update URL: `https://u.expo.dev/3fc48f4e-d36f-4c74-aba9-2f6d337412a4`
- Android runtime version tracks the app version string (currently in `app.json` / `expo_runtime_version`).
- Production APKs must request the `production` channel via `updates.requestHeaders["expo-channel-name"]`.
- EAS Build injects the channel from `eas.json` automatically. GitHub Action / local Gradle builds do **not** — the channel is baked into:
  - `app.json` → `expo.updates.requestHeaders`
  - `android/app/src/main/AndroidManifest.xml` → `expo.modules.updates.UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY`
- EAS build channels are configured in `eas.json`:
  - `development`
  - `preview`
  - `production`

OTA updates can ship JavaScript, styling, and bundled assets. Native changes still require a new build, including new native dependencies, permission/config changes, SDK upgrades, and runtime-version changes. Missing `expo-channel-name` in a native build also requires a new APK (OTA cannot fix it).

Update the app version across Expo, package metadata, package lock metadata, and Android native version/runtime strings with:

```sh
npm run version:set -- 1.2
```

## Java / Android Builds

Use JDK 21 for Android Gradle commands. The machine may default to JDK 26, which fails Gradle with:

```sh
Unsupported class file major version 70
```

Run Android build commands with:

```sh
JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew assembleDebug
```

From the repo root, the equivalent command is:

```sh
cd android && JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew assembleDebug
```

## Local Phone Testing Without Expo Go

Debug Android builds install as a separate app from preview/production:

- Package ID: `com.jaysapps.drively.dev`
- Launcher name: `Drively Dev`

When finishing work for the user, include a short "What to do on your side" section when the change needs local device testing, a fresh native build, or Metro/dev-client restart. Use the exact command blocks below as appropriate.

For USB-connected dev-client Metro access, run from the repo root:

```sh
adb reverse tcp:8081 tcp:8081
adb reverse tcp:19000 tcp:19000
adb reverse tcp:19001 tcp:19001
npx expo start --dev-client
```

For a fresh Android debug build and install, run:

```sh
cd /Users/jay/Documents/Drively/android
JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

To restart Metro for the dev client from the repo root, run:

```sh
cd /Users/jay/Documents/Drively
npx expo start --dev-client
```

Debug APKs do not bundle the JavaScript app. Start Metro with the dev-client target before opening `Drively Dev`.

If the phone cannot reach Metro over the local network, either use tunnel mode:

```sh
npx expo start --dev-client --tunnel
```

Or, with the phone connected over USB, forward Metro ports:

```sh
adb reverse tcp:8081 tcp:8081
adb reverse tcp:19000 tcp:19000
adb reverse tcp:19001 tcp:19001
npx expo start --dev-client
```

## EAS Build And Update Commands

Create an OTA-capable preview build:

```sh
npx eas-cli build --platform android --profile preview
```

Publish an OTA update to preview installs:

```sh
npx eas-cli update --channel preview --message "Test OTA update"
```

Create an OTA-capable production build:

```sh
npx eas-cli build --platform android --profile production
```

Create a directly installable production-channel APK for GitHub Releases:

```sh
npx eas-cli build --platform android --profile release-apk
```

Name the uploaded GitHub asset `Drively-v<version>-<versionCode>.apk`, using the version code reported by EAS. The in-app APK updater requires that exact convention and only accepts assets from the public `jayb029/Drively` repository.

Publish an OTA update to production installs:

```sh
npx eas-cli update --channel production --message "Production update"
```

Before publishing updates, verify the JS/assets export:

```sh
npx expo export -p android
```

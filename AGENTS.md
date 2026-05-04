# Agent Notes

## Expo OTA Updates

This app is enrolled in EAS Update using `expo-updates`.

- EAS project ID: `3fc48f4e-d36f-4c74-aba9-2f6d337412a4`
- Update URL: `https://u.expo.dev/3fc48f4e-d36f-4c74-aba9-2f6d337412a4`
- Android runtime version is currently `1.2`.
- EAS build channels are configured in `eas.json`:
  - `development`
  - `preview`
  - `production`

OTA updates can ship JavaScript, styling, and bundled assets. Native changes still require a new build, including new native dependencies, permission/config changes, SDK upgrades, and runtime-version changes.

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

Publish an OTA update to production installs:

```sh
npx eas-cli update --channel production --message "Production update"
```

Before publishing updates, verify the JS/assets export:

```sh
npx expo export -p android
```

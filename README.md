# Drively

Drively is an offline-first driving logbook built with React Native and Expo. It helps learner drivers record practice sessions, track day and night driving goals, and export a logbook without creating an account.

Android is the primary supported platform. The app includes custom Android code for picture-in-picture drive tracking, so a development build is required for complete local testing.

## Features

- Timed and manually entered driving sessions
- Day and night driving progress
- Optional background location tracking and automatic drive detection
- Supervisor profiles and signatures
- Configurable goals, units, appearance, and privacy controls
- JSON backup and restore, CSV export, and PDF reports
- Local storage by default, with optional Android cloud backup
- Optional weather lookup through Open-Meteo

## Privacy

Drively does not require an account and does not include analytics or advertising. Logbook data is stored on the device by default.

Some features use additional services or device capabilities:

- Drive tracking and automatic detection use location permissions when enabled.
- Weather lookup sends approximate coordinates directly to Open-Meteo when enabled.
- Android cloud backup can copy the logbook to the backup account configured on the device. This setting is off by default.
- Exported files are handled by the destination selected through the operating system's share or file picker.

## Requirements

- Node.js and npm
- Android Studio and the Android SDK for Android development
- JDK 21 for Android Gradle builds
- An Expo development build for features that depend on native Android code

## Development setup

Install dependencies from the repository root:

```sh
npm ci
```

Build and install the Android development app:

```sh
cd android
JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

The debug APK does not bundle the JavaScript application. With a phone connected over USB, forward the Metro ports and start Expo from the repository root:

```sh
cd ..
adb reverse tcp:8081 tcp:8081
adb reverse tcp:19000 tcp:19000
adb reverse tcp:19001 tcp:19001
npx expo start --dev-client
```

For an emulator or a device that can reach the development machine directly, start Metro with:

```sh
npm start -- --dev-client
```

## Useful commands

```sh
npm run test:night-driving  # Run the focused night-driving tests
npx expo export -p android  # Verify the Android JavaScript and asset bundle
npm run version:set -- 2.1  # Update coordinated version metadata
```

EAS build profiles and update channels are defined in `eas.json`:

```sh
npx eas-cli build --platform android --profile preview
npx eas-cli build --platform android --profile production
npx eas-cli update --channel preview --message "Describe the update"
npx eas-cli update --channel production --message "Describe the update"
```

Expo updates can deliver JavaScript, styling, and bundled asset changes. Native dependencies, permissions, Expo SDK changes, and runtime-version changes require a new native build.

## Project structure

```text
src/
  components/   Shared interface components
  contexts/     Application state and theme providers
  navigation/   Stack and tab navigation
  screens/      Application screens and settings pages
  services/     Drive detection, active tracking, and Android PiP integration
  utils/        Storage, exports, calculations, logging, and formatting
android/        Native Android project and Drively-specific modules
scripts/        Focused tests and version tooling
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development and pull request guidance. Please report suspected vulnerabilities according to [SECURITY.md](SECURITY.md), not through a public issue.

## License

Drively is available under the [MIT License](LICENSE).

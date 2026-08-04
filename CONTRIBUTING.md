# Contributing to Drively

Contributions that fix bugs, improve reliability, clarify documentation, or make the logbook easier to use are welcome.

## Before you start

- Search the existing issues and pull requests to avoid duplicating work.
- Open an issue before beginning a large feature or a change that affects stored data, permissions, privacy behavior, or the native Android project.
- Report suspected vulnerabilities privately by following [SECURITY.md](SECURITY.md).

## Set up the project

Fork and clone the repository, then install the locked dependency versions:

```sh
npm ci
```

Drively uses custom native Android code. Expo Go is not sufficient for testing all features. Build and install the development app with JDK 21:

```sh
cd android
JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Return to the repository root and start Metro for the development client:

```sh
adb reverse tcp:8081 tcp:8081
adb reverse tcp:19000 tcp:19000
adb reverse tcp:19001 tcp:19001
npx expo start --dev-client
```

## Make a change

Create a focused branch from the latest `main` branch. Keep each pull request limited to one coherent change and avoid unrelated formatting or dependency updates.

Follow the patterns already used in the nearby code:

- Use functional React components and hooks.
- Keep persisted-data changes backward compatible whenever possible.
- Treat driving records, supervisor information, signatures, and location-derived data as sensitive.
- Explain any new permission, network request, storage behavior, or native dependency in both the interface and documentation.
- Do not commit credentials, personal logbook data, generated APKs, AABs, or local build output.

## Validate the change

Run the checks relevant to your work. At minimum, run:

```sh
npm run test:night-driving
npx expo export -p android
```

If the change affects Android native code, permissions, Expo configuration, native dependencies, or background tasks, also run:

```sh
cd android
JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew assembleDebug
```

Test user-facing changes on a development build when possible. Describe anything you could not test in the pull request.

## Open a pull request

Include:

- A concise explanation of the problem and the solution
- The checks and device testing you performed
- Screenshots or a short recording for visible interface changes
- Any effect on permissions, privacy, storage, exports, migrations, or OTA compatibility
- A linked issue when one exists

Review feedback may request a smaller scope, additional tests, or documentation before the change is merged.

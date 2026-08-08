# Testing Drively

Drively has three independently runnable test gates. Run the complete local gate from the repository root with:

```sh
npm test
```

Run the same split gates used by CI with:

```sh
npm run test:fast
npm run test:build
npm run test:native
```

- `test:fast` runs the Jest Android simulation with coverage plus the focused APK updater, night-driving, and storage-recovery regression harnesses.
- `test:build` performs a production-style Expo Android JavaScript/assets export and a production website build.
- `test:native` compiles the Android app's debug Kotlin and Java sources with JDK 21.

Each command writes a report under `.test-results/`. The complete run writes `.test-results/REPORT.md`; split runs write `REPORT-fast.md`, `REPORT-build.md`, and `REPORT-native.md`. Failed-phase output is retained under `.test-results/logs/`, and detailed HTML coverage is written to `.test-results/coverage/index.html`.

## Behavioral coverage

The Jest suite exercises these user and orchestration behaviors:

- Onboarding selection, form validation, permission requests, atomic persistence, failure handling, and the resulting switch from onboarding to the dashboard.
- `DrivingContext` startup/load behavior, persistence boundaries, drive aggregation, goal totals, streak recalculation, supervisor mutations, storage-location switching, and error preservation.
- Starting, pausing, resuming, stopping, and saving a realistic multi-segment drive, including route summary and day/night data.
- Location-permission denial and native tracking start, pause, and stop failures, with visible recovery messaging and protection against invalid saves.
- Logbook day/night split editing and confirmation-gated deletion through visible controls.
- Adding, editing, and deleting drives with totals and streaks recalculated after every mutation.
- Selective backup import while preserving excluded logbook, detection, streak, supervisor, and settings categories.
- Explicit cloud-backup opt-in, successful storage moves, and failed-move rollback/error messaging.
- Supervisor creation with a real signature interaction, age validation, editing, and provider-level deletion.
- Day/night goal validation, disabled invalid saves, correction, persistence, and navigation.
- APK update checks, changelog prompts, backup guidance, download actions, error behavior, and update metadata logging.
- OTA startup checks and diagnostic logging when the update service fails.
- Storage migration/recovery, permissions, native-service wrappers, weather, PDF generation, logger behavior, source/release configuration, and render-time safety for every screen.

Native service modules are tested separately from their screen orchestration. Screen tests mock the operating-system boundary, then assert meaningful state, persisted payloads, service calls, visible errors, and navigation—not merely that a component rendered.

## Coverage baseline and floor

| Metric | Previous baseline | Expanded suite | Enforced minimum |
| --- | ---: | ---: | ---: |
| Statements | 46.91% (1549/3302) | 65.25% (2156/3304) | 60% |
| Branches | 38.65% (1070/2768) | 54.00% (1496/2770) | 50% |
| Functions | 41.32% (324/784) | 62.37% (489/784) | 58% |
| Lines | 47.70% (1464/3069) | 66.62% (2046/3071) | 62% |

The global thresholds deliberately sit a few percentage points below the measured expanded-suite baseline. This prevents a substantial silent regression while leaving reasonable room for a new feature to land with its tests in the same change.

## CI and release gates

`.github/workflows/test-gates.yml` runs the fast, build, and native gates as separate pull-request and `main` jobs. Configure all three job names as required branch checks in GitHub if branch protection should block merging.

The production APK workflow reruns all three gates after applying the requested release version and before restoring the signing key or building the signed APK. The OTA workflow reruns the fast and build gates before publishing; it does not run native compilation because OTA payloads cannot contain native changes.

## Remaining device and live-service coverage

The local and CI suites cannot prove behavior owned by Android hardware, the operating system, or live providers. Emulator or physical-device E2E coverage is still required for:

- real GPS accuracy, location sampling, route distance, speed, and day/night classification at actual coordinates;
- background tracking across screen-off, app backgrounding, process pressure, task removal, reboot, and OEM battery restrictions;
- Android runtime permission dialogs, permanently denied permissions, settings redirects, and notification delivery;
- Picture-in-Picture rendering and native event delivery;
- Storage Access Framework pickers, cloud-backup restore behavior, exported files, and PDF viewing/printing;
- signed release APK installation, in-place APK upgrades, downloaded-APK installation permissions, and rollback behavior;
- real EAS preview/production channel selection, OTA download/apply/restart behavior, and runtime-version incompatibility;
- GitHub release, Open-Meteo, and other network failure/rate-limit behavior;
- website browser-level navigation, downloads, and accessibility behavior;
- iOS runtime behavior, which is not a shipped native target in the current Android-focused suite.

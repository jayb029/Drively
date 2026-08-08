import React from 'react';
import { Alert, Linking, Text } from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';

const mockDriving = {
  loading: false,
  user: { onboardingComplete: true },
};
jest.mock('../src/contexts/DrivingContext', () => ({
  DrivingProvider: ({ children }) => children,
  useDriving: () => mockDriving,
}));

jest.mock('expo-application', () => ({
  nativeApplicationVersion: '2.2.1',
  nativeBuildVersion: '15',
}));

const mockFetchLatestApkRelease = jest.fn();
const mockEvaluateApkRelease = jest.fn();
jest.mock('../src/services/apkUpdater', () => ({
  evaluateApkRelease: (...args) => mockEvaluateApkRelease(...args),
  fetchLatestApkRelease: (...args) => mockFetchLatestApkRelease(...args),
}));

const mockLogError = jest.fn(async () => undefined);
const mockLogUserAction = jest.fn(async () => undefined);
const mockInitializeLogger = jest.fn(async () => undefined);
const mockScheduleLogCleanup = jest.fn(async () => undefined);
jest.mock('../src/utils/logger', () => ({
  initializeLogger: (...args) => mockInitializeLogger(...args),
  logger: { info: jest.fn(async () => undefined) },
  logError: (...args) => mockLogError(...args),
  logUserAction: (...args) => mockLogUserAction(...args),
  scheduleLogCleanup: (...args) => mockScheduleLogCleanup(...args),
}));

const mockDownloadOta = jest.fn();
jest.mock('../src/services/otaUpdater', () => ({
  downloadOtaUpdateInBackground: (...args) => mockDownloadOta(...args),
}));
const mockConfigureDriveNotifications = jest.fn(async () => undefined);
jest.mock('../src/services/driveDetection', () => ({
  configureDriveNotifications: (...args) => mockConfigureDriveNotifications(...args),
}));
jest.mock('../src/services/drivePip', () => ({
  addDrivePipModeListener: jest.fn(() => ({ remove: jest.fn() })),
  isInDrivePictureInPictureMode: jest.fn(async () => false),
}));

jest.mock('../src/utils/storage', () => ({
  preloadData: jest.fn(async () => null),
}));

jest.mock('../src/contexts/ThemeContext', () => {
  const { lightTheme } = jest.requireActual('../src/utils/theme');
  return {
    ThemeProvider: ({ children }) => children,
    preloadThemePreference: jest.fn(async () => 'system'),
    useTheme: () => ({
      isDark: false,
      isLoading: false,
      paperTheme: {},
      theme: lightTheme,
    }),
  };
});
jest.mock('../src/navigation/AppNavigator', () => {
  const ReactModule = require('react');
  const { Text: NativeText } = require('react-native');
  return {
    __esModule: true,
    default: () => ReactModule.createElement(NativeText, null, 'Navigator mounted'),
  };
});
jest.mock('../src/contexts/DataSecurityContext', () => ({
  DataSecurityProvider: ({ children }) => children,
  useDataSecurity: () => ({
    metadata: { configured: true, enabled: false, biometricEnabled: false },
    unlocked: true,
  }),
}));
jest.mock('react-native-safe-area-context', () => {
  const ReactModule = require('react');
  const insets = { bottom: 0, left: 0, right: 0, top: 0 };
  return {
    initialWindowMetrics: null,
    SafeAreaInsetsContext: ReactModule.createContext(insets),
    SafeAreaProvider: ({ children }) => children,
    SafeAreaView: ({ children }) => children,
    useSafeAreaInsets: () => insets,
  };
});

import App from '../App';
import { ApkUpdateProvider, useApkUpdate } from '../src/contexts/ApkUpdateContext';

const release = {
  changes: ['Safer tracking', 'Clearer update guidance'],
  downloadUrl: 'https://github.com/jayb029/Drively/releases/download/v2.2.2/Drively-v2.2.2-16.apk',
  version: '2.2.2',
  versionCode: 16,
};

let currentUpdate;

function UpdateProbe() {
  currentUpdate = useApkUpdate();
  return <Text>{currentUpdate.status}:{currentUpdate.message || 'none'}</Text>;
}

function getAlert(title) {
  return Alert.alert.mock.calls.find(([alertTitle]) => alertTitle === title);
}

describe('APK and OTA update orchestration', () => {
  beforeEach(() => {
    currentUpdate = null;
    mockDriving.loading = false;
    mockDriving.user.onboardingComplete = true;
    mockFetchLatestApkRelease.mockReset().mockResolvedValue(release);
    mockEvaluateApkRelease.mockReset().mockReturnValue({
      installedVersionCode: 15,
      isAvailable: true,
    });
    mockDownloadOta.mockReset().mockResolvedValue({ downloaded: false });
    mockLogError.mockClear();
    mockLogUserAction.mockClear();
    mockInitializeLogger.mockClear();
    mockScheduleLogCleanup.mockClear();
    mockConfigureDriveNotifications.mockClear();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  });

  test('shows the APK changelog, backup guide, and download action for an available release', async () => {
    const originalDev = global.__DEV__;
    global.__DEV__ = true;
    const screen = await render(
      <ApkUpdateProvider>
        <UpdateProbe />
      </ApkUpdateProvider>
    );

    await act(async () => {
      await currentUpdate.checkForApkUpdate({ automatic: true });
    });
    expect(currentUpdate).toMatchObject({
      status: 'available',
      message: 'Drively v2.2.2 (build 16) is ready.',
      installed: { version: '2.2.1', versionCode: '15' },
    });

    const updatePrompt = getAlert('Drively v2.2.2 is available');
    expect(updatePrompt?.[1]).toContain('• Safer tracking');
    await act(async () => updatePrompt[2].find(({ text }) => text === 'Update').onPress());

    const installGuide = getAlert('Before you update');
    expect(installGuide?.[1]).toContain('Export a full JSON backup');
    await act(async () => installGuide[2].find(({ text }) => text === 'Download APK').onPress());

    expect(Linking.openURL).toHaveBeenCalledWith(release.downloadUrl);
    expect(mockLogUserAction).toHaveBeenCalledWith('download_apk_update', 'UPDATES', expect.objectContaining({
      installedBuild: '15',
      releaseBuild: 16,
    }));
    global.__DEV__ = originalDev;
    await screen.unmount();
  });

  test('reports an update-check error without showing a misleading prompt', async () => {
    const error = new Error('GitHub unavailable');
    mockFetchLatestApkRelease.mockRejectedValueOnce(error);
    const screen = await render(
      <ApkUpdateProvider>
        <UpdateProbe />
      </ApkUpdateProvider>
    );

    await act(async () => {
      await expect(currentUpdate.checkForApkUpdate()).resolves.toMatchObject({
        status: 'error',
        message: 'GitHub unavailable',
      });
    });
    expect(getAlert('Drively v2.2.2 is available')).toBeUndefined();
    expect(mockLogError).toHaveBeenCalledWith(error, 'APK_UPDATER', 'APK update check failed');
    await screen.unmount();
  });

  test('runs the OTA check during app startup and records diagnostics when it fails', async () => {
    const otaError = Object.assign(new Error('OTA unavailable'), {
      diagnostics: { channel: 'production', runtimeVersion: '2.2.1' },
    });
    mockDownloadOta.mockRejectedValueOnce(otaError);
    const screen = await render(<App />);

    expect(screen.getByText('Navigator mounted')).toBeTruthy();
    await waitFor(() => expect(mockDownloadOta).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockLogError).toHaveBeenCalledWith(
      otaError,
      'OTA_UPDATER',
      {
        context: 'Background OTA update failed',
        diagnostics: otaError.diagnostics,
      }
    ));
    expect(mockInitializeLogger).toHaveBeenCalledTimes(1);
    expect(mockConfigureDriveNotifications).toHaveBeenCalledTimes(1);
    await screen.unmount();
  });

  test('clears the logger setup watchdog after successful startup', async () => {
    jest.useFakeTimers();
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
    let screen;
    try {
      screen = await render(<App />);
      await waitFor(() => expect(mockConfigureDriveNotifications).toHaveBeenCalledTimes(1));
      const watchdogCallIndex = setTimeoutSpy.mock.calls.findIndex(([, delay]) => delay === 2000);
      expect(watchdogCallIndex).toBeGreaterThanOrEqual(0);
      expect(clearTimeoutSpy).toHaveBeenCalledWith(setTimeoutSpy.mock.results[watchdogCallIndex].value);
    } finally {
      if (screen) await screen.unmount();
      jest.useRealTimers();
    }
  });
});

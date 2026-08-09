import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockNavigation = {
  goBack: jest.fn(),
  navigate: jest.fn(),
  preload: jest.fn(),
  setOptions: jest.fn(),
  setParams: jest.fn(),
};

function mockFlattenScreens(children) {
  return React.Children.toArray(children).flatMap((child) => {
    if (child?.type === React.Fragment) return mockFlattenScreens(child.props.children);
    return child ? [child] : [];
  });
}

function mockCreateNavigator() {
  const Screen = () => null;
  const Navigator = ({ children }) => {
    const selected = mockFlattenScreens(children)[0];
    if (!selected) return null;
    return React.createElement(selected.props.component, {
      navigation: mockNavigation,
      route: { params: {} },
    });
  };
  return { Navigator, Screen };
}

function mockScreenModule(label) {
  const ReactModule = require('react');
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: () => ReactModule.createElement(Text, null, label),
  };
}

jest.mock('@react-navigation/native', () => ({
  DarkTheme: { colors: {} },
  DefaultTheme: { colors: {} },
  NavigationContainer: ({ children }) => children,
}));
jest.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: () => mockCreateNavigator(),
}));
jest.mock('@react-navigation/bottom-tabs', () => ({
  createBottomTabNavigator: () => mockCreateNavigator(),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

const mockLoadData = jest.fn();
const mockPreloadData = jest.fn();
const mockSaveData = jest.fn();
jest.mock('../src/utils/storage', () => ({
  loadData: (...args) => mockLoadData(...args),
  preloadData: (...args) => mockPreloadData(...args),
  saveData: (...args) => mockSaveData(...args),
  setCloudBackupEnabled: jest.fn(async () => true),
}));

const mockRequestNotificationPermission = jest.fn();
const mockRequestStoragePermission = jest.fn();
jest.mock('../src/utils/permissions', () => ({
  requestNotificationPermission: (...args) => mockRequestNotificationPermission(...args),
  requestStoragePermission: (...args) => mockRequestStoragePermission(...args),
}));

const mockRequestForegroundPermissionsAsync = jest.fn();
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: (...args) => mockRequestForegroundPermissionsAsync(...args),
}));

jest.mock('../src/contexts/ThemeContext', () => {
  const { lightTheme } = jest.requireActual('../src/utils/theme');
  return {
    useTheme: () => ({ isDark: false, theme: lightTheme }),
  };
});
jest.mock('../src/contexts/DataSecurityContext', () => ({
  useDataSecurity: () => ({
    biometricsAvailable: false,
    metadata: { automaticPasscodeEntry: false, configured: false, enabled: false },
    passcodeLockoutUntil: 0,
    setupEncryption: jest.fn(async () => undefined),
    skipEncryption: jest.fn(async () => undefined),
    unlocked: false,
  }),
}));
jest.mock('../src/utils/haptics', () => ({
  haptics: {
    action: jest.fn(),
    selection: jest.fn(),
    success: jest.fn(),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(async () => undefined) },
  logError: jest.fn(async () => undefined),
  logUserAction: jest.fn(),
}));
jest.mock('../src/screens/DashboardScreen', () => mockScreenModule('Dashboard ready'));
jest.mock('../src/screens/LogDriveScreen', () => mockScreenModule('Log drive'));
jest.mock('../src/screens/DriveHistoryScreen', () => mockScreenModule('Drive history'));
jest.mock('../src/screens/ExportScreen', () => mockScreenModule('Export'));
jest.mock('../src/screens/SettingsHomeScreen', () => mockScreenModule('Settings'));
jest.mock('../src/screens/GoalSettingsScreen', () => mockScreenModule('Goals'));
jest.mock('../src/screens/AppearanceSettingsScreen', () => mockScreenModule('Appearance'));
jest.mock('../src/screens/SupervisorProfilesScreen', () => mockScreenModule('Supervisors'));
jest.mock('../src/screens/DriverProfileSettingsScreen', () => mockScreenModule('Driver profile'));
jest.mock('../src/screens/DriveTrackingSettingsScreen', () => mockScreenModule('Drive tracking'));
jest.mock('../src/screens/DataSettingsScreen', () => mockScreenModule('Data settings'));
jest.mock('../src/screens/AboutSettingsScreen', () => mockScreenModule('About'));
jest.mock('../src/screens/DiagnosticsSettingsScreen', () => mockScreenModule('Diagnostics'));
jest.mock('../src/screens/WeatherSettingsScreen', () => mockScreenModule('Weather'));
jest.mock('../src/screens/NightDrivingSettingsScreen', () => mockScreenModule('Night driving'));

import { DrivingProvider } from '../src/contexts/DrivingContext';
import AppNavigator from '../src/navigation/AppNavigator';

const initialData = {
  user: {
    licenseType: null,
    licenseDate: null,
    driverName: '',
    dateOfBirth: '',
    permitNumber: '',
    goalDayHours: 50,
    goalNightHours: 10,
    completedDayHours: 0,
    completedNightHours: 0,
    onboardingComplete: false,
  },
  supervisorProfiles: [],
  drives: [],
  detectedEvents: [],
  streaks: {
    current: 0,
    longest: 0,
    lastDriveDate: null,
    freezeDaysUsed: 0,
    freezeDaysThisMonth: 0,
    lastFreezeReset: '2026-08-01',
  },
  settings: {
    nightDrivingMethod: 'civil_twilight',
    nightTimeStart: '18:00',
    nightTimeEnd: '06:00',
    backupReminder: true,
    cloudBackupEnabled: false,
    temperatureUnit: 'metric',
    weatherEnabled: true,
    distanceUnit: 'metric',
    censorSensitiveInfo: true,
    alwaysOnWhileTracking: true,
    largeBottomNavIcons: true,
    driveDetectionEnabled: false,
  },
};

async function pressText(screen, text) {
  await fireEvent.press(screen.getByText(text));
}

async function skipOnboardingEncryption(screen) {
  await screen.findByText('Protect your data');
  await pressText(screen, 'Skip for now');
  const confirmation = Alert.alert.mock.calls.at(-1);
  await act(async () => confirmation[2][1].onPress());
  await screen.findByText('Important Notice');
}

describe('onboarding and navigation orchestration', () => {
  beforeEach(() => {
    mockLoadData.mockReset().mockResolvedValue(structuredClone(initialData));
    mockPreloadData.mockReset().mockResolvedValue(structuredClone(initialData));
    mockSaveData.mockReset().mockResolvedValue(true);
    mockRequestForegroundPermissionsAsync.mockReset().mockResolvedValue({ status: 'granted' });
    mockRequestNotificationPermission.mockReset().mockResolvedValue('granted');
    mockRequestStoragePermission.mockReset().mockResolvedValue({ status: 'granted', directoryUri: null });
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    global.requestIdleCallback = jest.fn((callback) => {
      callback();
      return 1;
    });
    global.cancelIdleCallback = jest.fn();
  });

  test('completes onboarding, persists the full selection, requests permissions, and enters the main navigator', async () => {
    const screen = await render(
      <DrivingProvider>
        <AppNavigator />
      </DrivingProvider>
    );

    await screen.findByText("What's your current license type?");
    await pressText(screen, "Learner's Permit");
    await pressText(screen, 'Continue');

    expect(screen.getByText('Set your driving goals')).toBeTruthy();
    await pressText(screen, 'Continue');

    await fireEvent.changeText(screen.getByPlaceholderText('Full name'), '  Jamie Driver  ');
    await fireEvent.changeText(screen.getByPlaceholderText('Optional'), ' permit-42 ');
    await pressText(screen, 'Next');

    await pressText(screen, 'Fahrenheit');
    await pressText(screen, 'Miles');
    await pressText(screen, 'Automatic weather lookup');
    await pressText(screen, 'Next');

    await skipOnboardingEncryption(screen);
    await pressText(screen, 'I understand and agree to these terms');
    await pressText(screen, 'Get Started');

    await screen.findByText('Dashboard ready');
    expect(mockSaveData).toHaveBeenCalledWith(expect.objectContaining({
      user: expect.objectContaining({
        driverName: 'Jamie Driver',
        permitNumber: 'permit-42',
        licenseType: 'learners',
        goalDayHours: 50,
        goalNightHours: 10,
        onboardingComplete: true,
      }),
      settings: expect.objectContaining({
        temperatureUnit: 'imperial',
        distanceUnit: 'imperial',
        weatherEnabled: false,
      }),
    }));
    await waitFor(() => {
      expect(mockRequestNotificationPermission).toHaveBeenCalledTimes(1);
      expect(mockRequestStoragePermission).toHaveBeenCalledTimes(1);
    });
    expect(mockRequestForegroundPermissionsAsync).not.toHaveBeenCalled();
    await screen.unmount();
  });

  test('keeps onboarding visible and shows a retryable error when the initial save fails', async () => {
    mockSaveData.mockResolvedValueOnce(false);
    const screen = await render(
      <DrivingProvider>
        <AppNavigator />
      </DrivingProvider>
    );

    await screen.findByText("What's your current license type?");
    await pressText(screen, 'Restricted License');
    await pressText(screen, 'Continue');
    await pressText(screen, 'Continue');
    await pressText(screen, 'Next');
    await pressText(screen, 'Next');
    await skipOnboardingEncryption(screen);
    await pressText(screen, 'I understand and agree to these terms');
    await pressText(screen, 'Get Started');

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith(
      'Setup Error',
      'Drively could not save your setup. Please try again.'
    ));
    expect(screen.getByText('Important Notice')).toBeTruthy();
    expect(screen.queryByText('Dashboard ready')).toBeNull();
    await screen.unmount();
  });
});

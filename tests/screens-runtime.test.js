import React from 'react';
import { render } from '@testing-library/react-native';
import { lightTheme } from '../src/utils/theme';

const mockNavigation = {
  addListener: jest.fn(() => jest.fn()),
  canGoBack: jest.fn(() => true),
  getParent: jest.fn(() => ({ setOptions: jest.fn() })),
  goBack: jest.fn(),
  navigate: jest.fn(),
  setOptions: jest.fn(),
};

const mockDrivingState = {
  addDrive: jest.fn(),
  addSupervisorProfile: jest.fn(),
  completeOnboarding: jest.fn(async () => true),
  deleteDetectedEvent: jest.fn(),
  deleteDrive: jest.fn(),
  deleteSupervisorProfile: jest.fn(),
  detectedEvents: [],
  drives: [],
  error: null,
  loading: false,
  replaceData: jest.fn(),
  resetData: jest.fn(),
  setCloudBackupEnabled: jest.fn(async () => true),
  setUserInfo: jest.fn(),
  settings: {
    alwaysOnWhileTracking: true,
    backupReminder: true,
    censorSensitiveInfo: true,
    cloudBackupEnabled: false,
    distanceUnit: 'metric',
    driveDetectionEnabled: false,
    driveDetectionSensitivity: 'balanced',
    largeBottomNavIcons: true,
    nightDrivingMethod: 'civil_twilight',
    nightTimeEnd: '06:00',
    nightTimeStart: '18:00',
    temperatureUnit: 'metric',
    weatherEnabled: true,
  },
  streaks: { current: 0, longest: 0, freezeDaysThisMonth: 0, freezeDaysUsed: 0 },
  supervisorProfiles: [],
  updateDetectedEvent: jest.fn(),
  updateDrive: jest.fn(),
  updateSettings: jest.fn(),
  updateStreaks: jest.fn(),
  updateSupervisorProfile: jest.fn(),
  useFreezeDay: jest.fn(),
  user: {
    completedDayHours: 0,
    completedNightHours: 0,
    dateOfBirth: '01/01/2010',
    driverName: 'Test Driver',
    goalDayHours: 50,
    goalNightHours: 10,
    licenseType: 'learners',
    onboardingComplete: true,
    permitNumber: 'TEST-1',
  },
};

const mockThemeState = {
  colorScheme: 'light',
  isDark: false,
  isReady: true,
  mode: 'system',
  themeMode: 'system',
  setMode: jest.fn(async () => undefined),
  theme: lightTheme,
};

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }) => children,
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

jest.mock('../src/contexts/DrivingContext', () => ({
  DrivingProvider: ({ children }) => children,
  useDriving: () => mockDrivingState,
}));
jest.mock('../src/contexts/ThemeContext', () => ({
  THEME_MODES: { DARK: 'dark', LIGHT: 'light', SYSTEM: 'system' },
  ThemeProvider: ({ children }) => children,
  preloadThemePreference: jest.fn(async () => 'system'),
  useTheme: () => mockThemeState,
}));
jest.mock('../src/contexts/ApkUpdateContext', () => ({
  ApkUpdateProvider: ({ children }) => children,
  useApkUpdate: () => ({
    checkForUpdates: jest.fn(async () => null),
    checking: false,
    error: null,
    installed: { version: '2.2.1', versionCode: 15 },
    latestRelease: null,
  }),
}));
jest.mock('../src/services/activeDriveTracking', () => ({
  addActiveDriveTrackingListener: jest.fn(() => ({ remove: jest.fn() })),
  clearActiveDriveTracking: jest.fn(async () => undefined),
  isActiveDriveTrackingRunning: jest.fn(async () => false),
  pauseActiveDriveTracking: jest.fn(async () => null),
  requestActiveDriveTrackingPermissions: jest.fn(async () => ({ granted: true })),
  resumeActiveDriveTracking: jest.fn(async () => null),
  startActiveDriveTracking: jest.fn(async () => true),
  stopActiveDriveTracking: jest.fn(async () => null),
}));
jest.mock('../src/services/driveDetection', () => ({
  configureDriveNotifications: jest.fn(async () => undefined),
  isDriveDetectionRunning: jest.fn(async () => false),
  requestDriveDetectionPermissions: jest.fn(async () => ({ granted: true })),
  startDriveDetection: jest.fn(async () => true),
  stopDriveDetection: jest.fn(async () => true),
}));
jest.mock('../src/services/drivePip', () => ({
  addDrivePipModeListener: jest.fn(() => ({ remove: jest.fn() })),
  enterDrivePictureInPicture: jest.fn(async () => false),
  isDrivePipAvailable: jest.fn(() => false),
  isInDrivePictureInPictureMode: jest.fn(async () => false),
  isPictureInPictureSupported: jest.fn(async () => false),
  setDrivePipTrackingActive: jest.fn(),
  updateDrivePipStats: jest.fn(),
}));
jest.mock('../src/utils/logger', () => ({
  LOG_LEVELS: { INFO: 'INFO' },
  cleanupOldLogs: jest.fn(async () => undefined),
  clearLogs: jest.fn(async () => true),
  exportLogs: jest.fn(async () => 'file:///cache/logs.txt'),
  getAllLogs: jest.fn(async () => ''),
  getLogStats: jest.fn(async () => ({ fileCount: 0, totalSize: 0 })),
  getRecentLogs: jest.fn(async () => []),
  initializeLogger: jest.fn(async () => undefined),
  logError: jest.fn(async () => undefined),
  logUserAction: jest.fn(),
  logger: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  scheduleLogCleanup: jest.fn(async () => undefined),
}));

const screens = [
  ['About settings', require('../src/screens/AboutSettingsScreen').default],
  ['Appearance settings', require('../src/screens/AppearanceSettingsScreen').default],
  ['Dashboard', require('../src/screens/DashboardScreen').default],
  ['Data settings', require('../src/screens/DataSettingsScreen').default],
  ['Encryption settings', require('../src/screens/EncryptionSettingsScreen').default],
  ['Diagnostics settings', require('../src/screens/DiagnosticsSettingsScreen').default],
  ['Drive history', require('../src/screens/DriveHistoryScreen').default],
  ['Drive tracking settings', require('../src/screens/DriveTrackingSettingsScreen').default],
  ['Driver profile settings', require('../src/screens/DriverProfileSettingsScreen').default],
  ['Export', require('../src/screens/ExportScreen').default],
  ['Goals', require('../src/screens/GoalSettingsScreen').default],
  ['Log drive', require('../src/screens/LogDriveScreen').default],
  ['Night driving settings', require('../src/screens/NightDrivingSettingsScreen').default],
  ['Onboarding', require('../src/screens/OnboardingScreen').default],
  ['Settings home', require('../src/screens/SettingsHomeScreen').default],
  ['Supervisors', require('../src/screens/SupervisorProfilesScreen').default],
  ['Weather settings', require('../src/screens/WeatherSettingsScreen').default],
];

describe('screen simulated runtime', () => {
  test.each(screens)('%s mounts without a render-time exception', async (_name, Screen) => {
    const result = await render(<Screen navigation={mockNavigation} route={{ params: {} }} />);
    expect(Screen).toEqual(expect.any(Function));
    await result.unmount();
  });
});

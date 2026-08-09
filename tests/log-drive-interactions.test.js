import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

let mockTrackingListener;
let mockPipListener;
const mockRequestPermissions = jest.fn();
const mockStartTracking = jest.fn();
const mockPauseTracking = jest.fn();
const mockResumeTracking = jest.fn();
const mockStopTracking = jest.fn();
const mockClearTracking = jest.fn(async () => undefined);

jest.mock('../src/services/activeDriveTracking', () => ({
  addActiveDriveTrackingListener: jest.fn((listener) => {
    mockTrackingListener = listener;
    return { remove: jest.fn() };
  }),
  clearActiveDriveTracking: (...args) => mockClearTracking(...args),
  pauseActiveDriveTracking: (...args) => mockPauseTracking(...args),
  requestActiveDriveTrackingPermissions: (...args) => mockRequestPermissions(...args),
  resumeActiveDriveTracking: (...args) => mockResumeTracking(...args),
  startActiveDriveTracking: (...args) => mockStartTracking(...args),
  stopActiveDriveTracking: (...args) => mockStopTracking(...args),
}));

jest.mock('../src/services/drivePip', () => ({
  addDrivePipModeListener: jest.fn((listener) => {
    mockPipListener = listener;
    return { remove: jest.fn() };
  }),
  isInDrivePictureInPictureMode: jest.fn(async () => false),
  setDrivePipTrackingActive: jest.fn(),
  updateDrivePipStats: jest.fn(),
}));

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 'balanced' },
  getCurrentPositionAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'denied' })),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

const mockAddDrive = jest.fn();
const mockDriving = {
  addDrive: mockAddDrive,
  deleteDetectedEvent: jest.fn(),
  detectedEvents: [],
  settings: {
    alwaysOnWhileTracking: true,
    distanceUnit: 'metric',
    largeBottomNavIcons: true,
    nightDrivingMethod: 'custom_hours',
    nightTimeEnd: '06:00',
    nightTimeStart: '18:00',
    temperatureUnit: 'metric',
    weatherEnabled: false,
  },
  supervisorProfiles: [],
  updateDetectedEvent: jest.fn(),
  updateSettings: jest.fn(),
  user: { licenseType: 'restricted' },
};

jest.mock('../src/contexts/DrivingContext', () => ({
  useDriving: () => mockDriving,
}));
jest.mock('../src/contexts/ThemeContext', () => {
  const { lightTheme } = jest.requireActual('../src/utils/theme');
  return { useTheme: () => ({ theme: lightTheme }) };
});
jest.mock('../src/utils/logger', () => ({
  logError: jest.fn(async () => undefined),
  logUserAction: jest.fn(),
}));

import LogDriveScreen from '../src/screens/LogDriveScreen';
import { updateDrivePipStats } from '../src/services/drivePip';

const navigation = {
  isFocused: jest.fn(() => true),
  navigate: jest.fn(),
  setOptions: jest.fn(),
};
const startedAt = Date.parse('2026-08-08T10:00:00Z');
const firstSegment = {
  startTimestamp: startedAt,
  endTimestamp: startedAt + 120000,
  distance: 800,
  maxSpeed: 42,
  routePoints: [
    { latitude: 41.8781, longitude: -87.6298, timestamp: startedAt, speed: 10, accuracy: 8 },
  ],
};
const secondSegment = {
  startTimestamp: startedAt + 180000,
  endTimestamp: startedAt + 300000,
  distance: 1200,
  maxSpeed: 50,
  routePoints: [
    { latitude: 41.8791, longitude: -87.6298, timestamp: startedAt + 240000, speed: 12, accuracy: 8 },
  ],
};

function emitTracking(overrides = {}) {
  mockTrackingListener({
    currentSpeed: 0,
    distance: 800,
    elapsedMs: 120000,
    lastPoint: firstSegment.routePoints[0],
    maxSpeed: 42,
    paused: false,
    routePoints: firstSegment.routePoints,
    segmentCount: 1,
    segments: [],
    ...overrides,
  });
}

function getAlert(title) {
  return Alert.alert.mock.calls.find(([alertTitle]) => alertTitle === title);
}

async function renderDriveScreen() {
  const screen = await render(<LogDriveScreen navigation={navigation} />);
  await screen.findByText('Log Drive');
  return screen;
}

describe('live drive interaction flow', () => {
  beforeEach(() => {
    mockTrackingListener = null;
    mockPipListener = null;
    mockRequestPermissions.mockReset().mockResolvedValue({
      foreground: 'granted',
      background: 'granted',
      granted: true,
    });
    mockStartTracking.mockReset().mockResolvedValue(true);
    mockPauseTracking.mockReset().mockResolvedValue({ paused: true });
    mockResumeTracking.mockReset().mockResolvedValue({ paused: false });
    mockStopTracking.mockReset().mockResolvedValue({
      active: false,
      currentSpeed: 0,
      distance: 2000,
      elapsedMs: 240000,
      maxSpeed: 50,
      paused: false,
      routePoints: [...firstSegment.routePoints, ...secondSegment.routePoints],
      segments: [firstSegment, secondSegment],
    });
    mockClearTracking.mockClear();
    mockAddDrive.mockClear();
    navigation.navigate.mockClear();
    navigation.isFocused.mockClear();
    navigation.setOptions.mockClear();
    updateDrivePipStats.mockClear();
    jest.spyOn(Date, 'now').mockReturnValue(startedAt);
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  test('starts, pauses, resumes, stops, and saves one grouped drive', async () => {
    const screen = await renderDriveScreen();

    await fireEvent.press(screen.getByLabelText('Start drive'));
    await screen.findByText('Drive in progress');
    expect(mockStartTracking).toHaveBeenCalledWith({ startTimestamp: startedAt, distanceUnit: 'metric' });

    await fireEvent.press(screen.getByLabelText('Pause drive and finish this segment'));
    await act(async () => emitTracking({
      paused: true,
      segmentCount: 1,
      segments: [firstSegment],
    }));
    expect(screen.getByText('Drive paused')).toBeTruthy();
    expect(mockPauseTracking).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByLabelText('Resume drive and start a new segment'));
    await act(async () => emitTracking({
      paused: false,
      segmentCount: 2,
      segments: [firstSegment],
    }));
    expect(screen.getByText('Drive in progress')).toBeTruthy();
    expect(mockResumeTracking).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByLabelText('End drive'));
    const endPrompt = getAlert('End this drive?');
    expect(endPrompt?.[1]).toContain('2 segments');
    const saveAction = endPrompt[2].find(({ text }) => text === 'Save drive');
    await act(async () => saveAction.onPress());

    expect(mockStopTracking).toHaveBeenCalledTimes(1);
    expect(mockAddDrive).toHaveBeenCalledWith(expect.objectContaining({
      duration: 4,
      source: 'manual',
      routeSummary: expect.objectContaining({ distanceKm: 2, maxSpeedKmh: 50, samples: 2 }),
      segments: [
        expect.objectContaining({ durationMinutes: 2 }),
        expect.objectContaining({ durationMinutes: 2 }),
      ],
    }));
    expect(getAlert('Drive saved')).toBeTruthy();
    expect(screen.getByText('Log Drive')).toBeTruthy();
    await screen.unmount();
  });

  test('does not start when background location permission is denied', async () => {
    mockRequestPermissions.mockResolvedValueOnce({
      foreground: 'granted',
      background: 'denied',
      granted: false,
    });
    const screen = await renderDriveScreen();

    await fireEvent.press(screen.getByLabelText('Start drive'));

    expect(mockStartTracking).not.toHaveBeenCalled();
    expect(getAlert('Location needed')).toBeTruthy();
    expect(screen.getByText('Log Drive')).toBeTruthy();
    await screen.unmount();
  });

  test('keeps the native PiP elapsed clock anchored across a delayed transition', async () => {
    const screen = await renderDriveScreen();

    await fireEvent.press(screen.getByLabelText('Start drive'));
    await act(async () => emitTracking({ elapsedMs: 120000 }));

    jest.spyOn(Date, 'now').mockReturnValue(startedAt + 3450);
    await act(async () => mockPipListener({ isInPictureInPictureMode: true }));

    await waitFor(() => expect(updateDrivePipStats).toHaveBeenCalledWith(expect.objectContaining({
      startTimestamp: startedAt - 120000,
    })));
    await screen.unmount();
  });

  test('recovers visibly when the native tracking start fails', async () => {
    mockStartTracking.mockRejectedValueOnce(new Error('native start failed'));
    const screen = await renderDriveScreen();

    await fireEvent.press(screen.getByLabelText('Start drive'));

    await waitFor(() => expect(getAlert('Tracking Error')).toBeTruthy());
    expect(mockAddDrive).not.toHaveBeenCalled();
    expect(screen.getByText('Log Drive')).toBeTruthy();
    await screen.unmount();
  });

  test('keeps the active drive recoverable when pause or stop fails', async () => {
    const screen = await renderDriveScreen();
    await fireEvent.press(screen.getByLabelText('Start drive'));
    await screen.findByText('Drive in progress');

    mockPauseTracking.mockRejectedValueOnce(new Error('pause failed'));
    await fireEvent.press(screen.getByLabelText('Pause drive and finish this segment'));
    await waitFor(() => expect(getAlert('Could not pause drive')).toBeTruthy());
    expect(screen.getByText('Drive in progress')).toBeTruthy();

    mockStopTracking.mockRejectedValueOnce(new Error('stop failed'));
    await fireEvent.press(screen.getByLabelText('End drive'));
    const saveAction = getAlert('End this drive?')[2].find(({ text }) => text === 'Save drive');
    await act(async () => saveAction.onPress());

    expect(getAlert('Could not end drive')).toBeTruthy();
    expect(mockAddDrive).not.toHaveBeenCalled();
    expect(screen.getByText('Drive in progress')).toBeTruthy();
    await screen.unmount();
  });
});

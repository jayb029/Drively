import AsyncStorage from '@react-native-async-storage/async-storage';

const mockTasks = {};
const mockRunningTasks = new Set();

jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn((name, handler) => { mockTasks[name] = handler; }),
  isTaskDefined: jest.fn((name) => Boolean(mockTasks[name])),
}));

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 'balanced', High: 'high' },
  ActivityType: { AutomotiveNavigation: 'automotive' },
  hasStartedLocationUpdatesAsync: jest.fn(async (name) => mockRunningTasks.has(name)),
  requestBackgroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  startLocationUpdatesAsync: jest.fn(async (name) => { mockRunningTasks.add(name); }),
  stopLocationUpdatesAsync: jest.fn(async (name) => { mockRunningTasks.delete(name); }),
}));

jest.mock('expo-notifications/build/NotificationChannelManager.types', () => ({
  AndroidImportance: { HIGH: 'high' },
  AndroidNotificationVisibility: { PUBLIC: 'public' },
}));
jest.mock('expo-notifications/build/NotificationPermissions', () => ({
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
}));
jest.mock('expo-notifications/build/setNotificationChannelAsync', () => ({
  setNotificationChannelAsync: jest.fn(async () => undefined),
}));
jest.mock('expo-notifications/build/NotificationsHandler', () => ({
  setNotificationHandler: jest.fn(),
}));
jest.mock('expo-notifications/build/scheduleNotificationAsync', () => ({
  scheduleNotificationAsync: jest.fn(async () => 'notification-id'),
}));

const Location = require('expo-location');
const {
  ACTIVE_DRIVE_TRACKING_TASK,
  addActiveDriveTrackingListener,
  clearActiveDriveTracking,
  isActiveDriveTrackingRunning,
  pauseActiveDriveTracking,
  requestActiveDriveTrackingPermissions,
  resumeActiveDriveTracking,
  startActiveDriveTracking,
  stopActiveDriveTracking,
} = require('../src/services/activeDriveTracking');
const {
  DRIVE_DETECTION_TASK,
  configureDriveNotifications,
  isDriveDetectionRunning,
  requestDriveDetectionPermissions,
  startDriveDetection,
  stopDriveDetection,
} = require('../src/services/driveDetection');
const { scheduleNotificationAsync } = require('expo-notifications/build/scheduleNotificationAsync');
const { setNotificationChannelAsync } = require('expo-notifications/build/setNotificationChannelAsync');

const location = (timestamp, latitude, longitude, speed = 10, accuracy = 10) => ({
  coords: { accuracy, latitude, longitude, speed },
  timestamp,
});

describe('active-drive simulated background runtime', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockRunningTasks.clear();
    jest.clearAllMocks();
  });

  test('requests both location grants and reports failures accurately', async () => {
    await expect(requestActiveDriveTrackingPermissions()).resolves.toMatchObject({
      foreground: 'granted', background: 'granted', granted: true,
    });
    Location.requestForegroundPermissionsAsync.mockResolvedValueOnce({ status: 'denied' });
    await expect(requestActiveDriveTrackingPermissions()).resolves.toMatchObject({
      foreground: 'denied', background: 'not_requested', granted: false,
    });
  });

  test('starts, receives location batches, pauses, resumes, stops, and clears state', async () => {
    const updates = [];
    const subscription = addActiveDriveTrackingListener((event) => updates.push(event));
    const startedAt = Date.parse('2026-08-08T10:00:00Z');
    await expect(startActiveDriveTracking({ startTimestamp: startedAt, distanceUnit: 'metric' })).resolves.toBe(true);
    expect(await isActiveDriveTrackingRunning()).toBe(true);
    expect(Location.startLocationUpdatesAsync).toHaveBeenCalledWith(ACTIVE_DRIVE_TRACKING_TASK, expect.objectContaining({ foregroundService: expect.any(Object) }));

    await mockTasks[ACTIVE_DRIVE_TRACKING_TASK]({
      data: { locations: [
        location(startedAt + 1000, 41.8781, -87.6298, 8),
        location(startedAt + 11000, 41.8791, -87.6298, 12),
      ] },
    });
    const paused = await pauseActiveDriveTracking();
    expect(paused.paused).toBe(true);
    expect(paused.routePoints.length).toBe(2);

    const resumed = await resumeActiveDriveTracking();
    expect(resumed.paused).toBe(false);
    expect(await isActiveDriveTrackingRunning()).toBe(true);

    const stopped = await stopActiveDriveTracking();
    expect(stopped).toMatchObject({ active: false, paused: false, currentSpeed: 0 });
    expect(updates.length).toBeGreaterThan(0);
    await clearActiveDriveTracking();
    expect(await AsyncStorage.getAllKeys()).not.toContain('drively.activeDrive.state.v1');
    subscription.remove();
  });

  test('rolls a failed resume back to paused state', async () => {
    await startActiveDriveTracking({ startTimestamp: Date.now(), distanceUnit: 'imperial' });
    await pauseActiveDriveTracking();
    Location.startLocationUpdatesAsync.mockRejectedValueOnce(new Error('native start failed'));
    await expect(resumeActiveDriveTracking()).rejects.toThrow('native start failed');
    const stopped = await stopActiveDriveTracking();
    expect(stopped.paused).toBe(false);
  });
});

describe('drive-detection simulated background runtime', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockRunningTasks.clear();
    jest.clearAllMocks();
  });

  test('configures notifications, permissions, and idempotent start/stop', async () => {
    await configureDriveNotifications();
    expect(setNotificationChannelAsync).toHaveBeenCalledWith('drive-detection', expect.objectContaining({ importance: 'high' }));
    await expect(requestDriveDetectionPermissions()).resolves.toMatchObject({ granted: true });
    await expect(startDriveDetection()).resolves.toBe(true);
    await expect(startDriveDetection()).resolves.toBe(true);
    expect(await isDriveDetectionRunning()).toBe(true);
    await expect(stopDriveDetection()).resolves.toBe(true);
    expect(await isDriveDetectionRunning()).toBe(false);
  });

  test('executes the registered background task without crashing on empty/error payloads', async () => {
    expect(mockTasks[DRIVE_DETECTION_TASK]).toEqual(expect.any(Function));
    await expect(mockTasks[DRIVE_DETECTION_TASK]({ error: new Error('native') })).resolves.toBeUndefined();
    await expect(mockTasks[DRIVE_DETECTION_TASK]({ data: { locations: [] } })).resolves.toBeUndefined();
    expect(scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});

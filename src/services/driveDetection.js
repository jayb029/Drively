import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { AndroidImportance, AndroidNotificationVisibility } from 'expo-notifications/build/NotificationChannelManager.types';
import { requestPermissionsAsync } from 'expo-notifications/build/NotificationPermissions';
import { setNotificationChannelAsync } from 'expo-notifications/build/setNotificationChannelAsync';
import { setNotificationHandler } from 'expo-notifications/build/NotificationsHandler';
import { scheduleNotificationAsync } from 'expo-notifications/build/scheduleNotificationAsync';
import * as TaskManager from 'expo-task-manager';
import { loadData, saveData } from '../utils/storage';
import { formatSpeedFromKmh } from '../utils/units';

export const DRIVE_DETECTION_TASK = 'drively-drive-detection-v1';

const DETECTOR_STATE_KEY = 'drively.detector.state.v1';
const CHANNEL_ID = 'drive-detection';
const MIN_NOTIFY_INTERVAL_MS = 20 * 60 * 1000;

const SPEED_THRESHOLDS_KMH = {
  conservative: 32,
  balanced: 24,
  sensitive: 18,
};

setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function getDetectorState() {
  const raw = await AsyncStorage.getItem(DETECTOR_STATE_KEY);
  if (!raw) {
    return {
      movingSince: null,
      lastLocation: null,
      lastNotificationAt: 0,
      lastEventAt: 0,
    };
  }

  try {
    return JSON.parse(raw);
  } catch {
    return {
      movingSince: null,
      lastLocation: null,
      lastNotificationAt: 0,
      lastEventAt: 0,
    };
  }
}

async function setDetectorState(nextState) {
  await AsyncStorage.setItem(DETECTOR_STATE_KEY, JSON.stringify(nextState));
}

function toPoint(location) {
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    speed: location.coords.speed,
    accuracy: location.coords.accuracy,
    timestamp: location.timestamp || Date.now(),
  };
}

function getDistanceMeters(a, b) {
  const radius = 6371000;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const deltaLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const deltaLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const h =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) *
      Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);

  return radius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function getSpeedKmh(point, previousPoint) {
  if (typeof point.speed === 'number' && point.speed >= 0) {
    return point.speed * 3.6;
  }

  if (!previousPoint) return 0;
  const seconds = Math.max(1, (point.timestamp - previousPoint.timestamp) / 1000);
  return (getDistanceMeters(previousPoint, point) / seconds) * 3.6;
}

async function recordDetectedEvent(point, speedKmh, drivingStartedAt) {
  const data = await loadData();
  const event = {
    id: `detected-${Date.now()}`,
    detectedAt: new Date(point.timestamp).toISOString(),
    drivingStartedAt: new Date(drivingStartedAt || point.timestamp).toISOString(),
    speedKmh: Math.round(speedKmh),
    latitude: point.latitude,
    longitude: point.longitude,
    accuracy: point.accuracy,
    status: 'new',
  };

  const detectedEvents = [event, ...(data.detectedEvents || [])].slice(0, 30);
  await saveData({
    ...data,
    detectedEvents,
  });

  return event;
}

async function notifyDrivingDetected(event, speedKmh, distanceUnit) {
  const speedText = formatSpeedFromKmh(speedKmh, distanceUnit || 'metric');
  await scheduleNotificationAsync({
    content: {
      title: 'Driving detected',
      body: `Drively detected movement near ${speedText}. Open the app to start or confirm a drive log.`,
      sound: true,
      data: {
        type: 'drive_detected',
        eventId: event.id,
      },
    },
    trigger: null,
  });
}

async function handleLocationBatch(locations) {
  if (!Array.isArray(locations) || locations.length === 0) return;

  const data = await loadData();
  const sensitivity = data.settings?.driveDetectionSensitivity || 'balanced';
  const threshold = SPEED_THRESHOLDS_KMH[sensitivity] || SPEED_THRESHOLDS_KMH.balanced;
  let state = await getDetectorState();

  for (const location of locations) {
    const point = toPoint(location);
    const accuracy = typeof point.accuracy === 'number' ? point.accuracy : 999;
    const speedKmh = getSpeedKmh(point, state.lastLocation);
    const isDrivingSpeed = speedKmh >= threshold && accuracy <= 90;

    if (isDrivingSpeed) {
      state.movingSince = state.movingSince || point.timestamp;
    } else if (speedKmh < 8) {
      state.movingSince = null;
    }

    const sustainedMs = state.movingSince ? point.timestamp - state.movingSince : 0;
    const canNotify = point.timestamp - (state.lastNotificationAt || 0) > MIN_NOTIFY_INTERVAL_MS;
    const canRecord = point.timestamp - (state.lastEventAt || 0) > MIN_NOTIFY_INTERVAL_MS;

    if (state.movingSince && sustainedMs >= 70 * 1000 && canNotify && canRecord) {
      const event = await recordDetectedEvent(point, speedKmh, state.movingSince);
      await notifyDrivingDetected(event, speedKmh, data.settings?.distanceUnit);
      state.lastNotificationAt = point.timestamp;
      state.lastEventAt = point.timestamp;
    }

    state.lastLocation = point;
  }

  await setDetectorState(state);
}

if (!TaskManager.isTaskDefined(DRIVE_DETECTION_TASK)) {
  TaskManager.defineTask(DRIVE_DETECTION_TASK, async ({ data, error }) => {
    if (error) {
      return;
    }

    await handleLocationBatch(data?.locations || []);
  });
}

export async function configureDriveNotifications() {
  if (Platform.OS === 'android') {
    await setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Drive detection',
      importance: AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#0f766e',
      lockscreenVisibility: AndroidNotificationVisibility.PUBLIC,
    });
  }
}

export async function requestDriveDetectionPermissions() {
  await configureDriveNotifications();

  const foreground = await Location.requestForegroundPermissionsAsync();
  const notifications = await requestPermissionsAsync();

  let background = { status: 'undetermined' };
  if (foreground.status === 'granted') {
    background = await Location.requestBackgroundPermissionsAsync();
  }

  return {
    foregroundLocation: foreground.status,
    backgroundLocation: background.status,
    notifications: notifications.status,
    granted:
      foreground.status === 'granted' &&
      background.status === 'granted' &&
      notifications.status === 'granted',
  };
}

export async function isDriveDetectionRunning() {
  return Location.hasStartedLocationUpdatesAsync(DRIVE_DETECTION_TASK);
}

export async function startDriveDetection() {
  await configureDriveNotifications();

  const alreadyRunning = await isDriveDetectionRunning();
  if (alreadyRunning) return true;

  await Location.startLocationUpdatesAsync(DRIVE_DETECTION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    activityType: Location.ActivityType.AutomotiveNavigation,
    timeInterval: 30000,
    distanceInterval: 75,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: false,
    foregroundService: {
      notificationTitle: 'Drively drive detection is active',
      notificationBody: 'Monitoring motion so Drively can notify you when driving starts.',
      notificationColor: '#0f766e',
    },
  });

  return true;
}

export async function stopDriveDetection() {
  const running = await isDriveDetectionRunning();
  if (running) {
    await Location.stopLocationUpdatesAsync(DRIVE_DETECTION_TASK);
  }
  return true;
}

import { DeviceEventEmitter, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { formatDistanceFromKm, formatSpeedFromKmh } from '../utils/units';
import { updateDrivePipStats } from './drivePip';

export const ACTIVE_DRIVE_TRACKING_TASK = 'drively-active-drive-tracking-v1';

const ACTIVE_DRIVE_STATE_KEY = 'drively.activeDrive.state.v1';
const ACTIVE_DRIVE_EVENT = 'DrivelyActiveDriveLocation';

function distanceMeters(a, b) {
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

function formatElapsed(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function toPoint(location) {
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracy: location.coords.accuracy,
    timestamp: location.timestamp || Date.now(),
    speed: location.coords.speed,
  };
}

function getSpeedKmh(point, previousPoint) {
  if (typeof point.speed === 'number' && point.speed >= 0) {
    return point.speed * 3.6;
  }

  if (!previousPoint) return 0;
  const seconds = Math.max(1, (point.timestamp - previousPoint.timestamp) / 1000);
  return (distanceMeters(previousPoint, point) / seconds) * 3.6;
}

async function getTrackingState() {
  const raw = await AsyncStorage.getItem(ACTIVE_DRIVE_STATE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function setTrackingState(nextState) {
  await AsyncStorage.setItem(ACTIVE_DRIVE_STATE_KEY, JSON.stringify(nextState));
}

function publishTrackingUpdate(state) {
  const distanceUnit = state.distanceUnit || 'metric';
  const elapsedMs = Date.now() - state.startTimestamp;
  const distanceText = formatDistanceFromKm((state.distance || 0) / 1000, distanceUnit);
  const speedText = formatSpeedFromKmh(state.currentSpeed || 0, distanceUnit);

  updateDrivePipStats({
    title: formatElapsed(elapsedMs),
    subtitle: `${distanceText} · ${speedText}`,
    startTimestamp: state.startTimestamp,
    distanceText,
    speedText,
  });

  DeviceEventEmitter.emit(ACTIVE_DRIVE_EVENT, {
    startTimestamp: state.startTimestamp,
    elapsedMs,
    distance: state.distance || 0,
    currentSpeed: state.currentSpeed || 0,
    maxSpeed: state.maxSpeed || 0,
    routePoints: state.routePoints || [],
    lastPoint: state.lastPoint || null,
  });
}

async function handleLocationBatch(locations) {
  if (!Array.isArray(locations) || locations.length === 0) return;

  const initialState = await getTrackingState();
  if (!initialState?.active) return;

  let state = initialState;

  for (const location of locations) {
    const point = toPoint(location);
    const previous = state.lastPoint;
    const speedKmh = getSpeedKmh(point, previous);
    let nextDistance = state.distance || 0;

    if (previous && (!point.accuracy || point.accuracy <= 80)) {
      const segment = distanceMeters(previous, point);
      if (segment < 1000) {
        nextDistance += segment;
      }
    }

    state = {
      ...state,
      distance: nextDistance,
      currentSpeed: Math.max(0, speedKmh),
      maxSpeed: Math.max(state.maxSpeed || 0, speedKmh),
      lastPoint: point,
      routePoints: [...(state.routePoints || []).slice(-199), point],
    };
  }

  await setTrackingState(state);
  publishTrackingUpdate(state);
}

if (!TaskManager.isTaskDefined(ACTIVE_DRIVE_TRACKING_TASK)) {
  TaskManager.defineTask(ACTIVE_DRIVE_TRACKING_TASK, async ({ data, error }) => {
    if (error) return;
    await handleLocationBatch(data?.locations || []);
  });
}

export function addActiveDriveTrackingListener(listener) {
  return DeviceEventEmitter.addListener(ACTIVE_DRIVE_EVENT, listener);
}

export async function requestActiveDriveTrackingPermissions() {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== 'granted') {
    return { foreground: foreground.status, background: 'not_requested', granted: false };
  }

  if (Platform.OS !== 'android') {
    return { foreground: foreground.status, background: 'not_required', granted: true };
  }

  const background = await Location.requestBackgroundPermissionsAsync();
  return {
    foreground: foreground.status,
    background: background.status,
    granted: background.status === 'granted',
  };
}

export async function isActiveDriveTrackingRunning() {
  return Location.hasStartedLocationUpdatesAsync(ACTIVE_DRIVE_TRACKING_TASK);
}

export async function startActiveDriveTracking({ startTimestamp, distanceUnit }) {
  const alreadyRunning = await isActiveDriveTrackingRunning();
  if (alreadyRunning) {
    await Location.stopLocationUpdatesAsync(ACTIVE_DRIVE_TRACKING_TASK);
  }

  const initialState = {
    active: true,
    startTimestamp,
    distanceUnit,
    distance: 0,
    currentSpeed: 0,
    maxSpeed: 0,
    routePoints: [],
    lastPoint: null,
  };
  await setTrackingState(initialState);
  publishTrackingUpdate(initialState);

  await Location.startLocationUpdatesAsync(ACTIVE_DRIVE_TRACKING_TASK, {
    accuracy: Location.Accuracy.BestForNavigation,
    activityType: Location.ActivityType.AutomotiveNavigation,
    timeInterval: 5000,
    distanceInterval: 10,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: false,
    foregroundService: {
      notificationTitle: 'Drively drive tracking is active',
      notificationBody: 'Tracking distance and speed for your current drive.',
      notificationColor: '#0f766e',
    },
  });

  return true;
}

export async function stopActiveDriveTracking() {
  const state = await getTrackingState();
  const running = await isActiveDriveTrackingRunning();

  if (running) {
    await Location.stopLocationUpdatesAsync(ACTIVE_DRIVE_TRACKING_TASK);
  }

  if (state) {
    const nextState = { ...state, active: false };
    await setTrackingState(nextState);
    publishTrackingUpdate(nextState);
    return nextState;
  }

  return null;
}

export async function clearActiveDriveTracking() {
  if (await isActiveDriveTrackingRunning()) {
    await Location.stopLocationUpdatesAsync(ACTIVE_DRIVE_TRACKING_TASK);
  }
  await AsyncStorage.removeItem(ACTIVE_DRIVE_STATE_KEY);
}

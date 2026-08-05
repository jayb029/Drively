import { DeviceEventEmitter, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { formatDistanceFromKm, formatSpeedFromKmh } from '../utils/units';
import { updateDrivePipStats } from './drivePip';

export const ACTIVE_DRIVE_TRACKING_TASK = 'drively-active-drive-tracking-v1';

const ACTIVE_DRIVE_STATE_KEY = 'drively.activeDrive.state.v1';
const ACTIVE_DRIVE_EVENT = 'DrivelyActiveDriveLocation';
const TRACKING_PERSIST_INTERVAL_MS = 15000;
const LOW_SPEED_CONFIRMATION_KMH = 4;
const LOW_SPEED_FLOOR_KMH = 0.8;

const ACTIVE_DRIVE_LOCATION_OPTIONS = {
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
};

let trackingStateCache = null;
let trackingStateWriteQueue = Promise.resolve();
let lastTrackingPersistedAt = 0;

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

function createTrackingSegment(startTimestamp) {
  return {
    startTimestamp,
    distance: 0,
    currentSpeed: 0,
    maxSpeed: 0,
    routePoints: [],
    lastPoint: null,
  };
}

function getSegmentElapsedMs(segment, now = Date.now()) {
  if (!segment?.startTimestamp) return 0;
  return Math.max(0, (segment.endTimestamp || now) - segment.startTimestamp);
}

function getTrackedElapsedMs(state, now = Date.now()) {
  const completedElapsedMs = (state.segments || [])
    .reduce((total, segment) => total + getSegmentElapsedMs(segment, now), 0);
  return completedElapsedMs + (state.currentSegment
    ? getSegmentElapsedMs(state.currentSegment, now)
    : 0);
}

function finalizeCurrentSegment(state, endTimestamp = Date.now()) {
  if (!state.currentSegment) return state;

  const completedSegment = {
    ...state.currentSegment,
    endTimestamp: Math.max(endTimestamp, state.currentSegment.startTimestamp),
    currentSpeed: 0,
  };

  return {
    ...state,
    segments: [...(state.segments || []), completedSegment],
    currentSegment: null,
    lastPoint: null,
    currentSpeed: 0,
  };
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

function getRawSpeedKmh(point, previousPoint) {
  if (typeof point.speed === 'number' && point.speed >= 0) return point.speed * 3.6;
  if (!previousPoint) return 0;
  const seconds = Math.max(1, (point.timestamp - previousPoint.timestamp) / 1000);
  return (distanceMeters(previousPoint, point) / seconds) * 3.6;
}

function getFilteredSpeed(point, previousPoint, previousLowSpeedSampleCount = 0) {
  const rawSpeedKmh = getRawSpeedKmh(point, previousPoint);
  if (rawSpeedKmh < LOW_SPEED_FLOOR_KMH) {
    return { speedKmh: 0, lowSpeedSampleCount: 0 };
  }
  if (rawSpeedKmh >= LOW_SPEED_CONFIRMATION_KMH) {
    return { speedKmh: rawSpeedKmh, lowSpeedSampleCount: 0 };
  }
  if (!previousPoint || (point.accuracy && point.accuracy > 35)) {
    return { speedKmh: 0, lowSpeedSampleCount: 0 };
  }

  const seconds = Math.max(1, (point.timestamp - previousPoint.timestamp) / 1000);
  const displacement = distanceMeters(previousPoint, point);
  const expectedDisplacement = (rawSpeedKmh / 3.6) * seconds;
  const movementLooksReal = displacement >= Math.max(1.25, expectedDisplacement * 0.45);
  const lowSpeedSampleCount = movementLooksReal ? previousLowSpeedSampleCount + 1 : 0;

  return {
    speedKmh: lowSpeedSampleCount >= 2 ? rawSpeedKmh : 0,
    lowSpeedSampleCount,
  };
}

async function getTrackingState() {
  if (trackingStateCache) return trackingStateCache;

  const raw = await AsyncStorage.getItem(ACTIVE_DRIVE_STATE_KEY);
  if (!raw) return null;

  try {
    trackingStateCache = JSON.parse(raw);
    lastTrackingPersistedAt = Date.now();
    return trackingStateCache;
  } catch {
    return null;
  }
}

async function setTrackingState(nextState, { force = false } = {}) {
  trackingStateCache = nextState;
  const now = Date.now();
  if (!force && now - lastTrackingPersistedAt < TRACKING_PERSIST_INTERVAL_MS) {
    return;
  }

  lastTrackingPersistedAt = now;
  const serializedState = JSON.stringify(nextState);
  trackingStateWriteQueue = trackingStateWriteQueue
    .catch(() => undefined)
    .then(() => AsyncStorage.setItem(ACTIVE_DRIVE_STATE_KEY, serializedState));
  await trackingStateWriteQueue;
}

function publishTrackingUpdate(state) {
  const distanceUnit = state.distanceUnit || 'metric';
  const elapsedMs = getTrackedElapsedMs(state);
  const distanceText = formatDistanceFromKm((state.distance || 0) / 1000, distanceUnit);
  const speedText = state.paused
    ? 'Paused'
    : formatSpeedFromKmh(state.currentSpeed || 0, distanceUnit);

  updateDrivePipStats({
    title: state.paused ? `Paused · ${formatElapsed(elapsedMs)}` : formatElapsed(elapsedMs),
    subtitle: `${distanceText} · ${speedText}`,
    startTimestamp: state.paused ? 0 : Date.now() - elapsedMs,
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
    paused: !!state.paused,
    segmentCount: (state.segments || []).length + (state.currentSegment ? 1 : 0),
    segments: state.segments || [],
  });
}

async function handleLocationBatch(locations) {
  if (!Array.isArray(locations) || locations.length === 0) return;

  const initialState = await getTrackingState();
  if (!initialState?.active || initialState.paused || !initialState.currentSegment) return;

  let state = initialState;

  for (const location of locations) {
    const point = toPoint(location);
    const currentSegment = state.currentSegment;
    const previous = currentSegment.lastPoint;
    const { speedKmh, lowSpeedSampleCount } = getFilteredSpeed(
      point,
      previous,
      state.lowSpeedSampleCount || 0
    );
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
      lowSpeedSampleCount,
      maxSpeed: Math.max(state.maxSpeed || 0, speedKmh),
      lastPoint: point,
      routePoints: [...(state.routePoints || []).slice(-199), point],
      currentSegment: {
        ...currentSegment,
        distance: (currentSegment.distance || 0) + (nextDistance - (state.distance || 0)),
        currentSpeed: Math.max(0, speedKmh),
        maxSpeed: Math.max(currentSegment.maxSpeed || 0, speedKmh),
        lastPoint: point,
        routePoints: [...(currentSegment.routePoints || []).slice(-199), point],
      },
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
    lowSpeedSampleCount: 0,
    maxSpeed: 0,
    routePoints: [],
    lastPoint: null,
    paused: false,
    segments: [],
    currentSegment: createTrackingSegment(startTimestamp),
  };
  await setTrackingState(initialState, { force: true });
  publishTrackingUpdate(initialState);

  await Location.startLocationUpdatesAsync(ACTIVE_DRIVE_TRACKING_TASK, ACTIVE_DRIVE_LOCATION_OPTIONS);

  return true;
}

export async function pauseActiveDriveTracking() {
  const state = await getTrackingState();
  if (!state?.active || state.paused) return state;

  if (await isActiveDriveTrackingRunning()) {
    await Location.stopLocationUpdatesAsync(ACTIVE_DRIVE_TRACKING_TASK);
  }

  const nextState = {
    ...finalizeCurrentSegment(state),
    paused: true,
  };
  await setTrackingState(nextState, { force: true });
  publishTrackingUpdate(nextState);
  return nextState;
}

export async function resumeActiveDriveTracking() {
  const state = await getTrackingState();
  if (!state?.active || !state.paused) return state;

  const nextState = {
    ...state,
    paused: false,
    currentSpeed: 0,
    lowSpeedSampleCount: 0,
    lastPoint: null,
    currentSegment: createTrackingSegment(Date.now()),
  };
  await setTrackingState(nextState, { force: true });
  publishTrackingUpdate(nextState);

  try {
    await Location.startLocationUpdatesAsync(ACTIVE_DRIVE_TRACKING_TASK, ACTIVE_DRIVE_LOCATION_OPTIONS);
  } catch (error) {
    const pausedState = {
      ...nextState,
      paused: true,
      currentSegment: null,
    };
    await setTrackingState(pausedState, { force: true });
    publishTrackingUpdate(pausedState);
    throw error;
  }

  return nextState;
}

export async function stopActiveDriveTracking() {
  const state = await getTrackingState();
  const running = await isActiveDriveTrackingRunning();

  if (running) {
    await Location.stopLocationUpdatesAsync(ACTIVE_DRIVE_TRACKING_TASK);
  }

  if (state) {
    const finalizedState = state.paused ? state : finalizeCurrentSegment(state);
    const nextState = {
      ...finalizedState,
      active: false,
      paused: false,
      currentSpeed: 0,
      elapsedMs: getTrackedElapsedMs(finalizedState),
    };
    await setTrackingState(nextState, { force: true });
    publishTrackingUpdate(nextState);
    return nextState;
  }

  return null;
}

export async function clearActiveDriveTracking() {
  if (await isActiveDriveTrackingRunning()) {
    await Location.stopLocationUpdatesAsync(ACTIVE_DRIVE_TRACKING_TASK);
  }
  trackingStateCache = null;
  lastTrackingPersistedAt = 0;
  await trackingStateWriteQueue.catch(() => undefined);
  await AsyncStorage.removeItem(ACTIVE_DRIVE_STATE_KEY);
}

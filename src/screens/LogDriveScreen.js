import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Location from 'expo-location';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useDriving } from '../contexts/DrivingContext';
import { useTheme } from '../contexts/ThemeContext';
import { SensitiveText } from '../components/SensitiveInfo';
import { logError, logUserAction } from '../utils/logger';
import {
  formatDateForDisplay,
  formatDateOfBirthFromDate,
  formatTimeForDisplay,
  calculateAge,
  getDateFromDate,
  getDateOfBirthDate,
  getMinimumDateOfBirthDate,
  getCurrentDate,
  getCurrentTime,
  getTimeFromDate,
  isNightTime,
  isValidDateOfBirth,
} from '../utils/time';
import {
  calculateNightDrivingSplit,
  calculateNightDrivingSegments,
  NIGHT_DRIVING_METHODS,
} from '../utils/nightDriving';
import { autoSelectWeatherOption, fetchWeatherData } from '../utils/weather';
import { formatDistanceFromKm, formatSpeedFromKmh, getSpeedUnitLabel } from '../utils/units';
import { haptics } from '../utils/haptics';
import {
  addDrivePipModeListener,
  isInDrivePictureInPictureMode,
  setDrivePipTrackingActive,
  updateDrivePipStats,
} from '../services/drivePip';
import {
  addActiveDriveTrackingListener,
  clearActiveDriveTracking,
  pauseActiveDriveTracking,
  requestActiveDriveTrackingPermissions,
  resumeActiveDriveTracking,
  startActiveDriveTracking,
  stopActiveDriveTracking,
} from '../services/activeDriveTracking';

function getDefaultTabBarStyle(theme, bottomInset, largeIcons) {
  const tabBarBottomInset = Math.max(bottomInset, 8);
  return {
    backgroundColor: theme.colors.surface,
    borderTopColor: theme.colors.border.light,
    borderTopWidth: 1,
    paddingBottom: tabBarBottomInset,
    paddingTop: largeIcons ? 5 : 7,
    height: (largeIcons ? 58 : 56) + tabBarBottomInset,
    elevation: 0,
  };
}

const WEATHER_OPTIONS = [
  'Clear',
  'Cloudy',
  'Rain',
  'Snow',
  'Fog',
  'Windy',
];

const COMMON_SKILLS = [
  'Parking',
  'Lane changes',
  'Intersections',
  'Merging',
  'Highway',
  'Night driving',
  'Backing up',
  'Turns',
];

const DESTINATIONS = [
  'Practice route',
  'School',
  'Work',
  'Driver education',
  'Errand',
  'Other',
];

const DRIVE_TRACKING_KEEP_AWAKE_TAG = 'drively-drive-tracking';

function getDetectionStartTimestamp(event) {
  const timestamp = Date.parse(event?.drivingStartedAt || '');
  const fallbackTimestamp = Date.parse(event?.detectedAt || '');
  const detectedTimestamp = Number.isFinite(timestamp) ? timestamp : fallbackTimestamp;
  if (!Number.isFinite(detectedTimestamp)) return null;
  return detectedTimestamp <= Date.now() ? detectedTimestamp : null;
}

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

function createElapsedClock(elapsedMs = 0, updatedAt = Date.now()) {
  return {
    elapsedMs: Math.max(0, elapsedMs),
    updatedAt,
  };
}

function readElapsedClock(clock, now = Date.now()) {
  return clock.elapsedMs + Math.max(0, now - clock.updatedAt);
}

export default function LogDriveScreen({ navigation }) {
  const {
    addDrive,
    deleteDetectedEvent,
    detectedEvents,
    settings,
    supervisorProfiles,
    updateSettings,
    updateDetectedEvent,
    user,
  } = useDriving();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const distanceUnit = settings.distanceUnit || 'metric';
  const alwaysOnWhileTracking = settings.alwaysOnWhileTracking ?? true;
  const largeBottomNavIcons = settings.largeBottomNavIcons ?? true;

  const [date, setDate] = useState(getCurrentDate());
  const [startTime, setStartTime] = useState(null);
  const [startTimestamp, setStartTimestamp] = useState(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isChangingTrackingState, setIsChangingTrackingState] = useState(false);
  const [segmentCount, setSegmentCount] = useState(1);
  const [trackedSegments, setTrackedSegments] = useState([]);

  const [selectedSupervisorId, setSelectedSupervisorId] = useState(supervisorProfiles[0]?.id || null);
  const [supervisorName, setSupervisorName] = useState('');
  const [supervisorDateOfBirth, setSupervisorDateOfBirth] = useState('');
  const [supervisorLicense, setSupervisorLicense] = useState('');
  const [destination, setDestination] = useState('Practice route');
  const [drivePeriod, setDrivePeriod] = useState(() => (
    isNightTime(getCurrentTime(), settings.nightTimeStart, settings.nightTimeEnd) ? 'Night' : 'Day'
  ));
  const [weather, setWeather] = useState('');
  const [weatherData, setWeatherData] = useState(null);
  const [skills, setSkills] = useState([]);
  const [sourceEventId, setSourceEventId] = useState(null);

  const [routePoints, setRoutePoints] = useState([]);
  const [distance, setDistance] = useState(0);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [maxSpeed, setMaxSpeed] = useState(0);
  const [loadingWeather, setLoadingWeather] = useState(false);
  const [isInPictureInPictureMode, setIsInPictureInPictureMode] = useState(false);

  const watchRef = useRef(null);
  const lastPointRef = useRef(null);
  const keepAwakeActiveRef = useRef(false);
  const elapsedClockRef = useRef(createElapsedClock());
  const lowSpeedSampleCountRef = useRef(0);

  const latestDetectedEvent = detectedEvents?.find((event) => event.status === 'new');
  const latestDetectionStartTimestamp = getDetectionStartTimestamp(latestDetectedEvent);
  const selectedSupervisor = supervisorProfiles.find((profile) => profile.id === selectedSupervisorId);
  const requiresSupervisor = user.licenseType === 'learners';
  const enteredSupervisorAge = calculateAge(supervisorDateOfBirth);

  useEffect(() => {
    if (settings.weatherEnabled ?? true) loadWeather();
    return () => {
      if (watchRef.current) {
        watchRef.current.remove();
      }
      clearActiveDriveTracking();
    };
  }, []);

  useEffect(() => {
    let interval;
    if (isActive && !isPaused) {
      const updateElapsedTime = () => {
        setElapsedMs(readElapsedClock(elapsedClockRef.current));
      };

      updateElapsedTime();
      interval = setInterval(() => {
        updateElapsedTime();
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isActive, isPaused]);

  useEffect(() => {
    setDrivePipTrackingActive(isActive && !isPaused);
    return () => setDrivePipTrackingActive(false);
  }, [isActive, isPaused]);

  useEffect(() => {
    if (!isActive || isPaused || !isInPictureInPictureMode) return;

    updateDrivePipStats({
      title: formatElapsed(elapsedMs),
      subtitle: `${formatDistanceFromKm(distance / 1000, distanceUnit)} · ${formatSpeedFromKmh(currentSpeed, distanceUnit)}`,
      startTimestamp: Date.now() - elapsedMs,
      distanceText: formatDistanceFromKm(distance / 1000, distanceUnit),
      speedText: formatSpeedFromKmh(currentSpeed, distanceUnit),
    });
  }, [currentSpeed, distance, distanceUnit, elapsedMs, isActive, isInPictureInPictureMode, isPaused]);

  useEffect(() => {
    const subscription = addActiveDriveTrackingListener((event) => {
      const nextElapsedMs = Math.max(0, Number(event.elapsedMs) || 0);
      elapsedClockRef.current = createElapsedClock(nextElapsedMs);
      setElapsedMs(nextElapsedMs);
      setDistance(event.distance);
      setCurrentSpeed(event.currentSpeed);
      setMaxSpeed(event.maxSpeed);
      setRoutePoints(event.routePoints || []);
      lastPointRef.current = event.lastPoint || null;
      setIsPaused(!!event.paused);
      setSegmentCount(Math.max(1, event.segmentCount || 1));
      setTrackedSegments(event.segments || []);
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;

    isInDrivePictureInPictureMode().then(setIsInPictureInPictureMode);
  }, [isActive]);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;

    const subscription = addDrivePipModeListener((event) => {
      const nextIsInPictureInPictureMode = !!event?.isInPictureInPictureMode;
      setIsInPictureInPictureMode(nextIsInPictureInPictureMode);

      if (nextIsInPictureInPictureMode) {
        navigation.navigate('LogDrive');
      }
    });

    return () => subscription.remove();
  }, [navigation]);

  useEffect(() => {
    navigation.setOptions({
      tabBarStyle: isActive || isInPictureInPictureMode
        ? styles.hiddenTabBar
        : getDefaultTabBarStyle(theme, insets.bottom, largeBottomNavIcons),
    });
  }, [insets.bottom, isActive, isInPictureInPictureMode, largeBottomNavIcons, navigation, styles, theme]);

  useEffect(() => {
    let cancelled = false;

    const stopKeepingAwake = () => {
      if (!keepAwakeActiveRef.current) return;
      keepAwakeActiveRef.current = false;
      try {
        deactivateKeepAwake(DRIVE_TRACKING_KEEP_AWAKE_TAG);
      } catch (error) {
        logError(error, 'TRACKING', 'Unable to release the screen wake lock');
      }
    };

    if (!isActive || isPaused || !alwaysOnWhileTracking) {
      stopKeepingAwake();
      return undefined;
    }

    activateKeepAwakeAsync(DRIVE_TRACKING_KEEP_AWAKE_TAG)
      .then(() => {
        if (cancelled) {
          try {
            deactivateKeepAwake(DRIVE_TRACKING_KEEP_AWAKE_TAG);
          } catch (error) {
            logError(error, 'TRACKING', 'Unable to release the screen wake lock');
          }
          return;
        }
        keepAwakeActiveRef.current = true;
      })
      .catch((error) => {
        logError(error, 'TRACKING', 'Unable to keep screen awake while tracking');
      });

    return () => {
      cancelled = true;
      stopKeepingAwake();
    };
  }, [alwaysOnWhileTracking, isActive, isPaused]);

  const loadWeather = async () => {
    if (!(settings.weatherEnabled ?? true)) return;
    try {
      setLoadingWeather(true);
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') return;

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const units = settings.temperatureUnit || 'metric';
      const nextWeather = await fetchWeatherData(
        location.coords.latitude,
        location.coords.longitude,
        units
      );
      setWeatherData(nextWeather);
      if (!nextWeather.isFallback) {
        setWeather(autoSelectWeatherOption(nextWeather.description, nextWeather.isNight).replace(/^[^\w]+ /, ''));
      }
    } catch (error) {
      logError(error, 'TRACKING', 'Unable to load weather for drive');
    } finally {
      setLoadingWeather(false);
    }
  };

  const handleLocationUpdate = (location) => {
    const point = {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: location.coords.accuracy,
      timestamp: location.timestamp || Date.now(),
      speed: location.coords.speed,
    };
    const previous = lastPointRef.current;
    const rawSpeedKmh = typeof point.speed === 'number' && point.speed >= 0
      ? point.speed * 3.6
      : previous
        ? (distanceMeters(previous, point) / Math.max(1, (point.timestamp - previous.timestamp) / 1000)) * 3.6
        : 0;
    const seconds = previous ? Math.max(1, (point.timestamp - previous.timestamp) / 1000) : 1;
    const displacement = previous ? distanceMeters(previous, point) : 0;
    const lowSpeedMovementLooksReal = previous
      && (!point.accuracy || point.accuracy <= 35)
      && displacement >= Math.max(1.25, ((rawSpeedKmh / 3.6) * seconds) * 0.45);
    if (rawSpeedKmh < 0.8 || rawSpeedKmh >= 4) {
      lowSpeedSampleCountRef.current = 0;
    } else {
      lowSpeedSampleCountRef.current = lowSpeedMovementLooksReal
        ? lowSpeedSampleCountRef.current + 1
        : 0;
    }
    const speedKmh = rawSpeedKmh >= 4 || (rawSpeedKmh >= 0.8 && lowSpeedSampleCountRef.current >= 2)
      ? rawSpeedKmh
      : 0;

    if (previous && (!point.accuracy || point.accuracy <= 80)) {
      const segment = distanceMeters(previous, point);
      if (segment < 1000) {
        setDistance((value) => value + segment);
      }
    }

    lastPointRef.current = point;
    setCurrentSpeed(Math.max(0, speedKmh));
    setMaxSpeed((value) => Math.max(value, speedKmh));
    setRoutePoints((points) => [...points.slice(-199), point]);
  };

  const startDrive = async ({ detectionEvent = null, fromDetection = false } = {}) => {
    const supervisor = selectedSupervisor || {
      name: supervisorName.trim(),
      dateOfBirth: supervisorDateOfBirth.trim(),
      age: enteredSupervisorAge,
      licenseNumber: supervisorLicense.trim(),
    };

    if (requiresSupervisor && !supervisor.name) {
      Alert.alert('Supervisor required', 'Choose or enter a supervisor before starting this drive.');
      return false;
    }

    if (!selectedSupervisor && supervisor.dateOfBirth && !isValidDateOfBirth(supervisor.dateOfBirth)) {
      Alert.alert('Invalid date of birth', 'Enter the supervisor date of birth as MM/DD/YYYY.');
      return false;
    }

    const supervisorAge = getSupervisorAge(supervisor);
    if (supervisorAge !== null && supervisorAge < 21) {
      Alert.alert('Invalid supervisor', 'The supervising driver must be at least 21.');
      return false;
    }

    const permission = await requestActiveDriveTrackingPermissions();
    if (!permission.granted) {
      Alert.alert(
        'Location needed',
        Platform.OS === 'android'
          ? 'Allow background location so drive tracking can continue while Picture-in-Picture is open.'
          : 'Location access is required for live drive tracking.'
      );
      return false;
    }

    const detectedStartTimestamp = fromDetection ? getDetectionStartTimestamp(detectionEvent) : null;
    const nextStartTimestamp = detectedStartTimestamp || Date.now();
    const nextElapsedMs = Math.max(0, Date.now() - nextStartTimestamp);

    setDate(detectedStartTimestamp ? getDateFromDate(nextStartTimestamp) : getCurrentDate());
    setStartTime(detectedStartTimestamp ? getTimeFromDate(nextStartTimestamp) : getCurrentTime());
    setStartTimestamp(nextStartTimestamp);
    elapsedClockRef.current = createElapsedClock(nextElapsedMs);
    setElapsedMs(nextElapsedMs);
    setDistance(0);
    setCurrentSpeed(0);
    setMaxSpeed(0);
    setRoutePoints([]);
    setTrackedSegments([]);
    setSegmentCount(1);
    setIsPaused(false);
    lastPointRef.current = null;
    lowSpeedSampleCountRef.current = 0;
    try {
      await startActiveDriveTracking({
        startTimestamp: nextStartTimestamp,
        distanceUnit,
      });
    } catch (error) {
      logError(error, 'TRACKING', 'Unable to start live drive tracking');
      Alert.alert('Tracking Error', 'Could not start live drive tracking. Check location settings and try again.');
      setStartTime(null);
      setStartTimestamp(null);
      elapsedClockRef.current = createElapsedClock();
      setElapsedMs(0);
      setRoutePoints([]);
      lastPointRef.current = null;
      return false;
    }

    setIsActive(true);
    haptics.important();
    logUserAction(fromDetection ? 'start_detected_drive' : 'start_drive', 'LOG_DRIVE');

    return true;
  };

  const resetForm = () => {
    setDate(getCurrentDate());
    setStartTime(null);
    setStartTimestamp(null);
    elapsedClockRef.current = createElapsedClock();
    setElapsedMs(0);
    setDistance(0);
    setCurrentSpeed(0);
    setMaxSpeed(0);
    setRoutePoints([]);
    setSkills([]);
    setDrivePeriod(isNightTime(getCurrentTime(), settings.nightTimeStart, settings.nightTimeEnd) ? 'Night' : 'Day');
    setSourceEventId(null);
    setIsActive(false);
    setIsPaused(false);
    setSegmentCount(1);
    setTrackedSegments([]);
    setDrivePipTrackingActive(false);
    clearActiveDriveTracking();
    setSupervisorDateOfBirth('');
    lastPointRef.current = null;
    lowSpeedSampleCountRef.current = 0;
  };

  const buildDriveRecord = ({
    finalDistance,
    finalElapsedMs,
    finalEndTime,
    finalEndTimestamp,
    finalMaxSpeed,
    finalRoutePoints,
    finalSegments,
    finalStartTimestamp,
    split,
  }) => {
    const supervisor = selectedSupervisor || {
      name: supervisorName.trim(),
      dateOfBirth: supervisorDateOfBirth.trim(),
      age: enteredSupervisorAge,
      licenseNumber: supervisorLicense.trim(),
    };
    const supervisorAge = getSupervisorAge(supervisor);
    const duration = Math.max(1, Math.round(finalElapsedMs / 60000));
    const driveId = Date.now().toString();
    const trackingSegments = finalSegments?.length ? finalSegments : [{
      startTimestamp: finalStartTimestamp,
      endTimestamp: finalEndTimestamp,
      distance: finalDistance,
      maxSpeed: finalMaxSpeed,
      routePoints: finalRoutePoints,
    }];
    const segments = trackingSegments.map((segment, index) => {
      const segmentDurationMs = Math.max(0, segment.endTimestamp - segment.startTimestamp);
      const segmentDurationHours = Math.max(segmentDurationMs / 3600000, 0.0001);
      const segmentDistanceKm = (segment.distance || 0) / 1000;
      const segmentStartTime = getTimeFromDate(segment.startTimestamp);
      const segmentEndTime = getTimeFromDate(segment.endTimestamp);
      const segmentSplit = calculateNightDrivingSplit({
        debugOverride: drivePeriod.toLowerCase(),
        durationMinutes: Math.max(1, Math.round(segmentDurationMs / 60000)),
        endTimestamp: segment.endTimestamp,
        method: settings.nightDrivingMethod || NIGHT_DRIVING_METHODS.CIVIL_TWILIGHT,
        nightEnd: settings.nightTimeEnd,
        nightStart: settings.nightTimeStart,
        routePoints: segment.routePoints || [],
        startTimestamp: segment.startTimestamp,
      });
      const classificationSegments = calculateNightDrivingSegments({
        debugOverride: drivePeriod.toLowerCase(),
        endTimestamp: segment.endTimestamp,
        method: settings.nightDrivingMethod || NIGHT_DRIVING_METHODS.CIVIL_TWILIGHT,
        nightEnd: settings.nightTimeEnd,
        nightStart: settings.nightTimeStart,
        routePoints: segment.routePoints || [],
        startTimestamp: segment.startTimestamp,
      }).map((classificationSegment, classificationIndex) => ({
        ...classificationSegment,
        id: `${driveId}-segment-${index + 1}-classification-${classificationIndex + 1}`,
        trackingSegmentIndex: index + 1,
        startTime: getTimeFromDate(classificationSegment.startTimestamp),
        endTime: getTimeFromDate(classificationSegment.endTimestamp),
      }));

      return {
        id: `${driveId}-segment-${index + 1}`,
        startTimestamp: segment.startTimestamp,
        endTimestamp: segment.endTimestamp,
        startTime: segmentStartTime,
        endTime: segmentEndTime,
        durationMinutes: Number((segmentDurationMs / 60000).toFixed(2)),
        dayMinutes: segmentSplit.dayMinutes,
        nightMinutes: segmentSplit.nightMinutes,
        isNightDrive: segmentSplit.isNightDrive,
        nightCalculation: segmentSplit.nightCalculation,
        classificationSegments,
        routeSummary: {
          distanceKm: Number(segmentDistanceKm.toFixed(2)),
          averageSpeedKmh: Number((segmentDistanceKm / segmentDurationHours).toFixed(1)),
          maxSpeedKmh: Math.round(segment.maxSpeed || 0),
          samples: segment.routePoints?.length || 0,
        },
        routePreview: (segment.routePoints || []).filter((_, pointIndex) => pointIndex % 5 === 0).slice(-40),
      };
    });

    return {
      id: driveId,
      date,
      startTime,
      endTime: finalEndTime,
      startedAt: new Date(finalStartTimestamp).toISOString(),
      endedAt: new Date(finalEndTimestamp).toISOString(),
      duration,
      dayMinutes: split.dayMinutes,
      nightMinutes: split.nightMinutes,
      isNightDrive: split.isNightDrive,
      nightCalculation: split.nightCalculation,
      weather: weather || null,
      weatherData,
      skills: skills.length ? skills.join(', ') : null,
      supervisorId: selectedSupervisorId,
      supervisorName: supervisor.name || null,
      supervisorDateOfBirth: supervisor.dateOfBirth || supervisor.birthDate || supervisor.dob || null,
      supervisorAge,
      supervisorLicense: supervisor.licenseNumber || null,
      destination,
      source: sourceEventId ? 'detected' : 'manual',
      routeSummary: {
        distanceKm: Number((finalDistance / 1000).toFixed(2)),
        averageSpeedKmh: Number(((finalDistance / 1000) / Math.max(finalElapsedMs / 3600000, 0.0001)).toFixed(1)),
        maxSpeedKmh: Math.round(finalMaxSpeed),
        samples: finalRoutePoints.length,
      },
      routePreview: finalRoutePoints.filter((_, index) => index % 5 === 0).slice(-40),
      segments,
      classificationSegments: segments.flatMap((segment) => segment.classificationSegments || []),
    };
  };

  const finishDrive = async (shouldSave) => {
    if (isStopping || isChangingTrackingState) return;

    setIsStopping(true);
    try {
      const state = await stopActiveDriveTracking();
      const lastSegment = state?.segments?.[state.segments.length - 1];
      const finalEndTimestamp = lastSegment?.endTimestamp || Date.now();
      const finalEndTime = lastSegment?.endTimestamp
        ? getTimeFromDate(lastSegment.endTimestamp)
        : getCurrentTime();
      const finalElapsedMs = state?.elapsedMs ?? elapsedMs;
      const finalDistance = state?.distance ?? distance;
      const finalMaxSpeed = state?.maxSpeed ?? maxSpeed;
      const finalRoutePoints = state?.routePoints ?? routePoints;
      const finalSegments = state?.segments ?? trackedSegments;

      logUserAction('stop_drive', 'LOG_DRIVE');

      if (shouldSave) {
        const activeSegments = finalSegments?.length ? finalSegments : [{
          startTimestamp,
          endTimestamp: finalEndTimestamp,
          routePoints: finalRoutePoints,
        }];
        const segmentSplits = activeSegments.map((segment) => calculateNightDrivingSplit({
          debugOverride: drivePeriod.toLowerCase(),
          durationMinutes: Math.max(1, Math.round((segment.endTimestamp - segment.startTimestamp) / 60000)),
          endTimestamp: segment.endTimestamp,
          method: settings.nightDrivingMethod || NIGHT_DRIVING_METHODS.CIVIL_TWILIGHT,
          nightEnd: settings.nightTimeEnd,
          nightStart: settings.nightTimeStart,
          routePoints: segment.routePoints || [],
          startTimestamp: segment.startTimestamp,
        }));
        const duration = Math.max(1, Math.round(finalElapsedMs / 60000));
        const calculatedNightMinutes = Math.min(
          duration,
          segmentSplits.reduce((total, segmentSplit) => total + segmentSplit.nightMinutes, 0)
        );
        const primaryCalculation = segmentSplits[0]?.nightCalculation || {};
        const split = {
          dayMinutes: duration - calculatedNightMinutes,
          nightMinutes: calculatedNightMinutes,
          isNightDrive: calculatedNightMinutes > 0,
          nightCalculation: {
            ...primaryCalculation,
            automaticNightMinutes: calculatedNightMinutes,
            manuallyAdjusted: false,
            source: activeSegments.length > 1 ? 'route_segments' : primaryCalculation.source,
          },
        };
        const drive = buildDriveRecord({
          finalDistance,
          finalElapsedMs,
          finalEndTime,
          finalEndTimestamp,
          finalMaxSpeed,
          finalRoutePoints,
          finalSegments,
          finalStartTimestamp: startTimestamp,
          split,
        });
        addDrive(drive);
        haptics.success();
        if (sourceEventId) {
          updateDetectedEvent({ id: sourceEventId, status: 'logged', loggedAt: new Date().toISOString() });
        }
        logUserAction('save_drive', 'LOG_DRIVE', {
          dayMinutes: split.dayMinutes,
          nightMinutes: split.nightMinutes,
          method: split.nightCalculation?.methodUsed,
        });
        resetForm();
        Alert.alert(
          'Drive saved',
          `${split.dayMinutes} min day · ${split.nightMinutes} min night`,
          [
            { text: 'Edit split', onPress: () => navigation.navigate('DriveHistory', { editDriveId: drive.id }) },
            { text: 'Done', onPress: () => navigation.navigate('Dashboard') },
          ],
          { cancelable: false }
        );
      } else {
        haptics.warning();
        if (sourceEventId) {
          deleteDetectedEvent(sourceEventId);
        }
        logUserAction('discard_drive', 'LOG_DRIVE');
      }

      if (!shouldSave) {
        resetForm();
        navigation.navigate('Dashboard');
      }
    } catch (error) {
      logError(error, 'TRACKING', 'Unable to stop live drive tracking');
      Alert.alert('Could not end drive', 'Drive tracking is still active. Try again.');
    } finally {
      setIsStopping(false);
    }
  };

  const pauseDrive = async () => {
    if (isStopping || isChangingTrackingState || isPaused) return;

    setIsChangingTrackingState(true);
    try {
      await pauseActiveDriveTracking();
      haptics.action();
      logUserAction('pause_drive', 'LOG_DRIVE');
    } catch (error) {
      logError(error, 'TRACKING', 'Unable to pause live drive tracking');
      Alert.alert('Could not pause drive', 'Tracking is still active. Try again.');
    } finally {
      setIsChangingTrackingState(false);
    }
  };

  const resumeDrive = async () => {
    if (isStopping || isChangingTrackingState || !isPaused) return;

    setIsChangingTrackingState(true);
    try {
      await resumeActiveDriveTracking();
      haptics.action();
      logUserAction('resume_drive', 'LOG_DRIVE');
    } catch (error) {
      logError(error, 'TRACKING', 'Unable to resume live drive tracking');
      Alert.alert('Could not resume drive', 'Location tracking could not restart. Check location settings and try again.');
    } finally {
      setIsChangingTrackingState(false);
    }
  };

  const confirmDiscardDrive = () => {
    Alert.alert(
      'Discard this drive?',
      'This drive will not be saved to your log. This cannot be undone.',
      [
        { text: 'No', style: 'cancel', onPress: () => setTimeout(confirmEndDrive, 0) },
        { text: 'Yes', style: 'destructive', onPress: () => finishDrive(false) },
      ],
      { cancelable: false }
    );
  };

  const confirmEndDrive = () => {
    if (isStopping || isChangingTrackingState) return;

    Alert.alert(
      'End this drive?',
      segmentCount > 1
        ? `Save all ${segmentCount} segments as one grouped logbook entry, or end without saving.`
        : isPaused
          ? 'Save this paused drive to your log, or end it without saving.'
          : 'Save it to your log, or end it without saving. Tracking continues until you choose.',
      [
        { text: 'Keep driving', style: 'cancel' },
        { text: 'End without saving', style: 'destructive', onPress: confirmDiscardDrive },
        { text: 'Save drive', onPress: () => finishDrive(true) },
      ]
    );
  };

  const useDetectedEvent = async () => {
    if (!latestDetectedEvent) return;
    const didStart = await startDrive({ detectionEvent: latestDetectedEvent, fromDetection: true });
    if (!didStart) return;

    setSourceEventId(latestDetectedEvent.id);
    updateDetectedEvent({ id: latestDetectedEvent.id, status: 'opened' });
  };

  const removeDetectedEvent = () => {
    if (!latestDetectedEvent) return;

    Alert.alert(
      'Remove detected drive?',
      'Remove this detected drive if it was not your drive.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => deleteDetectedEvent(latestDetectedEvent.id),
        },
      ]
    );
  };

  const toggleSkill = (skill) => {
    setSkills((current) =>
      current.includes(skill) ? current.filter((item) => item !== skill) : [...current, skill]
    );
  };

  const openSupervisorDateOfBirthPicker = () => {
    DateTimePickerAndroid.open({
      value: getDateOfBirthDate(supervisorDateOfBirth) || new Date(1980, 0, 1),
      mode: 'date',
      minimumDate: getMinimumDateOfBirthDate(),
      maximumDate: new Date(),
      onChange: (event, selectedDate) => {
        if (event.type !== 'set' || !selectedDate) return;
        setSupervisorDateOfBirth(formatDateOfBirthFromDate(selectedDate));
      },
    });
  };

  if (isInPictureInPictureMode && isActive && !isPaused) {
    return (
      <View style={styles.pipContainer}>
        <View style={styles.pipHeader}>
          <Icon name="car-clock" size={18} color={theme.colors.secondaryLight} />
          <Text style={styles.pipStatus}>Tracking</Text>
        </View>
        <Text style={styles.pipElapsed}>{formatElapsed(elapsedMs)}</Text>
        <View style={styles.pipStats}>
          <View style={styles.pipStat}>
            <Text style={styles.pipStatValue}>{formatDistanceFromKm(distance / 1000, distanceUnit)}</Text>
            <Text style={styles.pipStatLabel}>Distance</Text>
          </View>
          <View style={styles.pipDivider} />
          <View style={styles.pipStat}>
            <Text style={styles.pipStatValue}>{formatSpeedFromKmh(currentSpeed, distanceUnit)}</Text>
            <Text style={styles.pipStatLabel}>Speed</Text>
          </View>
        </View>
      </View>
    );
  }

  if (isActive) {
    const displaySpeed = distanceUnit === 'imperial'
      ? currentSpeed * 0.621371
      : currentSpeed;
    const isBusy = isStopping || isChangingTrackingState;

    return (
      <SafeAreaView style={[styles.activeContainer, isPaused && styles.pausedContainer]}>
        <View style={styles.activeContent}>
          <View style={styles.activeHeader}>
            <View style={styles.activeStatus}>
              <Icon name={isPaused ? 'pause-circle-outline' : 'car-clock'} size={22} color="#E9C79F" />
              <View>
                <Text style={styles.activeTitle}>{isPaused ? 'Drive paused' : 'Drive in progress'}</Text>
                <Text style={styles.activeStarted}>
                  Started {formatTimeForDisplay(startTime)} · Segment {segmentCount}
                </Text>
              </View>
            </View>
            <Text style={styles.activeElapsed}>{formatElapsed(elapsedMs)}</Text>
          </View>

          {isPaused ? (
            <View style={styles.pausedReadout} accessible accessibilityLabel={`Drive paused after ${segmentCount} segments`}>
              <Icon name="pause" size={54} color="#E9C79F" />
              <Text style={styles.pausedReadoutTitle}>Paused</Text>
              <Text style={styles.pausedReadoutBody}>
                Resume to begin segment {segmentCount + 1}
              </Text>
            </View>
          ) : (
            <View style={styles.speedReadout} accessible accessibilityLabel={`Current speed ${formatSpeedFromKmh(currentSpeed, distanceUnit)}`}>
              <Text style={styles.speedLabel}>Current speed</Text>
              <Text style={styles.speedValue}>{Math.round(displaySpeed)}</Text>
              <Text style={styles.speedUnit}>{getSpeedUnitLabel(distanceUnit)}</Text>
            </View>
          )}

          <View style={styles.activeMetrics}>
            <ActiveMetric
              icon="map-marker-distance"
              label="Distance"
              value={formatDistanceFromKm(distance / 1000, distanceUnit)}
              styles={styles}
            />
            <View style={styles.activeMetricDivider} />
            <ActiveMetric
              icon="speedometer"
              label="Max speed"
              value={formatSpeedFromKmh(maxSpeed, distanceUnit)}
              styles={styles}
            />
          </View>

          <View style={styles.activeFooter}>
            {isPaused ? (
              <TouchableOpacity
                style={[styles.resumeDriveButton, isBusy && styles.endDriveButtonDisabled]}
                onPress={resumeDrive}
                disabled={isBusy}
                accessibilityRole="button"
                accessibilityLabel="Resume drive and start a new segment"
              >
                {isChangingTrackingState ? (
                  <ActivityIndicator color="#F2F3EE" />
                ) : (
                  <Icon name="play" size={24} color="#F2F3EE" />
                )}
                <Text style={styles.endDriveButtonText}>{isChangingTrackingState ? 'Resuming' : 'Resume drive'}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.pauseDriveButton, isBusy && styles.endDriveButtonDisabled]}
                onPress={pauseDrive}
                disabled={isBusy}
                accessibilityRole="button"
                accessibilityLabel="Pause drive and finish this segment"
              >
                {isChangingTrackingState ? (
                  <ActivityIndicator color="#151815" />
                ) : (
                  <Icon name="pause" size={24} color="#151815" />
                )}
                <Text style={styles.pauseDriveButtonText}>{isChangingTrackingState ? 'Pausing' : 'Pause drive'}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.endDriveSecondaryButton, isBusy && styles.endDriveButtonDisabled]}
              onPress={confirmEndDrive}
              disabled={isBusy}
              accessibilityRole="button"
              accessibilityLabel="End drive"
            >
              {isStopping ? <ActivityIndicator color="#E78A7F" /> : <Icon name="stop" size={20} color="#E78A7F" />}
              <Text style={styles.endDriveSecondaryText}>{isStopping ? 'Ending drive' : 'End drive'}</Text>
            </TouchableOpacity>
            <Text style={styles.activeFooterText}>
              {segmentCount > 1
                ? `${segmentCount} segments will be saved together.`
                : 'Pausing ends this segment without ending the grouped drive.'}
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Log Drive</Text>
            <Text style={styles.subtitle}>{formatDateForDisplay(date)}</Text>
          </View>
          {(settings.weatherEnabled ?? true) && <TouchableOpacity style={styles.iconButton} onPress={loadWeather}>
            {loadingWeather ? (
              <ActivityIndicator color={theme.colors.primary} />
            ) : (
              <Icon name="weather-partly-cloudy" size={22} color={theme.colors.primary} />
            )}
          </TouchableOpacity>}
        </View>

        {latestDetectedEvent && !isActive && !startTime && (
          <View style={styles.notice}>
            <Icon name="radar" size={20} color={theme.colors.primary} />
            <View style={styles.noticeText}>
              <Text style={styles.noticeTitle}>Detected drive waiting</Text>
              <Text style={styles.noticeBody}>
                Movement was detected at about {formatSpeedFromKmh(latestDetectedEvent.speedKmh, distanceUnit)}.
                {latestDetectionStartTimestamp
                  ? ` Start time can be backfilled to ${formatTimeForDisplay(getTimeFromDate(latestDetectionStartTimestamp))}.`
                  : ''}
              </Text>
            </View>
            <View style={styles.noticeActions}>
              <TouchableOpacity style={styles.smallIconButton} onPress={removeDetectedEvent} accessibilityLabel="Remove detected drive">
                <Icon name="trash-can-outline" size={18} color={theme.colors.error} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.smallButton} onPress={useDetectedEvent}>
                <Text style={styles.smallButtonText}>Use</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.alwaysOnCard}>
          <View style={styles.alwaysOnText}>
            <Text style={styles.alwaysOnTitle}>Always On While Tracking</Text>
            <Text style={styles.alwaysOnBody}>
              Keep the screen awake during an active drive so live tracking continues reliably.
            </Text>
          </View>
          <Switch
            value={alwaysOnWhileTracking}
            onValueChange={(value) => updateSettings({ alwaysOnWhileTracking: value })}
            trackColor={{ false: theme.colors.switchControl.trackOff, true: theme.colors.switchControl.trackOn }}
            thumbColor={alwaysOnWhileTracking ? theme.colors.switchControl.thumbOn : theme.colors.switchControl.thumbOff}
          />
        </View>

        <Section title="Supervisor" styles={styles}>
          {supervisorProfiles.length > 0 && (
            <View style={styles.profileList}>
              {supervisorProfiles.map((profile) => (
                <TouchableOpacity
                  key={profile.id}
                  style={[
                    styles.choice,
                    selectedSupervisorId === profile.id && styles.choiceSelected,
                  ]}
                  onPress={() => setSelectedSupervisorId(profile.id)}
                >
                  <SensitiveText
                    value={profile.name}
                    textStyle={[
                      styles.choiceText,
                      selectedSupervisorId === profile.id && styles.choiceTextSelected,
                    ]}
                    revealLabel="Supervisor name"
                    numberOfLines={1}
                    forceVisible
                  />
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.choice, !selectedSupervisorId && styles.choiceSelected]}
                onPress={() => setSelectedSupervisorId(null)}
              >
                <Text style={[styles.choiceText, !selectedSupervisorId && styles.choiceTextSelected]}>
                  New
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {!selectedSupervisorId && (
            <View style={styles.formGrid}>
              <Text style={styles.fieldLabel}>Full name</Text>
              <TextInput
                style={styles.input}
                value={supervisorName}
                onChangeText={setSupervisorName}
                placeholder="Supervisor name"
                placeholderTextColor={theme.colors.text.light}
              />
              <Text style={styles.fieldLabel}>Date of birth</Text>
              <TouchableOpacity style={styles.datePickerButton} onPress={openSupervisorDateOfBirthPicker}>
                <Text style={[styles.datePickerText, !supervisorDateOfBirth && styles.datePickerPlaceholder]}>
                  {supervisorDateOfBirth || 'Date of birth'}
                </Text>
                <Icon name="calendar-month-outline" size={20} color={theme.colors.text.secondary} />
              </TouchableOpacity>
              <View style={styles.calculatedField}>
                <Text style={styles.calculatedLabel}>Age</Text>
                <Text style={styles.calculatedValue}>{enteredSupervisorAge === null ? 'Enter DOB' : String(enteredSupervisorAge)}</Text>
              </View>
              <Text style={styles.fieldLabel}>License number</Text>
              <TextInput
                style={styles.input}
                value={supervisorLicense}
                onChangeText={setSupervisorLicense}
                placeholder="License number optional"
                placeholderTextColor={theme.colors.text.light}
                autoCapitalize="characters"
              />
              <TouchableOpacity
                style={styles.profileMenuButton}
                onPress={() => navigation.navigate('Supervisors')}
              >
                <Icon name="content-save-outline" size={18} color={theme.colors.primary} />
                <Text style={styles.profileMenuButtonText}>Save this person in Profiles</Text>
              </TouchableOpacity>
            </View>
          )}
        </Section>

        <Section title="Drive Details" styles={styles}>
          <Text style={styles.fieldLabel}>Driving period</Text>
          <ChoiceList value={drivePeriod} values={['Day', 'Night']} onChange={setDrivePeriod} styles={styles} />
          <Text style={styles.fieldLabel}>Destination</Text>
          <ChoiceList value={destination} values={DESTINATIONS} onChange={setDestination} styles={styles} />
          <Text style={styles.fieldLabel}>Weather</Text>
          <ChoiceList value={weather} values={WEATHER_OPTIONS} onChange={setWeather} styles={styles} />
          {weatherData && (settings.weatherEnabled ?? true) && (
            <Text style={styles.helperText}>
              {weatherData.location}: {weatherData.description}, {weatherData.temperature}
            </Text>
          )}
        </Section>

        <Section title="Practice" styles={styles}>
          <ChoiceList value={skills} values={COMMON_SKILLS} onChange={toggleSkill} styles={styles} multi />
        </Section>

        <TouchableOpacity
          accessibilityLabel="Start drive"
          accessibilityRole="button"
          style={styles.primaryButton}
          onPress={() => startDrive()}
        >
          <Icon name="play" size={20} color={theme.colors.text.inverse} />
          <Text style={styles.primaryButtonText}>Start drive</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function ActiveMetric({ icon, label, styles, value }) {
  return (
    <View style={styles.activeMetric}>
      <Icon name={icon} size={22} color="#E9C79F" />
      <Text style={styles.activeMetricValue}>{value}</Text>
      <Text style={styles.activeMetricLabel}>{label}</Text>
    </View>
  );
}

function Section({ children, styles, title }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function ChoiceList({ multi, onChange, styles, value, values }) {
  return (
    <View style={styles.choiceList}>
      {values.map((item) => {
        const selected = multi ? value.includes(item) : value === item;
        return (
          <TouchableOpacity
            key={item}
            style={[styles.choice, selected && styles.choiceSelected]}
            onPress={() => {
              if (!selected || multi) haptics.selection();
              onChange(item);
            }}
          >
            <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{item}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function getSupervisorAge(supervisor) {
  return calculateAge(supervisor.dateOfBirth || supervisor.birthDate || supervisor.dob) ?? supervisor.age ?? null;
}

function createStyles(theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    content: {
      padding: 20,
      paddingBottom: 24,
      gap: 20,
    },
    hiddenTabBar: {
      display: 'none',
      height: 0,
    },
    activeContainer: {
      flex: 1,
      backgroundColor: '#151815',
    },
    pausedContainer: {
      backgroundColor: '#1D1C18',
    },
    activeContent: {
      flex: 1,
      paddingHorizontal: 24,
      paddingTop: 22,
      paddingBottom: 20,
      justifyContent: 'space-between',
    },
    activeHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 20,
    },
    activeStatus: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    activeTitle: {
      color: '#F2F3EE',
      fontFamily: theme.typography.families.display,
      fontSize: 19,
      fontWeight: '700',
    },
    activeStarted: {
      color: '#B3B9B1',
      fontSize: 12,
      marginTop: 1,
    },
    activeElapsed: {
      color: '#F2F3EE',
      fontFamily: theme.typography.families.utility,
      fontVariant: ['tabular-nums'],
      fontSize: 23,
      fontWeight: '800',
    },
    speedReadout: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
    },
    speedLabel: {
      color: '#B3B9B1',
      fontSize: 15,
      fontWeight: '600',
      marginBottom: -6,
    },
    speedValue: {
      color: '#F2F3EE',
      fontFamily: theme.typography.families.utility,
      fontVariant: ['tabular-nums'],
      fontSize: 112,
      fontWeight: '800',
      letterSpacing: -5,
      lineHeight: 122,
    },
    speedUnit: {
      color: '#E9C79F',
      fontFamily: theme.typography.families.utility,
      fontSize: 20,
      fontWeight: '700',
      marginTop: -8,
    },
    pausedReadout: {
      flex: 1,
      minHeight: 210,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 24,
    },
    pausedReadoutTitle: {
      color: '#F2F3EE',
      fontFamily: theme.typography.families.display,
      fontSize: 42,
      fontWeight: '800',
      marginTop: 4,
    },
    pausedReadoutBody: {
      color: '#B3B9B1',
      fontSize: 14,
      fontWeight: '600',
      marginTop: 6,
    },
    activeMetrics: {
      minHeight: 112,
      flexDirection: 'row',
      alignItems: 'center',
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: '#373D37',
    },
    activeMetric: {
      flex: 1,
      alignItems: 'center',
      gap: 4,
      paddingVertical: 17,
    },
    activeMetricValue: {
      color: '#F2F3EE',
      fontFamily: theme.typography.families.utility,
      fontVariant: ['tabular-nums'],
      fontSize: 24,
      fontWeight: '800',
    },
    activeMetricLabel: {
      color: '#B3B9B1',
      fontSize: 12,
      fontWeight: '600',
    },
    activeMetricDivider: {
      width: 1,
      height: 58,
      backgroundColor: '#373D37',
    },
    activeFooter: {
      gap: 9,
    },
    pauseDriveButton: {
      minHeight: 64,
      borderRadius: 8,
      backgroundColor: '#E9C79F',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
    pauseDriveButtonText: {
      color: '#151815',
      fontSize: 18,
      fontWeight: '800',
    },
    resumeDriveButton: {
      minHeight: 64,
      borderRadius: 8,
      backgroundColor: '#55745D',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
    endDriveSecondaryButton: {
      minHeight: 50,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#6B3B35',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    endDriveSecondaryText: {
      color: '#E78A7F',
      fontSize: 15,
      fontWeight: '700',
    },
    endDriveButtonDisabled: {
      opacity: 0.65,
    },
    endDriveButtonText: {
      color: '#F2F3EE',
      fontSize: 18,
      fontWeight: '800',
    },
    activeFooterText: {
      color: '#858D85',
      fontSize: 12,
      textAlign: 'center',
    },
    pipContainer: {
      flex: 1,
      backgroundColor: '#151815',
      paddingHorizontal: 18,
      paddingVertical: 12,
      justifyContent: 'center',
      gap: 8,
    },
    pipHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    pipStatus: {
      color: '#E9C79F',
      fontSize: 13,
      fontWeight: '800',
      textTransform: 'uppercase',
    },
    pipElapsed: {
      color: '#F2F3EE',
      fontSize: 38,
      fontWeight: '800',
    },
    pipStats: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    pipStat: {
      flex: 1,
      gap: 2,
    },
    pipStatValue: {
      color: '#F2F3EE',
      fontSize: 19,
      fontWeight: '800',
    },
    pipStatLabel: {
      color: '#B3B9B1',
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    pipDivider: {
      width: 1,
      height: 34,
      backgroundColor: '#373D37',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    title: {
      color: theme.colors.text.primary,
      fontFamily: theme.typography.families.display,
      fontSize: 30,
      fontWeight: '700',
      letterSpacing: -0.4,
    },
    subtitle: {
      color: theme.colors.text.secondary,
      fontSize: 14,
      marginTop: 2,
    },
    iconButton: {
      width: 44,
      height: 44,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border.light,
      backgroundColor: theme.colors.surface,
    },
    notice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderWidth: 1,
      borderColor: theme.colors.border.light,
      borderRadius: 8,
      backgroundColor: theme.colors.surface,
      padding: 14,
    },
    noticeText: {
      flex: 1,
    },
    noticeTitle: {
      color: theme.colors.text.primary,
      fontSize: 14,
      fontWeight: '700',
    },
    noticeBody: {
      color: theme.colors.text.secondary,
      fontSize: 13,
      marginTop: 2,
    },
    smallButton: {
      backgroundColor: theme.colors.primary,
      borderRadius: 7,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    smallButtonText: {
      color: theme.colors.text.inverse,
      fontWeight: '700',
    },
    noticeActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    smallIconButton: {
      width: 36,
      height: 36,
      borderRadius: 7,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.error,
      backgroundColor: theme.colors.surface,
    },
    alwaysOnCard: {
      minHeight: 72,
      borderWidth: 1,
      borderColor: theme.colors.border.light,
      borderRadius: 7,
      backgroundColor: theme.colors.surface,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    alwaysOnText: {
      flex: 1,
      gap: 3,
    },
    alwaysOnTitle: {
      color: theme.colors.text.primary,
      fontSize: 14,
      fontWeight: '700',
    },
    alwaysOnBody: {
      color: theme.colors.text.secondary,
      fontSize: 13,
      lineHeight: 18,
    },
    section: {
      gap: 8,
    },
    sectionTitle: {
      color: theme.colors.text.primary,
      fontSize: 16,
      fontWeight: '700',
    },
    sectionBody: {
      borderWidth: 1,
      borderColor: theme.colors.border.light,
      borderRadius: 7,
      backgroundColor: theme.colors.surface,
      padding: 14,
      gap: 12,
    },
    profileList: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    choiceList: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    choice: {
      borderWidth: 1,
      borderColor: theme.colors.border.medium,
      borderRadius: 5,
      paddingHorizontal: 12,
      paddingVertical: 9,
      backgroundColor: theme.colors.surface,
    },
    choiceSelected: {
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.surfaceSecondary,
    },
    choiceText: {
      color: theme.colors.text.primary,
      fontSize: 13,
      fontWeight: '600',
    },
    choiceTextSelected: {
      color: theme.colors.primary,
    },
    formGrid: {
      gap: 10,
    },
    input: {
      minHeight: 46,
      borderWidth: 1,
      borderColor: theme.colors.border.medium,
      borderRadius: 8,
      paddingHorizontal: 12,
      color: theme.colors.text.primary,
      backgroundColor: theme.colors.surfaceSecondary,
      fontSize: 15,
    },
    datePickerButton: {
      minHeight: 46,
      borderWidth: 1,
      borderColor: theme.colors.border.medium,
      borderRadius: 8,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      backgroundColor: theme.colors.surfaceSecondary,
    },
    datePickerText: {
      flex: 1,
      color: theme.colors.text.primary,
      fontSize: 15,
    },
    datePickerPlaceholder: {
      color: theme.colors.text.light,
    },
    calculatedField: {
      minHeight: 46,
      borderWidth: 1,
      borderColor: theme.colors.border.medium,
      borderRadius: 8,
      paddingHorizontal: 12,
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceSecondary,
    },
    calculatedLabel: {
      color: theme.colors.text.secondary,
      fontSize: 12,
      fontWeight: '700',
    },
    calculatedValue: {
      color: theme.colors.text.primary,
      fontSize: 15,
      fontWeight: '700',
      marginTop: 2,
    },
    profileMenuButton: {
      minHeight: 44,
      borderWidth: 1,
      borderColor: theme.colors.border.medium,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
      backgroundColor: theme.colors.surface,
    },
    profileMenuButtonText: {
      color: theme.colors.primary,
      fontSize: 14,
      fontWeight: '700',
    },
    fieldLabel: {
      color: theme.colors.text.primary,
      fontSize: 14,
      fontWeight: '700',
    },
    helperText: {
      color: theme.colors.text.secondary,
      fontSize: 13,
      lineHeight: 18,
    },
    primaryButton: {
      minHeight: 52,
      borderRadius: 7,
      backgroundColor: theme.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    primaryButtonText: {
      color: theme.colors.text.inverse,
      fontSize: 16,
      fontWeight: '700',
    },
  });
}

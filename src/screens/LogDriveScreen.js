import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Location from 'expo-location';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
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
  isValidDateOfBirth,
  isNightTime,
} from '../utils/time';
import { autoSelectWeatherOption, fetchWeatherData } from '../utils/weather';
import { formatDistanceFromKm, formatSpeedFromKmh } from '../utils/units';
import {
  addDrivePipModeListener,
  isInDrivePictureInPictureMode,
  setDrivePipTrackingActive,
  updateDrivePipStats,
} from '../services/drivePip';
import {
  addActiveDriveTrackingListener,
  clearActiveDriveTracking,
  requestActiveDriveTrackingPermissions,
  startActiveDriveTracking,
  stopActiveDriveTracking,
} from '../services/activeDriveTracking';

function getDefaultTabBarStyle(theme) {
  return {
    backgroundColor: theme.colors.surface,
    borderTopColor: theme.colors.border.light,
    borderTopWidth: 1,
    paddingBottom: 12,
    paddingTop: 12,
    height: 72,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 8,
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
  const styles = useMemo(() => createStyles(theme), [theme]);
  const distanceUnit = settings.distanceUnit || 'metric';
  const alwaysOnWhileTracking = settings.alwaysOnWhileTracking ?? true;

  const [date, setDate] = useState(getCurrentDate());
  const [startTime, setStartTime] = useState(null);
  const [endTime, setEndTime] = useState(null);
  const [startTimestamp, setStartTimestamp] = useState(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [selectedSupervisorId, setSelectedSupervisorId] = useState(supervisorProfiles[0]?.id || null);
  const [supervisorName, setSupervisorName] = useState('');
  const [supervisorDateOfBirth, setSupervisorDateOfBirth] = useState('');
  const [supervisorLicense, setSupervisorLicense] = useState('');
  const [destination, setDestination] = useState('Practice route');
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

  const latestDetectedEvent = detectedEvents?.find((event) => event.status === 'new');
  const latestDetectionStartTimestamp = getDetectionStartTimestamp(latestDetectedEvent);
  const selectedSupervisor = supervisorProfiles.find((profile) => profile.id === selectedSupervisorId);
  const requiresSupervisor = user.licenseType === 'learners';
  const enteredSupervisorAge = calculateAge(supervisorDateOfBirth);

  useEffect(() => {
    loadWeather();
    return () => {
      if (watchRef.current) {
        watchRef.current.remove();
      }
      clearActiveDriveTracking();
    };
  }, []);

  useEffect(() => {
    let interval;
    if (isActive && startTimestamp) {
      interval = setInterval(() => {
        setElapsedMs(Date.now() - startTimestamp);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isActive, startTimestamp]);

  useEffect(() => {
    setDrivePipTrackingActive(isActive);
    return () => setDrivePipTrackingActive(false);
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return;

    updateDrivePipStats({
      title: formatElapsed(elapsedMs),
      subtitle: `${formatDistanceFromKm(distance / 1000, distanceUnit)} · ${formatSpeedFromKmh(currentSpeed, distanceUnit)}`,
      startTimestamp,
      distanceText: formatDistanceFromKm(distance / 1000, distanceUnit),
      speedText: formatSpeedFromKmh(currentSpeed, distanceUnit),
    });
  }, [currentSpeed, distance, distanceUnit, elapsedMs, isActive, startTimestamp]);

  useEffect(() => {
    const subscription = addActiveDriveTrackingListener((event) => {
      setElapsedMs(event.elapsedMs);
      setDistance(event.distance);
      setCurrentSpeed(event.currentSpeed);
      setMaxSpeed(event.maxSpeed);
      setRoutePoints(event.routePoints || []);
      lastPointRef.current = event.lastPoint || null;
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
      tabBarStyle: isInPictureInPictureMode
        ? styles.hiddenTabBar
        : getDefaultTabBarStyle(theme),
    });
  }, [isInPictureInPictureMode, navigation, styles, theme]);

  useEffect(() => {
    if (!isActive || !alwaysOnWhileTracking) {
      deactivateKeepAwake(DRIVE_TRACKING_KEEP_AWAKE_TAG);
      return undefined;
    }

    activateKeepAwakeAsync(DRIVE_TRACKING_KEEP_AWAKE_TAG).catch((error) => {
      logError(error, 'TRACKING', 'Unable to keep screen awake while tracking');
    });

    return () => {
      deactivateKeepAwake(DRIVE_TRACKING_KEEP_AWAKE_TAG);
    };
  }, [alwaysOnWhileTracking, isActive]);

  const loadWeather = async () => {
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
      setWeather(autoSelectWeatherOption(nextWeather.description, nextWeather.isNight).replace(/^[^\w]+ /, ''));
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
    const speedKmh = typeof point.speed === 'number' && point.speed >= 0
      ? point.speed * 3.6
      : previous
        ? (distanceMeters(previous, point) / Math.max(1, (point.timestamp - previous.timestamp) / 1000)) * 3.6
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

    setDate(detectedStartTimestamp ? getDateFromDate(nextStartTimestamp) : getCurrentDate());
    setStartTime(detectedStartTimestamp ? getTimeFromDate(nextStartTimestamp) : getCurrentTime());
    setStartTimestamp(nextStartTimestamp);
    setElapsedMs(Date.now() - nextStartTimestamp);
    setDistance(0);
    setCurrentSpeed(0);
    setMaxSpeed(0);
    setRoutePoints([]);
    lastPointRef.current = null;
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
      setElapsedMs(0);
      setRoutePoints([]);
      lastPointRef.current = null;
      return false;
    }

    setIsActive(true);
    logUserAction(fromDetection ? 'start_detected_drive' : 'start_drive', 'LOG_DRIVE');

    return true;
  };

  const stopDrive = async () => {
    const state = await stopActiveDriveTracking();
    if (state) {
      setDistance(state.distance || 0);
      setCurrentSpeed(state.currentSpeed || 0);
      setMaxSpeed(state.maxSpeed || 0);
      setRoutePoints(state.routePoints || []);
      lastPointRef.current = state.lastPoint || null;
    }
    setEndTime(getCurrentTime());
    setElapsedMs(Date.now() - startTimestamp);
    setIsActive(false);
    setDrivePipTrackingActive(false);
    logUserAction('stop_drive', 'LOG_DRIVE');
  };

  const saveDrive = async () => {
    if (!startTime || !endTime) {
      Alert.alert('Drive still active', 'Stop the drive before saving it.');
      return;
    }

    const supervisor = selectedSupervisor || {
      name: supervisorName.trim(),
      dateOfBirth: supervisorDateOfBirth.trim(),
      age: enteredSupervisorAge,
      licenseNumber: supervisorLicense.trim(),
    };
    const supervisorAge = getSupervisorAge(supervisor);
    const duration = Math.max(1, Math.round(elapsedMs / 60000));
    const isNightDrive =
      isNightTime(startTime, settings.nightTimeStart, settings.nightTimeEnd) ||
      isNightTime(endTime, settings.nightTimeStart, settings.nightTimeEnd);

    try {
      setIsSaving(true);

      addDrive({
        id: Date.now().toString(),
        date,
        startTime,
        endTime,
        duration,
        isNightDrive,
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
          distanceKm: Number((distance / 1000).toFixed(2)),
          averageSpeedKmh: Number(((distance / 1000) / Math.max(duration / 60, 0.016)).toFixed(1)),
          maxSpeedKmh: Math.round(maxSpeed),
          samples: routePoints.length,
        },
        routePreview: routePoints.filter((_, index) => index % 5 === 0).slice(-40),
      });

      if (sourceEventId) {
        updateDetectedEvent({ id: sourceEventId, status: 'logged', loggedAt: new Date().toISOString() });
      }

      Alert.alert('Drive saved', 'Your drive log has been updated.', [
        { text: 'History', onPress: () => navigation.navigate('DriveHistory') },
        { text: 'New drive', onPress: resetForm },
      ]);
    } finally {
      setIsSaving(false);
    }
  };

  const resetForm = () => {
    setDate(getCurrentDate());
    setStartTime(null);
    setEndTime(null);
    setStartTimestamp(null);
    setElapsedMs(0);
    setDistance(0);
    setCurrentSpeed(0);
    setMaxSpeed(0);
    setRoutePoints([]);
    setSkills([]);
    setSourceEventId(null);
    setIsActive(false);
    setDrivePipTrackingActive(false);
    clearActiveDriveTracking();
    setSupervisorDateOfBirth('');
    lastPointRef.current = null;
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

  if (isInPictureInPictureMode && isActive) {
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

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Log Drive</Text>
            <Text style={styles.subtitle}>{formatDateForDisplay(date)}</Text>
          </View>
          <TouchableOpacity style={styles.iconButton} onPress={loadWeather}>
            {loadingWeather ? (
              <ActivityIndicator color={theme.colors.primary} />
            ) : (
              <Icon name="weather-partly-cloudy" size={22} color={theme.colors.primary} />
            )}
          </TouchableOpacity>
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

        <View style={styles.metrics}>
          <Metric label="Elapsed" value={formatElapsed(elapsedMs)} icon="timer-outline" theme={theme} />
          <Metric label="Distance" value={formatDistanceFromKm(distance / 1000, distanceUnit)} icon="map-marker-distance" theme={theme} />
          <Metric label="Speed" value={formatSpeedFromKmh(currentSpeed, distanceUnit)} icon="speedometer" theme={theme} />
        </View>

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
              <TextInput
                style={styles.input}
                value={supervisorName}
                onChangeText={setSupervisorName}
                placeholder="Supervisor name"
                placeholderTextColor={theme.colors.text.light}
              />
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
          <ChoiceList value={destination} values={DESTINATIONS} onChange={setDestination} styles={styles} />
          <Text style={styles.fieldLabel}>Weather</Text>
          <ChoiceList value={weather} values={WEATHER_OPTIONS} onChange={setWeather} styles={styles} />
          {weatherData && (
            <Text style={styles.helperText}>
              {weatherData.location}: {weatherData.description}, {weatherData.temperature}
            </Text>
          )}
        </Section>

        <Section title="Practice" styles={styles}>
          <ChoiceList value={skills} values={COMMON_SKILLS} onChange={toggleSkill} styles={styles} multi />
        </Section>

        <View style={styles.actionRow}>
          {!isActive ? (
            <TouchableOpacity
              style={[styles.primaryButton, startTime && !endTime && styles.disabledButton]}
              onPress={() => startDrive()}
              disabled={!!startTime && !endTime}
            >
              <Icon name="play" size={20} color={theme.colors.text.inverse} />
              <Text style={styles.primaryButtonText}>Start</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.dangerButton} onPress={stopDrive}>
              <Icon name="stop" size={20} color={theme.colors.text.inverse} />
              <Text style={styles.primaryButtonText}>Stop</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.secondaryButton, (!endTime || isSaving) && styles.disabledOutline]}
            onPress={saveDrive}
            disabled={!endTime || isSaving}
          >
            <Icon name="content-save-outline" size={20} color={theme.colors.primary} />
            <Text style={styles.secondaryButtonText}>{isSaving ? 'Saving' : 'Save'}</Text>
          </TouchableOpacity>
        </View>

        {startTime && (
          <View style={styles.summary}>
            <Text style={styles.summaryText}>Started {formatTimeForDisplay(startTime)}</Text>
            {endTime && <Text style={styles.summaryText}>Ended {formatTimeForDisplay(endTime)}</Text>}
            <Text style={styles.summaryText}>Max speed {formatSpeedFromKmh(maxSpeed, distanceUnit)}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ icon, label, theme, value }) {
  return (
    <View style={{
      flex: 1,
      minHeight: 86,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.colors.border.light,
      backgroundColor: theme.colors.surface,
      padding: 12,
      justifyContent: 'space-between',
    }}>
      <Icon name={icon} size={18} color={theme.colors.text.secondary} />
      <View>
        <Text style={{ color: theme.colors.text.primary, fontSize: 17, fontWeight: '700' }}>{value}</Text>
        <Text style={{ color: theme.colors.text.secondary, fontSize: 12, marginTop: 2 }}>{label}</Text>
      </View>
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
            onPress={() => onChange(item)}
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
      paddingBottom: 112,
      gap: 18,
    },
    hiddenTabBar: {
      display: 'none',
      height: 0,
    },
    pipContainer: {
      flex: 1,
      backgroundColor: '#0b1220',
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
      color: '#cbd5e1',
      fontSize: 13,
      fontWeight: '800',
      textTransform: 'uppercase',
    },
    pipElapsed: {
      color: '#ffffff',
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
      color: '#f8fafc',
      fontSize: 19,
      fontWeight: '800',
    },
    pipStatLabel: {
      color: '#94a3b8',
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    pipDivider: {
      width: 1,
      height: 34,
      backgroundColor: '#334155',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    title: {
      color: theme.colors.text.primary,
      fontSize: 26,
      fontWeight: '700',
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
    metrics: {
      flexDirection: 'row',
      gap: 10,
    },
    alwaysOnCard: {
      minHeight: 72,
      borderWidth: 1,
      borderColor: theme.colors.border.light,
      borderRadius: 8,
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
      borderRadius: 8,
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
      borderRadius: 7,
      paddingHorizontal: 12,
      paddingVertical: 9,
      backgroundColor: theme.colors.surface,
    },
    choiceSelected: {
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.primary,
    },
    choiceText: {
      color: theme.colors.text.primary,
      fontSize: 13,
      fontWeight: '600',
    },
    choiceTextSelected: {
      color: theme.colors.text.inverse,
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
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
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
    actionRow: {
      flexDirection: 'row',
      gap: 12,
    },
    primaryButton: {
      flex: 1,
      minHeight: 52,
      borderRadius: 8,
      backgroundColor: theme.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    dangerButton: {
      flex: 1,
      minHeight: 52,
      borderRadius: 8,
      backgroundColor: theme.colors.error,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    secondaryButton: {
      flex: 1,
      minHeight: 52,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
      backgroundColor: theme.colors.surface,
    },
    disabledButton: {
      opacity: 0.5,
    },
    disabledOutline: {
      opacity: 0.45,
    },
    primaryButtonText: {
      color: theme.colors.text.inverse,
      fontSize: 16,
      fontWeight: '700',
    },
    secondaryButtonText: {
      color: theme.colors.primary,
      fontSize: 16,
      fontWeight: '700',
    },
    summary: {
      borderWidth: 1,
      borderColor: theme.colors.border.light,
      borderRadius: 8,
      backgroundColor: theme.colors.surface,
      padding: 14,
      gap: 6,
    },
    summaryText: {
      color: theme.colors.text.secondary,
      fontSize: 14,
    },
  });
}

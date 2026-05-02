import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDriving } from '../contexts/DrivingContext';
import { useTheme } from '../contexts/ThemeContext';
import { logError, logUserAction } from '../utils/logger';
import {
  formatDateForDisplay,
  formatTimeForDisplay,
  getCurrentDate,
  getCurrentTime,
  isNightTime,
} from '../utils/time';
import { autoSelectWeatherOption, fetchWeatherData } from '../utils/weather';

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
    detectedEvents,
    settings,
    supervisorProfiles,
    updateDetectedEvent,
    user,
  } = useDriving();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [date, setDate] = useState(getCurrentDate());
  const [startTime, setStartTime] = useState(null);
  const [endTime, setEndTime] = useState(null);
  const [startTimestamp, setStartTimestamp] = useState(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [selectedSupervisorId, setSelectedSupervisorId] = useState(supervisorProfiles[0]?.id || null);
  const [supervisorName, setSupervisorName] = useState('');
  const [supervisorAge, setSupervisorAge] = useState('');
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

  const watchRef = useRef(null);
  const lastPointRef = useRef(null);

  const latestDetectedEvent = detectedEvents?.find((event) => event.status === 'new');
  const selectedSupervisor = supervisorProfiles.find((profile) => profile.id === selectedSupervisorId);
  const requiresSupervisor = user.licenseType === 'learners';

  useEffect(() => {
    loadWeather();
    return () => {
      if (watchRef.current) {
        watchRef.current.remove();
      }
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

  const startDrive = async ({ fromDetection = false } = {}) => {
    const supervisor = selectedSupervisor || {
      name: supervisorName.trim(),
      age: Number(supervisorAge),
      licenseNumber: supervisorLicense.trim(),
    };

    if (requiresSupervisor && !supervisor.name) {
      Alert.alert('Supervisor required', 'Choose or enter a supervisor before starting this drive.');
      return;
    }

    if (supervisor.age && supervisor.age < 21) {
      Alert.alert('Invalid supervisor', 'The supervising driver must be at least 21.');
      return;
    }

    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Location needed', 'Foreground location is required for live drive tracking.');
      return;
    }

    setDate(getCurrentDate());
    setStartTime(getCurrentTime());
    setStartTimestamp(Date.now());
    setElapsedMs(0);
    setDistance(0);
    setCurrentSpeed(0);
    setMaxSpeed(0);
    setRoutePoints([]);
    lastPointRef.current = null;
    setIsActive(true);
    logUserAction(fromDetection ? 'start_detected_drive' : 'start_drive', 'LOG_DRIVE');

    watchRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 5000,
        distanceInterval: 10,
      },
      handleLocationUpdate
    );
  };

  const stopDrive = () => {
    if (watchRef.current) {
      watchRef.current.remove();
      watchRef.current = null;
    }
    setEndTime(getCurrentTime());
    setElapsedMs(Date.now() - startTimestamp);
    setIsActive(false);
    logUserAction('stop_drive', 'LOG_DRIVE');
  };

  const saveDrive = async () => {
    if (!startTime || !endTime) {
      Alert.alert('Drive still active', 'Stop the drive before saving it.');
      return;
    }

    const supervisor = selectedSupervisor || {
      name: supervisorName.trim(),
      age: Number(supervisorAge),
      licenseNumber: supervisorLicense.trim(),
    };
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
        supervisorAge: supervisor.age || null,
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
    lastPointRef.current = null;
  };

  const useDetectedEvent = () => {
    if (!latestDetectedEvent) return;
    setSourceEventId(latestDetectedEvent.id);
    updateDetectedEvent({ id: latestDetectedEvent.id, status: 'opened' });
    startDrive({ fromDetection: true });
  };

  const toggleSkill = (skill) => {
    setSkills((current) =>
      current.includes(skill) ? current.filter((item) => item !== skill) : [...current, skill]
    );
  };

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
                Movement was detected at about {latestDetectedEvent.speedKmh} km/h.
              </Text>
            </View>
            <TouchableOpacity style={styles.smallButton} onPress={useDetectedEvent}>
              <Text style={styles.smallButtonText}>Use</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.metrics}>
          <Metric label="Elapsed" value={formatElapsed(elapsedMs)} icon="timer-outline" theme={theme} />
          <Metric label="Distance" value={`${(distance / 1000).toFixed(2)} km`} icon="map-marker-distance" theme={theme} />
          <Metric label="Speed" value={`${Math.round(currentSpeed)} km/h`} icon="speedometer" theme={theme} />
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
                  <Text style={[
                    styles.choiceText,
                    selectedSupervisorId === profile.id && styles.choiceTextSelected,
                  ]}>
                    {profile.name}
                  </Text>
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
              <TextInput
                style={styles.input}
                value={supervisorAge}
                onChangeText={(value) => setSupervisorAge(value.replace(/[^0-9]/g, ''))}
                placeholder="Age"
                placeholderTextColor={theme.colors.text.light}
                keyboardType="numeric"
                maxLength={2}
              />
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
            <Text style={styles.summaryText}>Max speed {Math.round(maxSpeed)} km/h</Text>
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
    metrics: {
      flexDirection: 'row',
      gap: 10,
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

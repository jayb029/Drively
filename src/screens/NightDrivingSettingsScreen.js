import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  SettingsButton,
  SettingsChoice,
  SettingsPage,
  SettingsSection,
} from '../components/SettingsComponents';
import { useDriving } from '../contexts/DrivingContext';
import { useTheme } from '../contexts/ThemeContext';
import { NIGHT_DRIVING_METHODS } from '../utils/nightDriving';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export default function NightDrivingSettingsScreen({ navigation }) {
  const { settings, updateSettings } = useDriving();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [nightStart, setNightStart] = useState(settings.nightTimeStart || '18:00');
  const [nightEnd, setNightEnd] = useState(settings.nightTimeEnd || '06:00');
  const method = settings.nightDrivingMethod || NIGHT_DRIVING_METHODS.CIVIL_TWILIGHT;

  const saveFallbackHours = () => {
    if (!TIME_PATTERN.test(nightStart) || !TIME_PATTERN.test(nightEnd)) {
      Alert.alert('Check the times', 'Enter each time in 24-hour HH:MM format, such as 18:00.');
      return;
    }
    updateSettings({ nightTimeStart: nightStart, nightTimeEnd: nightEnd });
    Alert.alert('Fallback hours saved', 'These hours are used when a location-based calculation is unavailable.');
  };

  return (
    <SettingsPage
      navigation={navigation}
      title="Night driving"
      subtitle="Choose how Drively divides each drive into day and night minutes."
    >
      <SettingsSection title="Calculation">
        <SettingsChoice
          label="Night begins"
          onChange={(value) => updateSettings({ nightDrivingMethod: value })}
          options={[
            { value: NIGHT_DRIVING_METHODS.CIVIL_TWILIGHT, label: 'Civil twilight' },
            { value: NIGHT_DRIVING_METHODS.SUNSET_TO_SUNRISE, label: 'Sunset' },
            { value: NIGHT_DRIVING_METHODS.CUSTOM_HOURS, label: 'Custom' },
          ]}
          value={method}
        />
        <View style={styles.explanation}>
          <Text style={styles.explanationTitle}>
            {method === NIGHT_DRIVING_METHODS.CIVIL_TWILIGHT
              ? 'Recommended for actual darkness'
              : method === NIGHT_DRIVING_METHODS.SUNSET_TO_SUNRISE
                ? 'Counts from sunset to sunrise'
                : 'Uses the fixed hours below'}
          </Text>
          <Text style={styles.explanationBody}>
            {method === NIGHT_DRIVING_METHODS.CUSTOM_HOURS
              ? 'Drively evaluates the drive minute by minute against your chosen window.'
              : 'Drively calculates the sun position on this device using the drive time and route. If location is unavailable, it uses the fallback hours below.'}
          </Text>
        </View>
      </SettingsSection>

      <SettingsSection title="Fallback hours">
        <View style={styles.timeFields}>
          <View style={styles.timeField}>
            <Text style={styles.label}>Night starts</Text>
            <TextInput
              accessibilityLabel="Fallback night start"
              autoCapitalize="none"
              keyboardType="numbers-and-punctuation"
              maxLength={5}
              onChangeText={setNightStart}
              placeholder="18:00"
              placeholderTextColor={theme.colors.text.light}
              style={styles.input}
              value={nightStart}
            />
          </View>
          <View style={styles.timeField}>
            <Text style={styles.label}>Night ends</Text>
            <TextInput
              accessibilityLabel="Fallback night end"
              autoCapitalize="none"
              keyboardType="numbers-and-punctuation"
              maxLength={5}
              onChangeText={setNightEnd}
              placeholder="06:00"
              placeholderTextColor={theme.colors.text.light}
              style={styles.input}
              value={nightEnd}
            />
          </View>
        </View>
        <View style={styles.buttonWrap}>
          <SettingsButton label="Save fallback hours" onPress={saveFallbackHours} secondary />
        </View>
      </SettingsSection>

      <SettingsSection title="Licensing requirements">
        <View style={styles.explanation}>
          <Text style={styles.explanationBody}>
            Licensing authorities may define night driving differently. Drively shows how each result was calculated and lets you correct the saved split from the logbook.
          </Text>
        </View>
      </SettingsSection>
    </SettingsPage>
  );
}

function createStyles(theme) {
  return StyleSheet.create({
    explanation: { padding: 14, gap: 4 },
    explanationTitle: { color: theme.colors.text.primary, fontSize: 14, fontWeight: '700' },
    explanationBody: { color: theme.colors.text.secondary, fontSize: 12, lineHeight: 18 },
    timeFields: { flexDirection: 'row', gap: 12, padding: 14, paddingBottom: 6 },
    timeField: { flex: 1, gap: 6 },
    label: { color: theme.colors.text.primary, fontSize: 13, fontWeight: '600' },
    input: {
      minHeight: 44,
      borderWidth: 1,
      borderColor: theme.colors.border.medium,
      borderRadius: 7,
      backgroundColor: theme.colors.surfaceSecondary,
      color: theme.colors.text.primary,
      fontSize: 16,
      paddingHorizontal: 12,
      fontVariant: ['tabular-nums'],
    },
    buttonWrap: { padding: 14, paddingTop: 8 },
  });
}

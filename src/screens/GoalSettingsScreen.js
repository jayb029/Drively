import React, { useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDriving } from '../contexts/DrivingContext';
import { useTheme } from '../contexts/ThemeContext';
import { logUserAction } from '../utils/logger';
import { formatDuration } from '../utils/time';

export default function GoalSettingsScreen({ navigation }) {
  const { drives, setUserInfo, user } = useDriving();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [totalHours, setTotalHours] = useState(String(user.goalDayHours));
  const [nightHours, setNightHours] = useState(String(user.goalNightHours));

  const total = Number(totalHours);
  const night = Number(nightHours);
  const totalLogged = drives.reduce((sum, drive) => sum + (Number(drive.duration) || 0), 0);
  const nightLogged = drives
    .filter((drive) => drive.isNightDrive)
    .reduce((sum, drive) => sum + (Number(drive.duration) || 0), 0);
  const valid = Number.isFinite(total) && Number.isFinite(night) && total > 0 && night >= 0 && night <= total;

  const saveGoals = () => {
    if (!valid) {
      Alert.alert('Check your goal', 'Total hours must be above zero, and night hours must be part of the total.');
      return;
    }

    setUserInfo({ goalDayHours: total, goalNightHours: night });
    logUserAction('update_goals', 'GOAL_SETTINGS', { totalHours: total, nightHours: night });
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.topBar}>
          <TouchableOpacity accessibilityLabel="Go back" onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backButtonText}>‹</Text>
          </TouchableOpacity>
          <View style={styles.intro}>
            <Text style={styles.title}>Driving goal</Text>
            <Text style={styles.subtitle}>
              Set the requirement from your permit or driving program. Night hours count toward the total.
            </Text>
          </View>
        </View>

        <View style={styles.odometer}>
          <View style={styles.odometerBlock}>
            <Text style={styles.odometerValue}>{formatDuration(totalLogged)}</Text>
            <Text style={styles.odometerLabel}>total logged</Text>
          </View>
          <View style={styles.odometerDivider} />
          <View style={styles.odometerBlock}>
            <Text style={styles.odometerValue}>{formatDuration(nightLogged)}</Text>
            <Text style={styles.odometerLabel}>night logged</Text>
          </View>
        </View>

        <View style={styles.form}>
          <GoalSlider
            label="Total required hours"
            max={100}
            min={1}
            onChange={setTotalHours}
            styles={styles}
            theme={theme}
            value={totalHours}
          />
          <GoalSlider
            label="Night minimum"
            max={Math.max(1, Number(totalHours) || 1)}
            min={0}
            onChange={setNightHours}
            styles={styles}
            theme={theme}
            value={nightHours}
          />
        </View>

        <View style={styles.preview}>
          <Text style={styles.previewTitle}>New requirement</Text>
          <Text style={styles.previewText}>
            {Number.isFinite(total) ? total : 0} total hours, including {Number.isFinite(night) ? night : 0} at night
          </Text>
          {!valid && (
            <Text style={styles.errorText}>Night hours cannot be greater than total hours.</Text>
          )}
        </View>

        <TouchableOpacity
          accessibilityRole="button"
          disabled={!valid}
          onPress={saveGoals}
          style={[styles.saveButton, !valid && styles.disabledButton]}
        >
          <Text style={styles.saveButtonText}>Save goal</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function GoalSlider({ label, max, min, onChange, styles, theme, value }) {
  const [editing, setEditing] = useState(false);
  const [trackWidth, setTrackWidth] = useState(1);
  const numericValue = Number(value);
  const safeValue = Number.isFinite(numericValue) ? Math.min(max, Math.max(min, numericValue)) : min;
  const progress = max === min ? 0 : ((safeValue - min) / (max - min)) * 100;

  const updateFromPosition = (position) => {
    const nextValue = min + (Math.max(0, Math.min(position, trackWidth)) / trackWidth) * (max - min);
    onChange(String(Math.round(nextValue)));
  };

  const adjust = (direction) => {
    onChange(String(Math.min(max, Math.max(min, safeValue + direction))));
  };

  return (
    <View style={styles.field}>
      <View style={styles.goalHeader}>
        <Text style={styles.label}>{label}</Text>
        {editing ? (
          <View style={styles.inputRow}>
            <TextInput
              accessibilityLabel={`${label}, manual value`}
              autoFocus
              keyboardType="decimal-pad"
              onBlur={() => setEditing(false)}
              onChangeText={onChange}
              onSubmitEditing={() => setEditing(false)}
              selectTextOnFocus
              style={styles.input}
              value={value}
            />
            <Text style={styles.unit}>hr</Text>
          </View>
        ) : (
          <TouchableOpacity
            accessibilityHint="Opens the keyboard for manual editing"
            accessibilityLabel={`${label}, ${value} hours`}
            accessibilityRole="button"
            onPress={() => setEditing(true)}
            style={styles.valueButton}
          >
            <Text style={styles.valueButtonText}>{value}</Text>
            <Text style={styles.valueButtonUnit}>hr</Text>
          </TouchableOpacity>
        )}
      </View>
      <View
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        accessibilityLabel={label}
        accessibilityRole="adjustable"
        accessibilityValue={{ min, max, now: safeValue, text: `${safeValue} hours` }}
        onAccessibilityAction={({ nativeEvent }) => adjust(nativeEvent.actionName === 'increment' ? 1 : -1)}
        onLayout={({ nativeEvent }) => setTrackWidth(nativeEvent.layout.width)}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={({ nativeEvent }) => updateFromPosition(nativeEvent.locationX)}
        onResponderMove={({ nativeEvent }) => updateFromPosition(nativeEvent.locationX)}
        onStartShouldSetResponder={() => true}
        style={styles.sliderTouchArea}
      >
        <View style={styles.sliderTrack}>
          <View style={[styles.sliderFill, { width: `${progress}%` }]} />
          <View
            style={[
              styles.sliderThumb,
              { left: `${progress}%`, borderColor: theme.colors.primary },
            ]}
          />
        </View>
      </View>
      <View style={styles.sliderRange}>
        <Text style={styles.rangeText}>{min} hr</Text>
        <Text style={styles.rangeText}>{max} hr</Text>
      </View>
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
      paddingBottom: 44,
      gap: 24,
    },
    intro: {
      flex: 1,
      gap: 6,
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    backButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border.light,
      borderRadius: 7,
      backgroundColor: theme.colors.surface,
    },
    backButtonText: {
      color: theme.colors.text.secondary,
      fontSize: 29,
      lineHeight: 31,
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
      fontSize: 15,
      lineHeight: 22,
    },
    odometer: {
      minHeight: 94,
      flexDirection: 'row',
      alignItems: 'stretch',
      borderWidth: 1,
      borderColor: theme.colors.border.dark,
      borderRadius: 7,
      backgroundColor: theme.colors.instrument.background,
      overflow: 'hidden',
    },
    odometerBlock: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    odometerDivider: {
      width: 1,
      backgroundColor: theme.colors.instrument.muted,
      opacity: 0.45,
    },
    odometerValue: {
      color: theme.colors.instrument.text,
      fontFamily: theme.typography.families.utility,
      fontVariant: ['tabular-nums'],
      fontSize: 24,
      fontWeight: '700',
    },
    odometerLabel: {
      color: theme.colors.instrument.muted,
      fontSize: 12,
      marginTop: 2,
      opacity: 0.72,
    },
    form: {
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: theme.colors.border.light,
    },
    field: {
      paddingVertical: 16,
      gap: 10,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border.light,
    },
    goalHeader: {
      minHeight: 42,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    label: {
      color: theme.colors.text.primary,
      fontSize: 15,
      fontWeight: '600',
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    input: {
      width: 72,
      minHeight: 42,
      borderWidth: 1,
      borderColor: theme.colors.border.medium,
      borderRadius: 7,
      backgroundColor: theme.colors.surface,
      color: theme.colors.text.primary,
      fontFamily: theme.typography.families.utility,
      fontVariant: ['tabular-nums'],
      fontSize: 18,
      fontWeight: '700',
      paddingHorizontal: 12,
    },
    unit: {
      color: theme.colors.text.secondary,
      fontSize: 13,
    },
    valueButton: {
      minWidth: 76,
      minHeight: 42,
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'center',
      gap: 4,
      paddingHorizontal: 10,
      borderWidth: 1,
      borderColor: theme.colors.border.medium,
      borderRadius: 7,
      backgroundColor: theme.colors.surface,
    },
    valueButtonText: {
      color: theme.colors.text.primary,
      fontFamily: theme.typography.families.utility,
      fontVariant: ['tabular-nums'],
      fontSize: 18,
      fontWeight: '700',
    },
    valueButtonUnit: {
      color: theme.colors.text.secondary,
      fontSize: 12,
    },
    sliderTouchArea: {
      height: 32,
      justifyContent: 'center',
    },
    sliderTrack: {
      height: 6,
      backgroundColor: theme.colors.border.light,
    },
    sliderFill: {
      height: '100%',
      backgroundColor: theme.colors.primary,
    },
    sliderThumb: {
      position: 'absolute',
      top: -7,
      width: 20,
      height: 20,
      marginLeft: -10,
      borderWidth: 2,
      borderRadius: 10,
      backgroundColor: theme.colors.surface,
    },
    sliderRange: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: -7,
    },
    rangeText: {
      color: theme.colors.text.light,
      fontSize: 11,
    },
    preview: {
      gap: 4,
    },
    previewTitle: {
      color: theme.colors.text.primary,
      fontSize: 14,
      fontWeight: '700',
    },
    previewText: {
      color: theme.colors.text.secondary,
      fontSize: 14,
      lineHeight: 20,
    },
    errorText: {
      color: theme.colors.error,
      fontSize: 13,
      marginTop: 4,
    },
    saveButton: {
      minHeight: 50,
      borderRadius: 7,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primary,
    },
    saveButtonText: {
      color: theme.colors.text.inverse,
      fontSize: 16,
      fontWeight: '700',
    },
    disabledButton: {
      opacity: 0.45,
    },
  });
}

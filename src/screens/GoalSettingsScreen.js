import React, { useMemo, useState } from 'react';
import * as Haptics from 'expo-haptics';
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
import { sumDriveMinutes } from '../utils/nightDriving';

const TOTAL_HOUR_PRESETS = [10, 25, 50, 60, 75, 100];
const NIGHT_HOUR_PRESETS = [0, 5, 10, 15, 20, 25];

const playSelectionHaptic = () => Haptics.selectionAsync().catch(() => {});
const playAdjustmentHaptic = () => (
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
);

export default function GoalSettingsScreen({ navigation }) {
  const { drives, setUserInfo, user } = useDriving();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [totalHours, setTotalHours] = useState(String(user.goalDayHours));
  const [nightHours, setNightHours] = useState(String(user.goalNightHours));

  const total = Number(totalHours);
  const night = Number(nightHours);
  const { totalMinutes: totalLogged, nightMinutes: nightLogged } = sumDriveMinutes(drives);
  const valid = Number.isFinite(total) && Number.isFinite(night) && total > 0 && night >= 0 && night <= total;
  const validationMessage = !Number.isFinite(total) || total <= 0
    ? 'Enter a total above zero.'
    : !Number.isFinite(night) || night < 0
      ? 'Enter a valid night minimum.'
      : 'Night hours cannot be greater than total hours.';
  const totalRemaining = valid ? Math.max(0, Math.round((total * 60) - totalLogged)) : 0;
  const nightRemaining = valid ? Math.max(0, Math.round((night * 60) - nightLogged)) : 0;

  const updateTotalHours = (nextValue) => {
    setTotalHours(String(nextValue));

    const nextTotal = Number(nextValue);
    const currentNight = Number(nightHours);
    if (Number.isFinite(nextTotal) && Number.isFinite(currentNight) && currentNight > nextTotal) {
      setNightHours(String(nextTotal));
    }
  };

  const saveGoals = () => {
    if (!valid) {
      Alert.alert('Check your goal', 'Total hours must be above zero, and night hours must be part of the total.');
      return;
    }

    setUserInfo({ goalDayHours: total, goalNightHours: night });
    logUserAction('update_goals', 'GOAL_SETTINGS', { totalHours: total, nightHours: night });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
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
          <GoalPicker
            helper="Choose a common requirement or fine-tune it."
            label="Total required hours"
            max={100}
            min={1}
            onChange={updateTotalHours}
            presets={TOTAL_HOUR_PRESETS}
            styles={styles}
            value={totalHours}
          />
          <GoalPicker
            helper="These hours are included in your total."
            label="Night minimum"
            max={Math.max(1, Number(totalHours) || 1)}
            min={0}
            onChange={setNightHours}
            presets={NIGHT_HOUR_PRESETS}
            styles={styles}
            value={nightHours}
          />
        </View>

        <View style={styles.preview}>
          <Text style={styles.previewTitle}>After saving</Text>
          {valid ? (
            <>
              <Text style={styles.previewText}>
                {total} hours total · {night} hours at night
              </Text>
              <Text style={styles.remainingText}>
                {formatDuration(totalRemaining)} left overall · {formatDuration(nightRemaining)} left at night
              </Text>
            </>
          ) : (
            <Text style={styles.errorText}>{validationMessage}</Text>
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

function GoalPicker({ helper, label, max, min, onChange, presets, styles, value }) {
  const [editing, setEditing] = useState(false);
  const numericValue = Number(value);
  const safeValue = Number.isFinite(numericValue) ? Math.min(max, Math.max(min, numericValue)) : min;
  const availablePresets = presets.filter((preset) => preset >= min && preset <= max);

  const adjust = (direction) => {
    const nextValue = Math.min(max, Math.max(min, safeValue + direction));
    if (nextValue === safeValue) return;

    onChange(String(nextValue));
    playAdjustmentHaptic();
  };

  const selectPreset = (preset) => {
    if (preset === safeValue) return;

    onChange(String(preset));
    playSelectionHaptic();
  };

  return (
    <View style={styles.field}>
      <View style={styles.goalHeader}>
        <View style={styles.labelGroup}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.helper}>{helper}</Text>
        </View>
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
      <View style={styles.presetGrid}>
        {availablePresets.map((preset) => {
          const selected = preset === safeValue;
          return (
            <TouchableOpacity
              accessibilityLabel={`Set ${label.toLowerCase()} to ${preset} hours`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={preset}
              onPress={() => selectPreset(preset)}
              style={[styles.presetButton, selected && styles.selectedPresetButton]}
            >
              <Text style={[styles.presetText, selected && styles.selectedPresetText]}>{preset}h</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.stepper}>
        <TouchableOpacity
          accessibilityLabel={`Decrease ${label.toLowerCase()}`}
          accessibilityRole="button"
          disabled={safeValue <= min}
          onPress={() => adjust(-1)}
          style={[styles.stepButton, safeValue <= min && styles.disabledStepButton]}
        >
          <Text style={styles.stepButtonText}>−</Text>
        </TouchableOpacity>
        <Text style={styles.stepperValue}>Adjust by 1 hour</Text>
        <TouchableOpacity
          accessibilityLabel={`Increase ${label.toLowerCase()}`}
          accessibilityRole="button"
          disabled={safeValue >= max}
          onPress={() => adjust(1)}
          style={[styles.stepButton, safeValue >= max && styles.disabledStepButton]}
        >
          <Text style={styles.stepButtonText}>+</Text>
        </TouchableOpacity>
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
      gap: 14,
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
    labelGroup: {
      flex: 1,
      gap: 3,
    },
    label: {
      color: theme.colors.text.primary,
      fontSize: 15,
      fontWeight: '600',
    },
    helper: {
      color: theme.colors.text.secondary,
      fontSize: 12,
      lineHeight: 17,
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
    presetGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    presetButton: {
      minWidth: 0,
      minHeight: 42,
      flexBasis: '30%',
      flexGrow: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: theme.colors.border.medium,
      borderRadius: 7,
      backgroundColor: theme.colors.surface,
    },
    selectedPresetButton: {
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.primary,
    },
    presetText: {
      color: theme.colors.text.primary,
      fontFamily: theme.typography.families.utility,
      fontVariant: ['tabular-nums'],
      fontSize: 15,
      fontWeight: '700',
    },
    selectedPresetText: {
      color: theme.colors.text.inverse,
    },
    stepper: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderTopWidth: 1,
      borderColor: theme.colors.border.light,
      paddingTop: 12,
    },
    stepButton: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border.medium,
      borderRadius: 7,
      backgroundColor: theme.colors.surface,
    },
    disabledStepButton: {
      opacity: 0.35,
    },
    stepButtonText: {
      color: theme.colors.text.primary,
      fontSize: 24,
      lineHeight: 26,
      fontWeight: '500',
    },
    stepperValue: {
      color: theme.colors.text.secondary,
      fontSize: 12,
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
    remainingText: {
      color: theme.colors.primary,
      fontFamily: theme.typography.families.utility,
      fontVariant: ['tabular-nums'],
      fontSize: 14,
      fontWeight: '700',
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

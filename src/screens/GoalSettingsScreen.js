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
import { sumDriveMinutes } from '../utils/nightDriving';
import { haptics } from '../utils/haptics';

const TOTAL_HOUR_PRESETS = [10, 25, 50, 60, 75, 100];
const NIGHT_HOUR_PRESETS = [0, 5, 10, 15, 20, 25];

export default function GoalSettingsScreen({ navigation }) {
  const { drives, setUserInfo, user } = useDriving();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [totalHours, setTotalHours] = useState(String(user.goalDayHours));
  const [nightHours, setNightHours] = useState(String(user.goalNightHours));
  const [showPresets, setShowPresets] = useState(false);

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
    haptics.success();
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

        <Text style={styles.loggedSummary}>
          You have logged {formatDuration(totalLogged)}, including {formatDuration(nightLogged)} at night.
        </Text>

        <View style={styles.form}>
          <GoalPicker
            label="Total required hours"
            max={100}
            min={1}
            onChange={updateTotalHours}
            presets={TOTAL_HOUR_PRESETS}
            showPresets={showPresets}
            styles={styles}
            value={totalHours}
          />
          <GoalPicker
            label="Night minimum"
            max={Math.max(1, Number(totalHours) || 1)}
            min={0}
            onChange={setNightHours}
            presets={NIGHT_HOUR_PRESETS}
            showPresets={showPresets}
            styles={styles}
            value={nightHours}
          />
        </View>

        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => setShowPresets((visible) => !visible)}
          style={styles.disclosure}
        >
          <Text style={styles.disclosureText}>Common values</Text>
          <Text style={styles.disclosureAction}>{showPresets ? 'Hide' : 'Show'}</Text>
        </TouchableOpacity>

        <View style={styles.preview}>
          {valid ? (
            <>
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

function GoalPicker({ label, max, min, onChange, presets, showPresets, styles, value }) {
  const [editing, setEditing] = useState(false);
  const numericValue = Number(value);
  const safeValue = Number.isFinite(numericValue) ? Math.min(max, Math.max(min, numericValue)) : min;
  const availablePresets = presets.filter((preset) => preset >= min && preset <= max);

  const adjust = (direction) => {
    const nextValue = Math.min(max, Math.max(min, safeValue + direction));
    if (nextValue === safeValue) return;

    onChange(String(nextValue));
    haptics.action();
  };

  const selectPreset = (preset) => {
    if (preset === safeValue) return;

    onChange(String(preset));
    haptics.selection();
  };

  return (
    <View style={styles.field}>
      <View style={styles.goalHeader}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.compactStepper}>
          <TouchableOpacity
            accessibilityLabel={`Decrease ${label.toLowerCase()}`}
            accessibilityRole="button"
            disabled={safeValue <= min}
            onPress={() => adjust(-1)}
            style={[styles.stepButton, safeValue <= min && styles.disabledStepButton]}
          >
            <Text style={styles.stepButtonText}>−</Text>
          </TouchableOpacity>
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
      {showPresets && <View style={styles.presetGrid}>
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
      </View>}
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
    loggedSummary: {
      color: theme.colors.text.secondary,
      fontSize: 14,
      lineHeight: 20,
    },
    form: {
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: theme.colors.border.light,
    },
    field: {
      paddingVertical: 16,
      gap: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border.light,
    },
    goalHeader: {
      minHeight: 48,
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
    compactStepper: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    inputRow: {
      width: 84,
      minHeight: 42,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border.medium,
      borderRadius: 7,
      backgroundColor: theme.colors.surface,
    },
    input: {
      width: '100%',
      minHeight: 40,
      color: theme.colors.text.primary,
      fontFamily: theme.typography.families.utility,
      fontVariant: ['tabular-nums'],
      fontSize: 18,
      fontWeight: '700',
      paddingHorizontal: 0,
      paddingVertical: 0,
      textAlign: 'center',
      textAlignVertical: 'center',
    },
    unit: {
      position: 'absolute',
      right: 8,
      color: theme.colors.text.secondary,
      fontSize: 13,
    },
    valueButton: {
      width: 84,
      minHeight: 42,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
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
      position: 'absolute',
      right: 8,
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
    disclosure: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border.light,
    },
    disclosureText: { color: theme.colors.text.primary, fontSize: 14, fontWeight: '600' },
    disclosureAction: { color: theme.colors.primary, fontSize: 14, fontWeight: '600' },
    preview: {
      gap: 4,
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

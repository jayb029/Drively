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
          <View style={styles.field}>
            <Text style={styles.label}>Total required hours</Text>
            <View style={styles.inputRow}>
              <TextInput
                accessibilityLabel="Total required hours"
                keyboardType="decimal-pad"
                onChangeText={setTotalHours}
                selectTextOnFocus
                style={styles.input}
                value={totalHours}
              />
              <Text style={styles.unit}>hours</Text>
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Night minimum</Text>
            <View style={styles.inputRow}>
              <TextInput
                accessibilityLabel="Required night hours"
                keyboardType="decimal-pad"
                onChangeText={setNightHours}
                selectTextOnFocus
                style={styles.input}
                value={nightHours}
              />
              <Text style={styles.unit}>hours</Text>
            </View>
          </View>
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
      gap: 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border.light,
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
      width: 110,
      minHeight: 48,
      borderWidth: 1,
      borderColor: theme.colors.border.medium,
      borderRadius: 7,
      backgroundColor: theme.colors.surface,
      color: theme.colors.text.primary,
      fontFamily: theme.typography.families.utility,
      fontVariant: ['tabular-nums'],
      fontSize: 20,
      fontWeight: '700',
      paddingHorizontal: 12,
    },
    unit: {
      color: theme.colors.text.secondary,
      fontSize: 15,
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

import React, { useMemo } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDriving } from '../contexts/DrivingContext';
import { useTheme } from '../contexts/ThemeContext';
import { formatDateForDisplay, formatDuration } from '../utils/time';

export default function DashboardScreen({ navigation }) {
  const { detectedEvents, drives, loading, settings, supervisorProfiles, user } = useDriving();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  if (loading) return null;

  const totalMinutes = drives.reduce((sum, drive) => sum + drive.duration, 0);
  const dayGoalMinutes = user.goalDayHours * 60;
  const nightGoalMinutes = user.goalNightHours * 60;
  const dayMinutes = drives.filter((drive) => !drive.isNightDrive).reduce((sum, drive) => sum + drive.duration, 0);
  const nightMinutes = drives.filter((drive) => drive.isNightDrive).reduce((sum, drive) => sum + drive.duration, 0);
  const detectedOpen = detectedEvents.filter((event) => event.status === 'new').length;
  const recentDrives = [...drives].slice(-4).reverse();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Drively</Text>
            <Text style={styles.subtitle}>{formatDuration(totalMinutes)} logged across {drives.length} drives</Text>
          </View>
          <TouchableOpacity style={styles.primaryIconButton} onPress={() => navigation.navigate('LogDrive')}>
            <Icon name="plus" size={24} color={theme.colors.text.inverse} />
          </TouchableOpacity>
        </View>

        <View style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <Text style={styles.cardTitle}>Required Hours</Text>
            <Text style={styles.cardValue}>{Math.round(((dayMinutes + nightMinutes) / Math.max(dayGoalMinutes + nightGoalMinutes, 1)) * 100)}%</Text>
          </View>
          <ProgressRow
            label="Day"
            minutes={dayMinutes}
            goalMinutes={dayGoalMinutes}
            color={theme.colors.primary}
            styles={styles}
          />
          <ProgressRow
            label="Night"
            minutes={nightMinutes}
            goalMinutes={nightGoalMinutes}
            color={theme.colors.secondary}
            styles={styles}
          />
        </View>

        <View style={styles.metricGrid}>
          <Metric label="Supervisors" value={String(supervisorProfiles.length)} icon="account-supervisor-outline" theme={theme} />
          <Metric label="Detected" value={String(detectedOpen)} icon="radar" theme={theme} />
          <Metric label="Tracking" value={settings.driveDetectionEnabled ? 'On' : 'Off'} icon="crosshairs-gps" theme={theme} />
        </View>

        {detectedOpen > 0 && (
          <TouchableOpacity style={styles.detectedPanel} onPress={() => navigation.navigate('LogDrive')}>
            <Icon name="car-connected" size={22} color={theme.colors.primary} />
            <View style={styles.detectedText}>
              <Text style={styles.detectedTitle}>{detectedOpen} detected drive{detectedOpen === 1 ? '' : 's'}</Text>
              <Text style={styles.detectedBody}>Open the log screen to confirm and save.</Text>
            </View>
            <Icon name="chevron-right" size={22} color={theme.colors.text.secondary} />
          </TouchableOpacity>
        )}

        <View style={styles.quickActions}>
          <ActionButton label="Log Drive" icon="car-clock" onPress={() => navigation.navigate('LogDrive')} theme={theme} />
          <ActionButton label="History" icon="format-list-bulleted" onPress={() => navigation.navigate('DriveHistory')} theme={theme} />
          <ActionButton label="Supervisors" icon="account-plus-outline" onPress={() => navigation.navigate('Supervisors')} theme={theme} />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Drives</Text>
            <TouchableOpacity onPress={() => navigation.navigate('DriveHistory')}>
              <Text style={styles.linkText}>View all</Text>
            </TouchableOpacity>
          </View>

          {recentDrives.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No drives logged</Text>
              <Text style={styles.emptyBody}>Start a timed drive or confirm a detected drive.</Text>
            </View>
          ) : (
            recentDrives.map((drive) => (
              <View key={drive.id} style={styles.driveRow}>
                <View style={styles.driveIcon}>
                  <Icon name={drive.isNightDrive ? 'weather-night' : 'white-balance-sunny'} size={18} color={theme.colors.primary} />
                </View>
                <View style={styles.driveMain}>
                  <Text style={styles.driveTitle}>{formatDateForDisplay(drive.date)}</Text>
                  <Text style={styles.driveMeta}>
                    {drive.startTime} to {drive.endTime}
                    {drive.routeSummary?.distanceKm ? ` · ${drive.routeSummary.distanceKm} km` : ''}
                  </Text>
                </View>
                <Text style={styles.driveDuration}>{formatDuration(drive.duration)}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ProgressRow({ color, goalMinutes, label, minutes, styles }) {
  const percent = Math.min(100, Math.round((minutes / Math.max(goalMinutes, 1)) * 100));
  return (
    <View style={styles.progressRow}>
      <View style={styles.progressLabelRow}>
        <Text style={styles.progressLabel}>{label}</Text>
        <Text style={styles.progressMeta}>{formatDuration(minutes)} / {formatDuration(goalMinutes)}</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${percent}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function Metric({ icon, label, theme, value }) {
  return (
    <View style={{
      flex: 1,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.colors.border.light,
      backgroundColor: theme.colors.surface,
      padding: 14,
      gap: 10,
    }}>
      <Icon name={icon} size={20} color={theme.colors.text.secondary} />
      <View>
        <Text style={{ color: theme.colors.text.primary, fontSize: 18, fontWeight: '700' }}>{value}</Text>
        <Text style={{ color: theme.colors.text.secondary, fontSize: 12, marginTop: 2 }}>{label}</Text>
      </View>
    </View>
  );
}

function ActionButton({ icon, label, onPress, theme }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        flex: 1,
        minHeight: 76,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border.light,
        backgroundColor: theme.colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
      }}
    >
      <Icon name={icon} size={21} color={theme.colors.primary} />
      <Text style={{ color: theme.colors.text.primary, fontSize: 13, fontWeight: '700' }}>{label}</Text>
    </TouchableOpacity>
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
      fontSize: 28,
      fontWeight: '800',
    },
    subtitle: {
      color: theme.colors.text.secondary,
      fontSize: 14,
      marginTop: 2,
    },
    primaryIconButton: {
      width: 48,
      height: 48,
      borderRadius: 8,
      backgroundColor: theme.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    progressCard: {
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.colors.border.light,
      backgroundColor: theme.colors.surface,
      padding: 16,
      gap: 14,
    },
    progressHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    cardTitle: {
      color: theme.colors.text.primary,
      fontSize: 17,
      fontWeight: '700',
    },
    cardValue: {
      color: theme.colors.primary,
      fontSize: 20,
      fontWeight: '800',
    },
    progressRow: {
      gap: 7,
    },
    progressLabelRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    progressLabel: {
      color: theme.colors.text.primary,
      fontSize: 14,
      fontWeight: '700',
    },
    progressMeta: {
      color: theme.colors.text.secondary,
      fontSize: 13,
    },
    progressTrack: {
      height: 8,
      borderRadius: 4,
      overflow: 'hidden',
      backgroundColor: theme.colors.border.light,
    },
    progressFill: {
      height: '100%',
      borderRadius: 4,
    },
    metricGrid: {
      flexDirection: 'row',
      gap: 10,
    },
    detectedPanel: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.colors.border.light,
      backgroundColor: theme.colors.surface,
      padding: 14,
    },
    detectedText: {
      flex: 1,
    },
    detectedTitle: {
      color: theme.colors.text.primary,
      fontSize: 14,
      fontWeight: '700',
    },
    detectedBody: {
      color: theme.colors.text.secondary,
      fontSize: 13,
      marginTop: 2,
    },
    quickActions: {
      flexDirection: 'row',
      gap: 10,
    },
    section: {
      gap: 10,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sectionTitle: {
      color: theme.colors.text.primary,
      fontSize: 17,
      fontWeight: '700',
    },
    linkText: {
      color: theme.colors.primary,
      fontSize: 14,
      fontWeight: '700',
    },
    emptyCard: {
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.colors.border.light,
      backgroundColor: theme.colors.surface,
      padding: 16,
    },
    emptyTitle: {
      color: theme.colors.text.primary,
      fontSize: 15,
      fontWeight: '700',
    },
    emptyBody: {
      color: theme.colors.text.secondary,
      fontSize: 13,
      marginTop: 3,
    },
    driveRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.colors.border.light,
      backgroundColor: theme.colors.surface,
      padding: 12,
      marginBottom: 10,
    },
    driveIcon: {
      width: 36,
      height: 36,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceSecondary,
    },
    driveMain: {
      flex: 1,
    },
    driveTitle: {
      color: theme.colors.text.primary,
      fontSize: 14,
      fontWeight: '700',
    },
    driveMeta: {
      color: theme.colors.text.secondary,
      fontSize: 12,
      marginTop: 2,
    },
    driveDuration: {
      color: theme.colors.primary,
      fontSize: 14,
      fontWeight: '800',
    },
  });
}

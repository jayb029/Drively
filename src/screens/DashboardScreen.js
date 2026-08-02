import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDriving } from '../contexts/DrivingContext';
import { useTheme } from '../contexts/ThemeContext';
import { formatDateForDisplay, formatDuration, getCurrentDate } from '../utils/time';
import { formatDistanceFromKm } from '../utils/units';

export default function DashboardScreen({ navigation }) {
  const { detectedEvents, drives, loading, settings, user } = useDriving();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const distanceUnit = settings.distanceUnit || 'metric';

  if (loading) return null;

  const totalMinutes = drives.reduce((sum, drive) => sum + (Number(drive.duration) || 0), 0);
  const nightMinutes = drives
    .filter((drive) => drive.isNightDrive)
    .reduce((sum, drive) => sum + (Number(drive.duration) || 0), 0);
  const totalGoalMinutes = Math.max(1, Number(user.goalDayHours) * 60);
  const nightGoalMinutes = Math.max(1, Number(user.goalNightHours) * 60);
  const totalPercent = Math.min(100, Math.round((totalMinutes / totalGoalMinutes) * 100));
  const nightPercent = Math.min(100, Math.round((nightMinutes / nightGoalMinutes) * 100));
  const detectedOpen = detectedEvents.filter((event) => event.status === 'new').length;
  const recentDrives = [...drives].slice(-4).reverse();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Drively</Text>
            <Text style={styles.date}>{formatDateForDisplay(getCurrentDate())}</Text>
          </View>
          <TouchableOpacity
            accessibilityLabel="Open settings"
            accessibilityRole="button"
            onPress={() => navigation.navigate('Settings')}
            style={styles.headerButton}
          >
            <Icon name="cog-outline" size={22} color={theme.colors.text.secondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.logbookBand}>
          <View style={styles.totalBlock}>
            <Text style={styles.totalValue}>{formatDuration(totalMinutes)}</Text>
            <Text style={styles.totalLabel}>of {formatDuration(totalGoalMinutes)} logged</Text>
          </View>
          <View style={styles.bandDivider} />
          <View style={styles.percentBlock}>
            <Text style={styles.percentValue}>{totalPercent}%</Text>
            <Text style={styles.percentLabel}>complete</Text>
          </View>
        </View>

        <View style={styles.goalSection}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>Required hours</Text>
            <TouchableOpacity accessibilityRole="button" onPress={() => navigation.navigate('Goals')}>
              <Text style={styles.textAction}>Change goal</Text>
            </TouchableOpacity>
          </View>
          <ProgressLine
            label="Total"
            minutes={totalMinutes}
            goalMinutes={totalGoalMinutes}
            progress={totalPercent}
            styles={styles}
            theme={theme}
          />
          <ProgressLine
            label="Night"
            minutes={nightMinutes}
            goalMinutes={nightGoalMinutes}
            progress={nightPercent}
            styles={styles}
            theme={theme}
            night
          />
        </View>

        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => navigation.navigate('LogDrive')}
          style={styles.startButton}
        >
          <View>
            <Text style={styles.startButtonText}>Start a drive</Text>
            <Text style={styles.startButtonSubtext}>Track time, distance, and practice</Text>
          </View>
          <Icon name="arrow-right" size={22} color={theme.colors.text.inverse} />
        </TouchableOpacity>

        {detectedOpen > 0 && (
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => navigation.navigate('LogDrive')}
            style={styles.detectedRow}
          >
            <Icon name="radar" size={20} color={theme.colors.secondary} />
            <Text style={styles.detectedText}>
              {detectedOpen} detected drive{detectedOpen === 1 ? '' : 's'} waiting for review
            </Text>
            <Icon name="chevron-right" size={20} color={theme.colors.text.light} />
          </TouchableOpacity>
        )}

        <View style={styles.recentSection}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>Recent drives</Text>
            {recentDrives.length > 0 && (
              <TouchableOpacity accessibilityRole="button" onPress={() => navigation.navigate('DriveHistory')}>
                <Text style={styles.textAction}>Open logbook</Text>
              </TouchableOpacity>
            )}
          </View>

          {recentDrives.length === 0 ? (
            <View style={styles.emptyState}>
              <Icon name="notebook-outline" size={25} color={theme.colors.text.secondary} />
              <View style={styles.emptyCopy}>
                <Text style={styles.emptyTitle}>Your logbook is empty</Text>
                <Text style={styles.emptyBody}>Start a drive to add your first entry.</Text>
              </View>
            </View>
          ) : (
            <View style={styles.driveList}>
              {recentDrives.map((drive, index) => (
                <View key={drive.id} style={[styles.driveRow, index < recentDrives.length - 1 && styles.driveRowBorder]}>
                  <View style={styles.driveDateBlock}>
                    <Text style={styles.driveDay}>{formatDateForDisplay(drive.date)}</Text>
                    <Text style={styles.driveTime}>{drive.startTime}–{drive.endTime}</Text>
                  </View>
                  <View style={styles.driveMeta}>
                    <Text style={styles.driveDuration}>{formatDuration(drive.duration)}</Text>
                    <Text style={styles.driveDistance}>
                      {drive.isNightDrive ? 'Night' : 'Day'}
                      {drive.routeSummary?.distanceKm
                        ? ` · ${formatDistanceFromKm(drive.routeSummary.distanceKm, distanceUnit)}`
                        : ''}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ProgressLine({ goalMinutes, label, minutes, night, progress, styles, theme }) {
  return (
    <View style={styles.progressRow}>
      <View style={styles.progressCopy}>
        <Text style={styles.progressLabel}>{label}</Text>
        <Text style={styles.progressValue}>{formatDuration(minutes)} / {formatDuration(goalMinutes)}</Text>
      </View>
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            {
              backgroundColor: night ? theme.colors.secondary : theme.colors.primary,
              width: `${progress}%`,
            },
          ]}
        />
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
      paddingBottom: 104,
      gap: 22,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    title: {
      color: theme.colors.text.primary,
      fontFamily: theme.typography.families.display,
      fontSize: 31,
      fontWeight: '700',
      letterSpacing: -0.7,
    },
    date: {
      color: theme.colors.text.secondary,
      fontSize: 13,
      marginTop: 1,
    },
    headerButton: {
      width: 42,
      height: 42,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border.light,
      borderRadius: 7,
      backgroundColor: theme.colors.surface,
    },
    logbookBand: {
      minHeight: 114,
      flexDirection: 'row',
      borderWidth: 1,
      borderColor: theme.colors.border.dark,
      borderRadius: 7,
      backgroundColor: theme.colors.instrument.background,
      overflow: 'hidden',
    },
    totalBlock: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: 18,
    },
    totalValue: {
      color: theme.colors.instrument.text,
      fontFamily: theme.typography.families.utility,
      fontVariant: ['tabular-nums'],
      fontSize: 34,
      fontWeight: '700',
      letterSpacing: -0.5,
    },
    totalLabel: {
      color: theme.colors.instrument.muted,
      fontSize: 12,
      marginTop: 2,
      opacity: 0.72,
    },
    bandDivider: {
      width: 1,
      marginVertical: 18,
      backgroundColor: theme.colors.instrument.muted,
      opacity: 0.45,
    },
    percentBlock: {
      width: 104,
      alignItems: 'center',
      justifyContent: 'center',
    },
    percentValue: {
      color: theme.colors.instrument.accent,
      fontFamily: theme.typography.families.utility,
      fontVariant: ['tabular-nums'],
      fontSize: 25,
      fontWeight: '700',
    },
    percentLabel: {
      color: theme.colors.instrument.muted,
      fontSize: 11,
      opacity: 0.7,
    },
    goalSection: {
      gap: 15,
    },
    sectionHeading: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sectionTitle: {
      color: theme.colors.text.primary,
      fontSize: 16,
      fontWeight: '700',
    },
    textAction: {
      color: theme.colors.primary,
      fontSize: 13,
      fontWeight: '700',
    },
    progressRow: {
      gap: 7,
    },
    progressCopy: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    progressLabel: {
      color: theme.colors.text.primary,
      fontSize: 13,
      fontWeight: '600',
    },
    progressValue: {
      color: theme.colors.text.secondary,
      fontFamily: theme.typography.families.utility,
      fontVariant: ['tabular-nums'],
      fontSize: 13,
    },
    progressTrack: {
      height: 5,
      overflow: 'hidden',
      backgroundColor: theme.colors.border.light,
    },
    progressFill: {
      height: '100%',
    },
    startButton: {
      minHeight: 68,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 17,
      borderRadius: 7,
      backgroundColor: theme.colors.primary,
    },
    startButtonText: {
      color: theme.colors.text.inverse,
      fontSize: 17,
      fontWeight: '700',
    },
    startButtonSubtext: {
      color: theme.colors.text.inverse,
      fontSize: 12,
      marginTop: 2,
      opacity: 0.76,
    },
    detectedRow: {
      minHeight: 54,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: theme.colors.border.light,
    },
    detectedText: {
      flex: 1,
      color: theme.colors.text.primary,
      fontSize: 13,
      fontWeight: '600',
    },
    recentSection: {
      gap: 10,
    },
    driveList: {
      borderWidth: 1,
      borderColor: theme.colors.border.light,
      borderRadius: 7,
      overflow: 'hidden',
      backgroundColor: theme.colors.surface,
    },
    driveRow: {
      minHeight: 66,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
    },
    driveRowBorder: {
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border.light,
    },
    driveDateBlock: {
      flex: 1,
      gap: 2,
    },
    driveDay: {
      color: theme.colors.text.primary,
      fontSize: 14,
      fontWeight: '600',
    },
    driveTime: {
      color: theme.colors.text.secondary,
      fontFamily: theme.typography.families.utility,
      fontVariant: ['tabular-nums'],
      fontSize: 12,
    },
    driveMeta: {
      alignItems: 'flex-end',
      gap: 2,
    },
    driveDuration: {
      color: theme.colors.text.primary,
      fontFamily: theme.typography.families.utility,
      fontVariant: ['tabular-nums'],
      fontSize: 15,
      fontWeight: '700',
    },
    driveDistance: {
      color: theme.colors.text.secondary,
      fontSize: 11,
    },
    emptyState: {
      minHeight: 82,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 13,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: theme.colors.border.light,
      paddingHorizontal: 4,
    },
    emptyCopy: {
      gap: 2,
    },
    emptyTitle: {
      color: theme.colors.text.primary,
      fontSize: 14,
      fontWeight: '700',
    },
    emptyBody: {
      color: theme.colors.text.secondary,
      fontSize: 13,
    },
  });
}

import React, { useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { SensitiveText } from '../components/SensitiveInfo';
import { useDriving } from '../contexts/DrivingContext';
import { useTheme } from '../contexts/ThemeContext';
import {
  formatDateForDisplay,
  formatDuration,
  formatTimeForDisplay,
  getDateFromDate,
  getTimeFromDate,
} from '../utils/time';
import { formatDistanceFromKm, formatSpeedFromKmh } from '../utils/units';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'day', label: 'Day' },
  { value: 'night', label: 'Night' },
];

const SORTS = [
  { value: 'date', label: 'Newest' },
  { value: 'duration', label: 'Longest' },
  { value: 'type', label: 'Night first' },
];

export default function DriveHistoryScreen({ navigation }) {
  const { deleteDetectedEvent, deleteDrive, detectedEvents, drives, settings } = useDriving();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [filterBy, setFilterBy] = useState('all');
  const [sortBy, setSortBy] = useState('date');
  const [showOlderDetections, setShowOlderDetections] = useState(false);
  const distanceUnit = settings.distanceUnit || 'metric';
  const pendingDetectedEvents = (detectedEvents || [])
    .filter((event) => event.status === 'new' || event.status === 'opened')
    .sort((a, b) => (
      Date.parse(b.drivingStartedAt || b.detectedAt || 0) -
      Date.parse(a.drivingStartedAt || a.detectedAt || 0)
    ));
  const visibleDetectedEvents = showOlderDetections
    ? pendingDetectedEvents
    : pendingDetectedEvents.slice(0, 1);

  const processedDrives = [...drives]
    .filter((drive) => {
      if (filterBy === 'day') return !drive.isNightDrive;
      if (filterBy === 'night') return drive.isNightDrive;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'duration') return (Number(b.duration) || 0) - (Number(a.duration) || 0);
      if (sortBy === 'type' && a.isNightDrive !== b.isNightDrive) return a.isNightDrive ? -1 : 1;
      return new Date(`${b.date} ${b.startTime}`) - new Date(`${a.date} ${a.startTime}`);
    });

  const totalMinutes = drives.reduce((sum, drive) => sum + (Number(drive.duration) || 0), 0);
  const nightMinutes = drives
    .filter((drive) => drive.isNightDrive)
    .reduce((sum, drive) => sum + (Number(drive.duration) || 0), 0);

  const confirmDeleteDrive = (drive) => {
    Alert.alert('Delete drive', `Remove the entry from ${formatDateForDisplay(drive.date)}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteDrive(drive.id) },
    ]);
  };

  const confirmRemoveDetection = (event) => {
    Alert.alert('Remove detected drive?', 'Remove it if this was not your drive.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => deleteDetectedEvent(event.id) },
    ]);
  };

  const renderDrive = ({ item: drive, index }) => (
    <View style={[styles.driveRow, index < processedDrives.length - 1 && styles.driveRowBorder]}>
      <View style={styles.typeLine}>
        <Icon
          name={drive.isNightDrive ? 'weather-night' : 'white-balance-sunny'}
          size={17}
          color={drive.isNightDrive ? theme.colors.secondary : theme.colors.primary}
        />
      </View>
      <View style={styles.driveCopy}>
        <View style={styles.driveTopLine}>
          <Text style={styles.driveDate}>{formatDateForDisplay(drive.date)}</Text>
          <Text style={styles.driveDuration}>{formatDuration(drive.duration)}</Text>
        </View>
        <Text style={styles.driveTime}>
          {formatTimeForDisplay(drive.startTime)}–{formatTimeForDisplay(drive.endTime)}
          {drive.destination ? ` · ${drive.destination}` : ''}
        </Text>
        {!!drive.supervisorName && (
          <View style={styles.supervisorLine}>
            <Text style={styles.driveDetail}>With </Text>
            <SensitiveText
              revealLabel="Drive supervisor"
              textStyle={styles.driveDetail}
              value={drive.supervisorName}
            />
          </View>
        )}
        {!!drive.routeSummary && (
          <Text style={styles.driveDetail}>
            {formatDistanceFromKm(drive.routeSummary.distanceKm, distanceUnit)}
            {' · '}avg {formatSpeedFromKmh(drive.routeSummary.averageSpeedKmh, distanceUnit)}
          </Text>
        )}
        {!!drive.skills && <Text numberOfLines={1} style={styles.driveDetail}>{drive.skills}</Text>}
      </View>
      <TouchableOpacity
        accessibilityLabel={`Delete drive from ${formatDateForDisplay(drive.date)}`}
        accessibilityRole="button"
        onPress={() => confirmDeleteDrive(drive)}
        style={styles.deleteButton}
      >
        <Icon name="trash-can-outline" size={18} color={theme.colors.error} />
      </TouchableOpacity>
    </View>
  );

  const listHeader = (
    <View style={styles.listHeader}>
      <View style={styles.summaryBand}>
        <SummaryValue label="drives" value={String(drives.length)} styles={styles} />
        <View style={styles.summaryDivider} />
        <SummaryValue label="logged" value={formatDuration(totalMinutes)} styles={styles} />
        <View style={styles.summaryDivider} />
        <SummaryValue label="at night" value={formatDuration(nightMinutes)} styles={styles} />
      </View>

      {pendingDetectedEvents.length > 0 && (
        <View style={styles.detectedSection}>
          <Text style={styles.sectionTitle}>Detected drives</Text>
          <View style={styles.detectedList}>
            {visibleDetectedEvents.map((event, index) => {
              const timestamp = event.drivingStartedAt || event.detectedAt;
              const label = timestamp
                ? `${formatDateForDisplay(getDateFromDate(timestamp))} at ${formatTimeForDisplay(getTimeFromDate(timestamp))}`
                : 'Detected drive';
              return (
                <View
                  key={event.id}
                  style={[styles.detectedRow, index < visibleDetectedEvents.length - 1 && styles.detectedRowBorder]}
                >
                  <Icon name="radar" size={18} color={theme.colors.secondary} />
                  <View style={styles.detectedCopy}>
                    <Text style={styles.detectedTitle}>{label}</Text>
                    <Text style={styles.detectedMeta}>About {formatSpeedFromKmh(event.speedKmh, distanceUnit)}</Text>
                  </View>
                  <TouchableOpacity
                    accessibilityLabel="Remove detected drive"
                    onPress={() => confirmRemoveDetection(event)}
                    style={styles.detectedAction}
                  >
                    <Icon name="close" size={18} color={theme.colors.error} />
                  </TouchableOpacity>
                </View>
              );
            })}
            {pendingDetectedEvents.length > 1 && (
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => setShowOlderDetections((current) => !current)}
                style={styles.olderDetectionsButton}
              >
                <Icon
                  name={showOlderDetections ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={theme.colors.text.secondary}
                />
                <Text style={styles.olderDetectionsText}>
                  {showOlderDetections
                    ? 'Hide older detections'
                    : `Older detections (${pendingDetectedEvents.length - 1})`}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      <View style={styles.controls}>
        <SegmentedControl onChange={setFilterBy} options={FILTERS} styles={styles} value={filterBy} />
        <View style={styles.sortLine}>
          <Text style={styles.sortLabel}>Sort</Text>
          <View style={styles.sortOptions}>
            {SORTS.map((sort) => (
              <TouchableOpacity key={sort.value} onPress={() => setSortBy(sort.value)}>
                <Text style={[styles.sortOption, sortBy === sort.value && styles.sortOptionSelected]}>{sort.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <Text style={styles.resultCount}>{processedDrives.length} entries</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Logbook</Text>
          <Text style={styles.subtitle}>Every saved practice drive</Text>
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => navigation.navigate('Export')}
          style={styles.exportButton}
        >
          <Icon name="file-export-outline" size={18} color={theme.colors.primary} />
          <Text style={styles.exportText}>Export</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        contentContainerStyle={styles.content}
        data={processedDrives}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Icon name="notebook-outline" size={28} color={theme.colors.text.secondary} />
            <Text style={styles.emptyTitle}>{drives.length ? 'No matching drives' : 'No drives logged yet'}</Text>
            <Text style={styles.emptyBody}>{drives.length ? 'Choose another filter.' : 'Start a drive to make your first entry.'}</Text>
            {!drives.length && (
              <TouchableOpacity onPress={() => navigation.navigate('LogDrive')} style={styles.emptyButton}>
                <Text style={styles.emptyButtonText}>Start a drive</Text>
              </TouchableOpacity>
            )}
          </View>
        }
        renderItem={renderDrive}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

function SummaryValue({ label, styles, value }) {
  return (
    <View style={styles.summaryValue}>
      <Text style={styles.summaryNumber}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function SegmentedControl({ onChange, options, styles, value }) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <TouchableOpacity
            accessibilityState={{ selected }}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{option.label}</Text>
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
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 14,
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
      fontSize: 13,
      marginTop: 1,
    },
    exportButton: {
      minHeight: 40,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 11,
      borderWidth: 1,
      borderColor: theme.colors.border.medium,
      borderRadius: 7,
      backgroundColor: theme.colors.surface,
    },
    exportText: {
      color: theme.colors.primary,
      fontSize: 13,
      fontWeight: '700',
    },
    content: {
      paddingHorizontal: 20,
      paddingBottom: 24,
    },
    listHeader: {
      gap: 22,
      paddingBottom: 12,
    },
    summaryBand: {
      minHeight: 86,
      flexDirection: 'row',
      alignItems: 'stretch',
      borderRadius: 7,
      backgroundColor: theme.colors.instrument.background,
      overflow: 'hidden',
    },
    summaryValue: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: 10,
    },
    summaryDivider: {
      width: 1,
      marginVertical: 16,
      backgroundColor: theme.colors.instrument.muted,
      opacity: 0.42,
    },
    summaryNumber: {
      color: theme.colors.instrument.text,
      fontFamily: theme.typography.families.utility,
      fontVariant: ['tabular-nums'],
      fontSize: 18,
      fontWeight: '700',
    },
    summaryLabel: {
      color: theme.colors.instrument.muted,
      fontSize: 10,
      marginTop: 2,
      opacity: 0.7,
    },
    sectionTitle: {
      color: theme.colors.text.primary,
      fontSize: 15,
      fontWeight: '700',
    },
    detectedSection: {
      gap: 9,
    },
    detectedList: {
      borderWidth: 1,
      borderColor: theme.colors.border.light,
      borderRadius: 7,
      overflow: 'hidden',
      backgroundColor: theme.colors.surface,
    },
    detectedRow: {
      minHeight: 58,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 13,
    },
    detectedRowBorder: {
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border.light,
    },
    detectedCopy: {
      flex: 1,
      gap: 1,
    },
    detectedTitle: {
      color: theme.colors.text.primary,
      fontSize: 13,
      fontWeight: '600',
    },
    detectedMeta: {
      color: theme.colors.text.secondary,
      fontSize: 11,
    },
    detectedAction: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    olderDetectionsButton: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 13,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border.light,
      backgroundColor: theme.colors.surfaceSecondary,
    },
    olderDetectionsText: {
      color: theme.colors.text.secondary,
      fontSize: 12,
      fontWeight: '600',
    },
    controls: {
      gap: 13,
    },
    segmented: {
      minHeight: 44,
      flexDirection: 'row',
      borderWidth: 1,
      borderColor: theme.colors.border.medium,
      borderRadius: 7,
      overflow: 'hidden',
      backgroundColor: theme.colors.surface,
    },
    segment: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderBottomWidth: 3,
      borderBottomColor: 'transparent',
    },
    segmentSelected: {
      backgroundColor: theme.colors.surfaceSecondary,
      borderBottomColor: theme.colors.primary,
    },
    segmentText: {
      color: theme.colors.text.secondary,
      fontSize: 13,
      fontWeight: '600',
    },
    segmentTextSelected: {
      color: theme.colors.primary,
    },
    sortLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    sortLabel: {
      color: theme.colors.text.secondary,
      fontSize: 12,
    },
    sortOptions: {
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    sortOption: {
      color: theme.colors.text.secondary,
      fontSize: 12,
    },
    sortOptionSelected: {
      color: theme.colors.primary,
      fontWeight: '700',
      textDecorationLine: 'underline',
    },
    resultCount: {
      color: theme.colors.text.light,
      fontSize: 11,
    },
    driveRow: {
      minHeight: 92,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 11,
      paddingVertical: 14,
      paddingHorizontal: 4,
    },
    driveRowBorder: {
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border.light,
    },
    typeLine: {
      width: 24,
      paddingTop: 2,
      alignItems: 'center',
    },
    driveCopy: {
      flex: 1,
      gap: 3,
    },
    driveTopLine: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    driveDate: {
      color: theme.colors.text.primary,
      fontSize: 14,
      fontWeight: '700',
    },
    driveDuration: {
      color: theme.colors.text.primary,
      fontFamily: theme.typography.families.utility,
      fontVariant: ['tabular-nums'],
      fontSize: 14,
      fontWeight: '700',
    },
    driveTime: {
      color: theme.colors.text.secondary,
      fontFamily: theme.typography.families.utility,
      fontVariant: ['tabular-nums'],
      fontSize: 12,
    },
    supervisorLine: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
    },
    driveDetail: {
      color: theme.colors.text.secondary,
      fontSize: 11,
    },
    deleteButton: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    empty: {
      alignItems: 'center',
      paddingVertical: 42,
      gap: 6,
    },
    emptyTitle: {
      color: theme.colors.text.primary,
      fontSize: 16,
      fontWeight: '700',
      marginTop: 5,
    },
    emptyBody: {
      color: theme.colors.text.secondary,
      fontSize: 13,
    },
    emptyButton: {
      minHeight: 44,
      minWidth: 140,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 7,
      backgroundColor: theme.colors.primary,
      marginTop: 10,
    },
    emptyButtonText: {
      color: theme.colors.text.inverse,
      fontSize: 14,
      fontWeight: '700',
    },
  });
}

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  FlatList,
  Alert,
} from 'react-native';
import { useDriving } from '../contexts/DrivingContext';
import { useTheme } from '../contexts/ThemeContext';
import { SensitiveText } from '../components/SensitiveInfo';
import { 
  formatDuration, 
  formatDateForDisplay, 
  formatTimeForDisplay 
} from '../utils/time';
import { formatDistanceFromKm, formatSpeedFromKmh } from '../utils/units';

export default function DriveHistoryScreen({ navigation }) {
  const { drives, deleteDrive, settings } = useDriving();
  const { theme } = useTheme();
  const distanceUnit = settings.distanceUnit || 'metric';
  const [sortBy, setSortBy] = useState('date'); // 'date', 'duration', 'type'
  const [filterBy, setFilterBy] = useState('all'); // 'all', 'day', 'night'

  // Sort and filter drives
  const processedDrives = drives
    .filter(drive => {
      if (filterBy === 'day') return !drive.isNightDrive;
      if (filterBy === 'night') return drive.isNightDrive;
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'date':
          return new Date(b.date + ' ' + b.startTime) - new Date(a.date + ' ' + a.startTime);
        case 'duration':
          return b.duration - a.duration;
        case 'type':
          if (a.isNightDrive === b.isNightDrive) {
            return new Date(b.date + ' ' + b.startTime) - new Date(a.date + ' ' + a.startTime);
          }
          return a.isNightDrive ? -1 : 1;
        default:
          return 0;
      }
    });

  const handleDeleteDrive = (drive) => {
    Alert.alert(
      'Delete Drive',
      `Are you sure you want to delete the drive from ${formatDateForDisplay(drive.date)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteDrive(drive.id);
            Alert.alert('Drive Deleted', 'The drive has been removed from your log.');
          },
        },
      ]
    );
  };

  const renderDriveItem = ({ item: drive }) => (
    <View style={[styles.driveCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border.light }]}>
      <View style={styles.driveHeader}>
        <View style={styles.driveInfo}>
          <Text style={[styles.driveDate, { color: theme.colors.text.primary }]}>
            {formatDateForDisplay(drive.date)}
            {drive.isNightDrive && ' 🌙'}
          </Text>
          <Text style={[styles.driveTime, { color: theme.colors.text.secondary }]}>
            {formatTimeForDisplay(drive.startTime)} - {formatTimeForDisplay(drive.endTime)}
          </Text>
        </View>
        <View style={styles.driveDuration}>
          <Text style={[styles.durationText, { color: theme.colors.primary }]}>{formatDuration(drive.duration)}</Text>
          <Text style={[styles.durationLabel, { color: theme.colors.text.secondary }]}>
            {drive.isNightDrive ? 'Night' : 'Day'}
          </Text>
        </View>
      </View>

      {(drive.weather || drive.skills) && (
        <View style={styles.driveDetails}>
          {drive.weather && (
            <Text style={[styles.detailText, { color: theme.colors.text.secondary }]}>Weather: {drive.weather}</Text>
          )}
          {drive.skills && (
            <Text style={[styles.detailText, { color: theme.colors.text.secondary }]}>Skills: {drive.skills}</Text>
          )}
          {drive.supervisorName && (
            <View style={styles.sensitiveDetailRow}>
              <Text style={[styles.detailText, { color: theme.colors.text.secondary }]}>Supervisor: </Text>
              <SensitiveText
                value={`${drive.supervisorName}${drive.supervisorAge ? ` (${drive.supervisorAge})` : ''}`}
                textStyle={[styles.detailText, { color: theme.colors.text.secondary }]}
                revealLabel="Drive supervisor"
              />
            </View>
          )}
          {drive.destination && (
            <Text style={[styles.detailText, { color: theme.colors.text.secondary }]}>Destination: {drive.destination}</Text>
          )}
          {drive.routeSummary && (
            <Text style={[styles.detailText, { color: theme.colors.text.secondary }]}>
              Tracking: {formatDistanceFromKm(drive.routeSummary.distanceKm, distanceUnit)} · avg {formatSpeedFromKmh(drive.routeSummary.averageSpeedKmh, distanceUnit)} · max {formatSpeedFromKmh(drive.routeSummary.maxSpeedKmh, distanceUnit)}
            </Text>
          )}
          {drive.source === 'detected' && (
            <Text style={[styles.detailText, { color: theme.colors.primary }]}>Started from drive detection</Text>
          )}
        </View>
      )}

      <View style={styles.driveActions}>
        <TouchableOpacity
          style={[styles.deleteButton, { backgroundColor: theme.colors.error + '20', borderColor: theme.colors.error }]}
          onPress={() => handleDeleteDrive(drive)}
        >
          <Text style={[styles.deleteButtonText, { color: theme.colors.error }]}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderHeader = () => (
    <View>
      {/* Statistics */}
      <View style={styles.statsContainer}>
        <View style={[styles.statCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border.light }]}>
          <Text style={[styles.statNumber, { color: theme.colors.primary }]}>{drives.length}</Text>
          <Text style={[styles.statLabel, { color: theme.colors.text.secondary }]}>Total Drives</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border.light }]}>
          <Text style={[styles.statNumber, { color: theme.colors.primary }]}>
            {formatDuration(drives.reduce((sum, drive) => sum + drive.duration, 0))}
          </Text>
          <Text style={[styles.statLabel, { color: theme.colors.text.secondary }]}>Total Time</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border.light }]}>
          <Text style={[styles.statNumber, { color: theme.colors.primary }]}>
            {drives.filter(drive => drive.isNightDrive).length}
          </Text>
          <Text style={[styles.statLabel, { color: theme.colors.text.secondary }]}>Night Drives</Text>
        </View>
      </View>

      {/* Filters and Sort */}
      <View style={[styles.controlsContainer, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border.light }]}>
        {/* Filter */}
        <View style={styles.filterContainer}>
          <Text style={[styles.controlLabel, { color: theme.colors.text.primary }]}>Filter:</Text>
          <View style={styles.filterButtons}>
            {[
              { key: 'all', label: 'All' },
              { key: 'day', label: 'Day' },
              { key: 'night', label: 'Night' },
            ].map((filter) => (
              <TouchableOpacity
                key={filter.key}
                style={[
                  styles.filterButton,
                  { backgroundColor: theme.colors.surfaceSecondary, borderColor: theme.colors.border.light },
                  filterBy === filter.key && { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
                ]}
                onPress={() => setFilterBy(filter.key)}
              >
                <Text style={[
                  styles.filterButtonText,
                  { color: theme.colors.text.primary },
                  filterBy === filter.key && { color: theme.colors.text.inverse, fontWeight: '600' },
                ]}>
                  {filter.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Sort */}
        <View style={styles.sortContainer}>
          <Text style={[styles.controlLabel, { color: theme.colors.text.primary }]}>Sort by:</Text>
          <View style={styles.sortButtons}>
            {[
              { key: 'date', label: 'Date' },
              { key: 'duration', label: 'Duration' },
              { key: 'type', label: 'Type' },
            ].map((sort) => (
              <TouchableOpacity
                key={sort.key}
                style={[
                  styles.sortButton,
                  { backgroundColor: theme.colors.surfaceSecondary, borderColor: theme.colors.border.light },
                  sortBy === sort.key && { backgroundColor: theme.colors.success || '#10b981', borderColor: theme.colors.success || '#10b981' },
                ]}
                onPress={() => setSortBy(sort.key)}
              >
                <Text style={[
                  styles.sortButtonText,
                  { color: theme.colors.text.primary },
                  sortBy === sort.key && { color: theme.colors.text.inverse, fontWeight: '600' },
                ]}>
                  {sort.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* Results count */}
      <Text style={[styles.resultsText, { color: theme.colors.text.secondary }]}>
        {processedDrives.length} drive{processedDrives.length !== 1 ? 's' : ''} found
      </Text>
    </View>
  );

  const renderEmptyState = () => (
    <View style={[styles.emptyState, { backgroundColor: theme.colors.background }]}>
      <Text style={styles.emptyStateIcon}>📝</Text>
      <Text style={[styles.emptyStateTitle, { color: theme.colors.text.primary }]}>No drives yet</Text>
      <Text style={[styles.emptyStateText, { color: theme.colors.text.secondary }]}>
        Start logging your drives to see them here!
      </Text>
      <TouchableOpacity
        style={[styles.startDrivingButton, { backgroundColor: theme.colors.primary }]}
        onPress={() => navigation.navigate('LogDrive')}
      >
        <Text style={[styles.startDrivingButtonText, { color: theme.colors.text.inverse }]}>Log First Drive</Text>
      </TouchableOpacity>
    </View>
  );
  if (processedDrives.length === 0) {
    return renderEmptyState();
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.header, { backgroundColor: theme.colors.surface }]}>
        <Text style={[styles.title, { color: theme.colors.text.primary }]}>Drive History</Text>
        <TouchableOpacity
          style={[styles.exportButton, { backgroundColor: theme.colors.primary }]}
          onPress={() => navigation.navigate('Export')}
        >
          <Text style={[styles.exportButtonText, { color: theme.colors.text.inverse }]}>Export</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={processedDrives}
        renderItem={renderDriveItem}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderHeader}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    paddingBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  exportButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  exportButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  listContent: {
    padding: 24,
    paddingTop: 16,
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 4,
  },
  statNumber: {
    fontSize: 22,
    fontWeight: '700',
    color: '#3b82f6',
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  statLabel: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    fontWeight: '500',
  },
  controlsContainer: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  filterContainer: {
    marginBottom: 16,
  },
  sortContainer: {
    marginBottom: 0,
  },
  controlLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  filterButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  sortButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  filterButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  activeFilterButton: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  filterButtonText: {
    fontSize: 12,
    color: '#6b7280',
  },
  activeFilterButtonText: {
    color: 'white',
  },
  sortButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  activeSortButton: {
    backgroundColor: '#10b981',
    borderColor: '#10b981',
  },
  sortButtonText: {
    fontSize: 12,
    color: '#6b7280',
  },
  activeSortButtonText: {
    color: 'white',
  },
  resultsText: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 16,
  },
  driveCard: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 4,
  },
  driveHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  driveInfo: {
    flex: 1,
  },
  driveDate: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 2,
  },
  driveTime: {
    fontSize: 14,
    color: '#6b7280',
  },
  driveDuration: {
    alignItems: 'flex-end',
  },
  durationText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2563eb',
  },
  durationLabel: {
    fontSize: 12,
    color: '#6b7280',
  },
  driveDetails: {
    marginBottom: 12,
    gap: 4,
  },
  sensitiveDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  detailText: {
    fontSize: 12,
    color: '#6b7280',
  },
  driveActions: {
    flexDirection: 'row',
  },
  deleteButton: {
    flex: 1,
    backgroundColor: '#fef2f2',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
  },
  deleteButtonText: {
    fontSize: 14,
    color: '#dc2626',
    fontWeight: '500',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 48,
  },
  emptyStateIcon: {
    fontSize: 72,
    marginBottom: 20,
  },
  emptyStateTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  emptyStateText: {
    fontSize: 17,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  startDrivingButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderRadius: 12,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  startDrivingButtonText: {
    color: 'white',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});

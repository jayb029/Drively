import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Switch,
  TextInput,
  Alert,
  Share,
  Platform,
} from 'react-native';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDriving } from '../contexts/DrivingContext';
import { useTheme, THEME_MODES } from '../contexts/ThemeContext';
import { SensitiveField } from '../components/SensitiveInfo';
import { clearAllData, importDataFromJSON } from '../utils/storage';
import { getAppVersion } from '../utils/appInfo';
import { createDevDrivingData } from '../utils/devData';
import {
  formatDateOfBirthFromDate,
  formatDateOfBirthInput,
  getDateOfBirthDate,
  getMinimumDateOfBirthDate,
} from '../utils/time';
import {
  isDriveDetectionRunning,
  requestDriveDetectionPermissions,
  startDriveDetection,
  stopDriveDetection,
} from '../services/driveDetection';
import * as Updates from 'expo-updates';
import { 
  getLogStats, 
  clearLogs, 
  exportLogs, 
  getRecentLogs,
  cleanupOldLogs,
  logUserAction 
} from '../utils/logger';

export default function SettingsScreen({ navigation }) {
  const { 
    user, 
    supervisorProfiles,
    drives,
    detectedEvents,
    streaks,
    settings, 
    updateSettings, 
    setUserInfo, 
    replaceData,
    resetData 
  } = useDriving();

  const { theme, themeMode, setThemeMode } = useTheme();
  const styles = React.useMemo(() => createStyles(theme), [theme]);

  const [editingGoals, setEditingGoals] = useState(false);
  const [tempDayHours, setTempDayHours] = useState(user.goalDayHours.toString());
  const [tempNightHours, setTempNightHours] = useState(user.goalNightHours.toString());
  const [editingDriverInfo, setEditingDriverInfo] = useState(false);
  const [tempDriverName, setTempDriverName] = useState(user.driverName || user.fullName || user.name || '');
  const [tempDateOfBirth, setTempDateOfBirth] = useState(formatDateOfBirthInput(user.dateOfBirth || user.birthDate || user.dob || ''));
  const [tempPermitNumber, setTempPermitNumber] = useState(user.permitNumber || user.licenseNumber || '');
  
  // Debug logging state
  const [logStats, setLogStats] = useState(null);
  const [recentLogs, setRecentLogs] = useState([]);
  const [logsLoaded, setLogsLoaded] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [showDebugDetails, setShowDebugDetails] = useState(false);
  const [driveDetectionRunning, setDriveDetectionRunning] = useState(false);
  const [updatingDetection, setUpdatingDetection] = useState(false);
  const [checkingForUpdate, setCheckingForUpdate] = useState(false);
  const [applyingUpdate, setApplyingUpdate] = useState(false);
  const [updateStatus, setUpdateStatus] = useState(null);
  const [versionTapCount, setVersionTapCount] = useState(0);

  useEffect(() => {
    isDriveDetectionRunning()
      .then(setDriveDetectionRunning)
      .catch(() => setDriveDetectionRunning(false));
  }, []);

  const handleSaveGoals = () => {
    const dayHours = parseFloat(tempDayHours) || 0;
    const nightHours = parseFloat(tempNightHours) || 0;
    
    if (dayHours <= 0 || nightHours < 0) {
      Alert.alert('Invalid Input', 'Total required hours must be greater than 0, and night hours cannot be negative.');
      return;
    }
    
    if (nightHours > dayHours) {
      Alert.alert('Invalid Input', 'Night hours must be part of the total required hours.');
      return;
    }

    setUserInfo({
      goalDayHours: dayHours,
      goalNightHours: nightHours,
    });
    
    setEditingGoals(false);
    logUserAction('update_goals', 'SETTINGS', { dayHours, nightHours });
    Alert.alert('Goals Updated', 'Your driving goals have been updated.');
  };

  const handleCancelGoalEdit = () => {
    setTempDayHours(user.goalDayHours.toString());
    setTempNightHours(user.goalNightHours.toString());
    setEditingGoals(false);
  };

  const handleSaveDriverInfo = () => {
    setUserInfo({
      driverName: tempDriverName.trim(),
      dateOfBirth: tempDateOfBirth.trim(),
      permitNumber: tempPermitNumber.trim(),
    });

    setEditingDriverInfo(false);
    logUserAction('update_driver_info', 'SETTINGS');
    Alert.alert('Driver Info Updated', 'Official exports will use this driver information.');
  };

  const handleCancelDriverInfoEdit = () => {
    setTempDriverName(user.driverName || user.fullName || user.name || '');
    setTempDateOfBirth(formatDateOfBirthInput(user.dateOfBirth || user.birthDate || user.dob || ''));
    setTempPermitNumber(user.permitNumber || user.licenseNumber || '');
    setEditingDriverInfo(false);
  };

  const openDateOfBirthPicker = () => {
    DateTimePickerAndroid.open({
      value: getDateOfBirthDate(tempDateOfBirth) || new Date(1980, 0, 1),
      mode: 'date',
      minimumDate: getMinimumDateOfBirthDate(),
      maximumDate: new Date(),
      onChange: (event, selectedDate) => {
        if (event.type !== 'set' || !selectedDate) return;
        setTempDateOfBirth(formatDateOfBirthFromDate(selectedDate));
      },
    });
  };

  const handleResetData = () => {
    Alert.alert(
      'Reset All Data',
      'This will permanently delete all your drives, progress, and settings. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearAllData();
              resetData();
              Alert.alert(
                'Data Reset',
                'All data has been cleared. The app will now restart.',
                [{ text: 'OK', onPress: () => navigation.replace('Onboarding') }]
              );
            } catch (error) {
              Alert.alert('Error', 'Failed to reset data. Please try again.');
            }
          },
        },
      ]
    );
  };

  const readPickedFile = async (asset) => {
    if (Platform.OS === 'web') {
      const response = await fetch(asset.uri);
      return response.text();
    }

    return FileSystem.readAsStringAsync(asset.uri);
  };

  const handleImportJSON = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        return;
      }

      const asset = result.assets?.[0];
      if (!asset) {
        Alert.alert('Import Failed', 'No backup file was selected.');
        return;
      }

      const fileContents = await readPickedFile(asset);
      const importedData = await importDataFromJSON(fileContents);

      if (!importedData) {
        Alert.alert('Import Failed', 'That file is not a valid Drively JSON backup.');
        return;
      }

      Alert.alert(
        'Import Backup',
        'This will replace your current local Drively data with the selected backup.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Import',
            onPress: () => {
              replaceData(importedData);
              logUserAction('import_json_backup', 'SETTINGS', {
                drivesCount: importedData.drives?.length || 0,
              });
              Alert.alert('Backup Imported', 'Your Drively backup has been restored.');
            },
          },
        ]
      );
    } catch (error) {
      console.error('Import JSON error:', error);
      Alert.alert('Import Failed', 'Unable to import that backup file.');
    }
  };

  const loadDevData = () => {
    if (!__DEV__) return;

    Alert.alert(
      'Load Fake Dev Data',
      'This fills in missing placeholder drives and supervisors without replacing your current local data.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Load',
          onPress: () => {
            const fakeData = createDevDrivingData({
              user,
              supervisorProfiles,
              drives,
              detectedEvents,
              streaks,
              settings,
            });
            replaceData(fakeData);
            logUserAction('load_fake_dev_data', 'SETTINGS', {
              drivesAdded: Math.max(fakeData.drives.length - drives.length, 0),
              supervisorsAdded: Math.max(fakeData.supervisorProfiles.length - supervisorProfiles.length, 0),
            });
            Alert.alert('Fake Data Loaded', 'Placeholder development data has been added.');
          },
        },
      ]
    );
  };

  const handleAppVersionPress = () => {
    if (!__DEV__) return;

    setVersionTapCount((count) => {
      const nextCount = count + 1;
      if (nextCount >= 10) {
        loadDevData();
        return 0;
      }
      return nextCount;
    });
  };

  const handleDriveDetectionToggle = async (enabled) => {
    try {
      setUpdatingDetection(true);

      if (enabled) {
        const permissions = await requestDriveDetectionPermissions();
        updateSettings({
          notificationPermissionStatus: permissions.notifications,
          backgroundLocationStatus: permissions.backgroundLocation,
        });

        if (!permissions.granted) {
          Alert.alert(
            'Permissions needed',
            'Drive detection needs notification, foreground location, and background location permission on Android.'
          );
          return;
        }

        await startDriveDetection();
        setDriveDetectionRunning(true);
        updateSettings({ driveDetectionEnabled: true });
      } else {
        await stopDriveDetection();
        setDriveDetectionRunning(false);
        updateSettings({ driveDetectionEnabled: false });
      }
    } catch (error) {
      Alert.alert('Tracking Error', 'Could not update drive detection. Try again from a development or release build.');
    } finally {
      setUpdatingDetection(false);
    }
  };

  const formatUpdateDate = (date) => {
    if (!date) return 'Embedded build';
    return date.toLocaleString();
  };

  const handleCheckForUpdates = async () => {
    if (!Updates.isEnabled || __DEV__) {
      Alert.alert(
        'Updates Unavailable',
        'OTA updates can only be checked from an installed preview or production build.'
      );
      return;
    }

    try {
      setCheckingForUpdate(true);
      setUpdateStatus('Checking for updates...');
      const result = await Updates.checkForUpdateAsync();

      if (result.isAvailable || result.isRollBackToEmbedded) {
        setUpdateStatus('Update available. Tap Update Now to download and apply it.');
        Alert.alert('Update Available', 'A new update is available. Tap Update Now to install it.');
        return;
      }

      setUpdateStatus('You are up to date.');
      Alert.alert('No Update Available', 'You are already running the latest available update.');
    } catch (error) {
      setUpdateStatus('Could not check for updates.');
      Alert.alert('Update Check Failed', 'Could not check for updates. Try again later from a preview or production build.');
    } finally {
      setCheckingForUpdate(false);
    }
  };

  const handleApplyUpdate = async () => {
    if (!Updates.isEnabled || __DEV__) {
      Alert.alert(
        'Updates Unavailable',
        'OTA updates can only be installed from an installed preview or production build.'
      );
      return;
    }

    try {
      setApplyingUpdate(true);
      setUpdateStatus('Downloading update...');
      const result = await Updates.fetchUpdateAsync();

      if (result.isNew || result.isRollBackToEmbedded) {
        setUpdateStatus('Update downloaded. Restarting...');
        logUserAction('apply_ota_update', 'SETTINGS', {
          channel: Updates.channel,
          runtimeVersion: Updates.runtimeVersion,
        });
        await Updates.reloadAsync();
        return;
      }

      setUpdateStatus('No new update is ready to install.');
      Alert.alert('No Update Available', 'There is no new update ready to install.');
    } catch (error) {
      setUpdateStatus('Could not install update.');
      Alert.alert('Update Failed', 'Could not download or apply the update. Try again later.');
    } finally {
      setApplyingUpdate(false);
    }
  };

  // Debug logging functions
  const handleLoadLogStats = async () => {
    try {
      const stats = await getLogStats();
      setLogStats(stats);
      return stats;
    } catch (error) {
      Alert.alert('Error', 'Failed to load log statistics');
      return null;
    }
  };

  const handleLoadRecentLogs = async () => {
    try {
      setLoadingLogs(true);
      const recent = await getRecentLogs(50);
      setRecentLogs(recent);
      setLogsLoaded(true);
      await handleLoadLogStats();
      return recent;
    } catch (error) {
      Alert.alert('Error', 'Failed to load recent logs');
      return [];
    } finally {
      setLoadingLogs(false);
    }
  };

  const handleClearLogs = () => {
    Alert.alert(
      'Clear Debug Logs',
      'Are you sure you want to clear all debug logs? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Clear', 
          style: 'destructive',
          onPress: async () => {
            try {
              await logUserAction('clear_logs', 'SETTINGS');
              await clearLogs();
              setLogStats({
                exists: false,
                size: 0,
                lineCount: 0,
                lastModified: null,
                sizeFormatted: '0 Bytes',
              });
              setRecentLogs([]);
              setLogsLoaded(true);
              Alert.alert('Success', 'Debug logs cleared successfully');
            } catch (error) {
              Alert.alert('Error', 'Failed to clear debug logs');
            }
          }
        },
      ]
    );
  };

  const handleExportLogs = async () => {
    try {
      const logData = await exportLogs();
      
      // Share the log file
      await Share.share({
        url: logData.uri,
        title: 'Drively Debug Logs',
        message: `Drively debug logs (${logData.sizeFormatted || 'Unknown size'})`,
      });
      
      logUserAction('export_logs', 'SETTINGS');
    } catch (error) {
      Alert.alert('Error', 'Failed to export debug logs');
    }
  };

  const handleCleanupLogs = async () => {
    try {
      await cleanupOldLogs();
      await handleLoadLogStats(); // Refresh stats
      logUserAction('cleanup_logs', 'SETTINGS');
      Alert.alert('Success', 'Old debug logs cleaned up successfully');
    } catch (error) {
      Alert.alert('Error', 'Failed to cleanup old logs');
    }
  };

  const handleViewRecentLogs = async () => {
    await handleLoadRecentLogs();
  };

  const settingSections = [
    {
      title: 'Goals & Progress',
      items: [
        {
          type: 'custom',
          component: (
            <View style={styles.goalsContainer}>
              <View style={styles.settingHeader}>
                <Text style={styles.settingTitle}>Driving Goals</Text>
                <TouchableOpacity
                  onPress={() => {
                    if (editingGoals) {
                      handleSaveGoals();
                      return;
                    }
                    setTempDayHours(user.goalDayHours.toString());
                    setTempNightHours(user.goalNightHours.toString());
                    setEditingGoals(true);
                  }}
                  style={styles.editButton}
                >
                  <Text style={styles.editButtonText}>
                    {editingGoals ? 'Save' : 'Edit'}
                  </Text>
                </TouchableOpacity>
              </View>
              
              {editingGoals ? (
                <View style={styles.editGoalsContainer}>
                  <View style={styles.goalInput}>
                    <Text style={styles.inputLabel}>Total Required Hours:</Text>
                    <TextInput
                      style={styles.numberInput}
                      value={tempDayHours}
                      onChangeText={setTempDayHours}
                      keyboardType="numeric"
                      placeholder="50"
                      placeholderTextColor={theme.colors.text.light}
                    />
                  </View>
                  <View style={styles.goalInput}>
                    <Text style={styles.inputLabel}>Night Minimum Hours:</Text>
                    <TextInput
                      style={styles.numberInput}
                      value={tempNightHours}
                      onChangeText={setTempNightHours}
                      keyboardType="numeric"
                      placeholder="10"
                      placeholderTextColor={theme.colors.text.light}
                    />
                  </View>
                  <Text style={styles.goalHelperText}>
                    Night hours count toward the total. Goal: {parseFloat(tempDayHours) || 0} total hours, including {parseFloat(tempNightHours) || 0} at night.
                  </Text>
                  
                  <TouchableOpacity
                    onPress={handleCancelGoalEdit}
                    style={styles.cancelButton}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.goalsDisplay}>
                  <Text style={styles.goalText}>
                    Total: {user.goalDayHours} hours | Night minimum: {user.goalNightHours} hours
                  </Text>
                  <Text style={styles.goalSubtext}>
                    Night hours are included in the total requirement.
                  </Text>
                </View>
              )}
            </View>
          ),
        },
        {
          type: 'custom',
          component: (
            <View style={styles.driverInfoContainer}>
              <View style={styles.settingHeader}>
                <Text style={styles.settingTitle}>Driver Information</Text>
                <TouchableOpacity
                  onPress={() => {
                    if (editingDriverInfo) {
                      handleSaveDriverInfo();
                      return;
                    }
                    setTempDriverName(user.driverName || user.fullName || user.name || '');
                    setTempDateOfBirth(formatDateOfBirthInput(user.dateOfBirth || user.birthDate || user.dob || ''));
                    setTempPermitNumber(user.permitNumber || user.licenseNumber || '');
                    setEditingDriverInfo(true);
                  }}
                  style={styles.editButton}
                >
                  <Text style={styles.editButtonText}>
                    {editingDriverInfo ? 'Save' : 'Edit'}
                  </Text>
                </TouchableOpacity>
              </View>

              {editingDriverInfo ? (
                <View style={styles.editDriverInfoContainer}>
                  <View style={styles.driverInfoInputGroup}>
                    <Text style={styles.inputLabel}>Driver Name</Text>
                    <TextInput
                      style={styles.textInput}
                      value={tempDriverName}
                      onChangeText={setTempDriverName}
                      placeholder="Full name"
                      placeholderTextColor={theme.colors.text.light}
                      autoCapitalize="words"
                    />
                  </View>
                  <View style={styles.driverInfoInputGroup}>
                    <Text style={styles.inputLabel}>Date of Birth</Text>
                    <TouchableOpacity
                      style={styles.datePickerButton}
                      onPress={openDateOfBirthPicker}
                    >
                      <Text
                        style={[
                          styles.datePickerText,
                          !tempDateOfBirth && { color: theme.colors.text.light },
                        ]}
                      >
                        {tempDateOfBirth || 'Date of birth'}
                      </Text>
                      <Icon name="calendar-month-outline" size={20} color={theme.colors.text.secondary} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.driverInfoInputGroup}>
                    <Text style={styles.inputLabel}>Permit/License Number</Text>
                    <TextInput
                      style={styles.textInput}
                      value={tempPermitNumber}
                      onChangeText={setTempPermitNumber}
                      placeholder="Optional"
                      placeholderTextColor={theme.colors.text.light}
                      autoCapitalize="characters"
                    />
                  </View>

                  <TouchableOpacity
                    onPress={handleCancelDriverInfoEdit}
                    style={styles.cancelButton}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.driverInfoDisplay}>
                  <SensitiveField
                    label="Name"
                    value={user.driverName || user.fullName || user.name}
                    fallback="Not set"
                    labelStyle={styles.driverInfoLabel}
                    valueStyle={styles.driverInfoText}
                    containerStyle={styles.driverInfoSensitiveRow}
                    revealLabel="Driver name"
                  />
                  <SensitiveField
                    label="Date of birth"
                    value={user.dateOfBirth || user.birthDate || user.dob}
                    fallback="Not set"
                    labelStyle={styles.driverInfoLabel}
                    valueStyle={styles.driverInfoText}
                    containerStyle={styles.driverInfoSensitiveRow}
                    revealLabel="Driver date of birth"
                  />
                  <SensitiveField
                    label="Permit"
                    value={user.permitNumber || user.licenseNumber}
                    fallback="Optional"
                    labelStyle={styles.driverInfoLabel}
                    valueStyle={styles.driverInfoText}
                    containerStyle={styles.driverInfoSensitiveRow}
                    revealLabel="Driver permit number"
                  />
                </View>
              )}
            </View>
          ),
        },
        {
          title: 'License Type',
          value: user.licenseType || 'Not set',
          onPress: () => Alert.alert('License Type', 'To change your license type, you\'ll need to reset the app and go through onboarding again.'),
        },
      ],
    },
    {
      title: 'Appearance & Units',
      items: [
        {
          type: 'custom',
          component: (
            <View style={styles.themeContainer}>
              <Text style={[styles.settingTitle, { color: theme.colors.text.primary }]}>Theme</Text>
              <View style={styles.themeOptions}>
                {Object.entries(THEME_MODES).map(([key, mode]) => (
                  <TouchableOpacity
                    key={mode}
                    style={[
                      styles.themeOption,
                      { backgroundColor: theme.colors.surfaceSecondary, borderColor: theme.colors.border.light },
                      themeMode === mode && { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary + '10' }
                    ]}
                    onPress={() => setThemeMode(mode)}
                  >
                    <Text style={[
                      styles.themeOptionText,
                      { color: theme.colors.text.secondary },
                      themeMode === mode && { color: theme.colors.primary }
                    ]}>
                      {mode === THEME_MODES.LIGHT && '☀️ Light'}
                      {mode === THEME_MODES.DARK && '🌙 Dark'}
                      {mode === THEME_MODES.SYSTEM && '⚙️ System'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ),
        },
        {
          type: 'custom',
          component: (
            <View style={styles.temperatureContainer}>
              <Text style={[styles.settingTitle, { color: theme.colors.text.primary }]}>Temperature Unit</Text>
              <Text style={[styles.settingSubtitle, { color: theme.colors.text.secondary }]}>Choose how to display temperature in weather data</Text>
              <View style={styles.temperatureOptions}>
                <TouchableOpacity
                  style={[
                    styles.temperatureOption,
                    { backgroundColor: theme.colors.surfaceSecondary, borderColor: theme.colors.border.light },
                    settings.temperatureUnit === 'metric' && { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary + '10' }
                  ]}
                  onPress={() => updateSettings({ temperatureUnit: 'metric' })}
                >
                  <Text style={[
                    styles.temperatureOptionText,
                    { color: theme.colors.text.secondary },
                    settings.temperatureUnit === 'metric' && { color: theme.colors.primary }
                  ]}>
                    🌡️ Celsius (20°C)
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.temperatureOption,
                    { backgroundColor: theme.colors.surfaceSecondary, borderColor: theme.colors.border.light },
                    settings.temperatureUnit === 'imperial' && { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary + '10' }
                  ]}
                  onPress={() => updateSettings({ temperatureUnit: 'imperial' })}
                >
                  <Text style={[
                    styles.temperatureOptionText,
                    { color: theme.colors.text.secondary },
                    settings.temperatureUnit === 'imperial' && { color: theme.colors.primary }
                  ]}>
                    🌡️ Fahrenheit (68°F)
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ),
        },
        {
          type: 'custom',
          component: (
            <View style={styles.temperatureContainer}>
              <Text style={[styles.settingTitle, { color: theme.colors.text.primary }]}>Distance and Speed Unit</Text>
              <Text style={[styles.settingSubtitle, { color: theme.colors.text.secondary }]}>Choose how to display mileage and speed</Text>
              <View style={styles.temperatureOptions}>
                <TouchableOpacity
                  style={[
                    styles.temperatureOption,
                    { backgroundColor: theme.colors.surfaceSecondary, borderColor: theme.colors.border.light },
                    (settings.distanceUnit || 'metric') === 'metric' && { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary + '10' }
                  ]}
                  onPress={() => updateSettings({ distanceUnit: 'metric' })}
                >
                  <Text style={[
                    styles.temperatureOptionText,
                    { color: theme.colors.text.secondary },
                    (settings.distanceUnit || 'metric') === 'metric' && { color: theme.colors.primary }
                  ]}>
                    Kilometers and km/h
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.temperatureOption,
                    { backgroundColor: theme.colors.surfaceSecondary, borderColor: theme.colors.border.light },
                    settings.distanceUnit === 'imperial' && { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary + '10' }
                  ]}
                  onPress={() => updateSettings({ distanceUnit: 'imperial' })}
                >
                  <Text style={[
                    styles.temperatureOptionText,
                    { color: theme.colors.text.secondary },
                    settings.distanceUnit === 'imperial' && { color: theme.colors.primary }
                  ]}>
                    Miles and mph
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ),
        },
      ],
    },
    {
      title: 'Tracking & Alerts',
      items: [
        {
          type: 'custom',
          component: (
            <View style={styles.trackingContainer}>
              <View style={styles.settingHeader}>
                <View style={styles.settingContent}>
                  <Text style={[styles.settingTitle, { color: theme.colors.text.primary }]}>Driving Detection</Text>
                  <Text style={[styles.settingItemSubtitle, { color: theme.colors.text.secondary }]}>
                    {driveDetectionRunning ? 'Background detector is running' : 'Notify when driving-like movement is detected'}
                  </Text>
                </View>
                <Switch
                  value={!!settings.driveDetectionEnabled}
                  onValueChange={handleDriveDetectionToggle}
                  disabled={updatingDetection}
                  trackColor={{ false: theme.colors.switchControl.trackOff, true: theme.colors.switchControl.trackOn }}
                  thumbColor={settings.driveDetectionEnabled ? theme.colors.switchControl.thumbOn : theme.colors.switchControl.thumbOff}
                />
              </View>

              <View style={styles.settingHeader}>
                <View style={styles.settingContent}>
                  <Text style={[styles.settingTitle, { color: theme.colors.text.primary }]}>Always On While Tracking</Text>
                  <Text style={[styles.settingItemSubtitle, { color: theme.colors.text.secondary }]}>
                    Keep the screen awake while a drive is actively being tracked.
                  </Text>
                </View>
                <Switch
                  value={settings.alwaysOnWhileTracking ?? true}
                  onValueChange={(value) => updateSettings({ alwaysOnWhileTracking: value })}
                  trackColor={{ false: theme.colors.switchControl.trackOff, true: theme.colors.switchControl.trackOn }}
                  thumbColor={(settings.alwaysOnWhileTracking ?? true) ? theme.colors.switchControl.thumbOn : theme.colors.switchControl.thumbOff}
                />
              </View>

              <Text style={[styles.settingTitle, { color: theme.colors.text.primary }]}>Detection Sensitivity</Text>
              <View style={styles.sensitivityOptions}>
                {[
                  { key: 'conservative', label: 'Conservative' },
                  { key: 'balanced', label: 'Balanced' },
                  { key: 'sensitive', label: 'Sensitive' },
                ].map((option) => (
                  <TouchableOpacity
                    key={option.key}
                    style={[
                      styles.sensitivityOption,
                      { backgroundColor: theme.colors.surfaceSecondary, borderColor: theme.colors.border.light },
                      settings.driveDetectionSensitivity === option.key && {
                        backgroundColor: theme.colors.primary,
                        borderColor: theme.colors.primary,
                      },
                    ]}
                    onPress={() => updateSettings({ driveDetectionSensitivity: option.key })}
                  >
                    <Text
                      style={[
                        styles.sensitivityText,
                        { color: theme.colors.text.primary },
                        settings.driveDetectionSensitivity === option.key && { color: theme.colors.text.inverse },
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.settingItemSubtitle, { color: theme.colors.text.secondary }]}>
                Notifications: {settings.notificationPermissionStatus || 'not requested'} | Background location: {settings.backgroundLocationStatus || 'not requested'} | Storage: {settings.storagePermissionStatus || 'not requested'}
              </Text>
            </View>
          ),
        },
      ],
    },
    {
      title: 'Backup & Data',
      items: [
        {
          title: 'Backup Reminders',
          type: 'switch',
          value: settings.backupReminder,
          onValueChange: (value) => updateSettings({ backupReminder: value }),
        },
        {
          title: 'Export Data',
          subtitle: 'Back up your driving log',
          onPress: () => navigation.navigate('Export'),
        },
        {
          title: 'Import Backup',
          subtitle: 'Restore a Drively JSON backup file',
          onPress: handleImportJSON,
        },
        {
          title: 'Reset All Data',
          subtitle: 'Permanently delete all data',
          dangerous: true,
          onPress: handleResetData,
        },
      ],
    },
    {
      title: 'About',
      items: [
        {
          title: 'App Version',
          value: getAppVersion(),
          onPress: __DEV__ ? handleAppVersionPress : undefined,
        },
        {
          type: 'custom',
          component: (
            <View style={styles.updateContainer}>
              <View>
                <Text style={[styles.settingTitle, { color: theme.colors.text.primary }]}>App Updates</Text>
                <Text style={[styles.settingItemSubtitle, { color: theme.colors.text.secondary }]}>
                  Channel: {Updates.channel || 'not available'} | Runtime: {Updates.runtimeVersion || 'not available'}
                </Text>
                <Text style={[styles.settingItemSubtitle, { color: theme.colors.text.secondary }]}>
                  Current update: {formatUpdateDate(Updates.createdAt)}
                </Text>
                {updateStatus && (
                  <Text style={[styles.updateStatusText, { color: theme.colors.text.secondary }]}>
                    {updateStatus}
                  </Text>
                )}
              </View>

              <View style={styles.updateActionsContainer}>
                <TouchableOpacity
                  style={[
                    styles.updateButton,
                    { backgroundColor: theme.colors.surfaceSecondary, borderColor: theme.colors.border.light },
                    checkingForUpdate && { opacity: 0.6 },
                  ]}
                  onPress={handleCheckForUpdates}
                  disabled={checkingForUpdate || applyingUpdate}
                >
                  <Text style={[styles.updateButtonText, { color: theme.colors.text.primary }]}>
                    {checkingForUpdate ? 'Checking...' : 'Check for Updates'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.updateButton,
                    { backgroundColor: theme.colors.primary + '15', borderColor: theme.colors.primary },
                    applyingUpdate && { opacity: 0.6 },
                  ]}
                  onPress={handleApplyUpdate}
                  disabled={checkingForUpdate || applyingUpdate}
                >
                  <Text style={[styles.updateButtonText, { color: theme.colors.primary }]}>
                    {applyingUpdate ? 'Updating...' : 'Update Now'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ),
        },
        {
          title: 'Data Storage',
          subtitle: 'All data stored locally on device',
        },
        {
          title: 'Privacy',
          subtitle: 'No data sent to cloud or third parties',
        },
      ],
    },
    {
      title: 'Debug & Logs',
      items: [
        {
          type: 'custom',
          component: (
            <View style={styles.debugContainer}>
              <View style={styles.settingHeader}>
                <Text style={[styles.settingTitle, { color: theme.colors.text.primary }]}>Debug Logs</Text>
                <TouchableOpacity
                  onPress={() => {
                    setShowDebugDetails(!showDebugDetails);
                    if (!showDebugDetails && !logStats) {
                      handleLoadLogStats();
                    }
                  }}
                  style={styles.editButton}
                >
                  <Text style={styles.editButtonText}>
                    {showDebugDetails ? 'Hide' : 'Show'}
                  </Text>
                </TouchableOpacity>
              </View>
              
              {showDebugDetails && (
                <View style={styles.debugDetailsContainer}>
                  {logStats && (
                    <View style={styles.logStatsContainer}>
                      <Text style={[styles.logStatsText, { color: theme.colors.text.secondary }]}>
                        Status: {logStats.exists ? 'Active' : 'No logs'} | 
                        Size: {logStats.sizeFormatted || '0 Bytes'} | 
                        Lines: {logStats.lineCount || 0}
                      </Text>
                      {logStats.lastModified && (
                        <Text style={[styles.logStatsText, { color: theme.colors.text.secondary }]}>
                          Last updated: {logStats.lastModified.toLocaleString()}
                        </Text>
                      )}
                    </View>
                  )}
                  
                  <View style={styles.debugActionsContainer}>
                    <TouchableOpacity
                      style={[styles.debugButton, { backgroundColor: theme.colors.primary + '15', borderColor: theme.colors.primary }]}
                      onPress={handleViewRecentLogs}
                      disabled={loadingLogs}
                    >
                      <Text style={[styles.debugButtonText, { color: theme.colors.primary }]}>
                        {loadingLogs ? 'Loading...' : 'View Recent'}
                      </Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                      style={[styles.debugButton, { backgroundColor: theme.colors.surfaceSecondary, borderColor: theme.colors.border.light }]}
                      onPress={handleExportLogs}
                    >
                      <Text style={[styles.debugButtonText, { color: theme.colors.text.primary }]}>Export</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                      style={[styles.debugButton, { backgroundColor: theme.colors.surfaceSecondary, borderColor: theme.colors.border.light }]}
                      onPress={handleCleanupLogs}
                    >
                      <Text style={[styles.debugButtonText, { color: theme.colors.text.primary }]}>Cleanup</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                      style={[styles.debugButton, { backgroundColor: theme.colors.error + '15', borderColor: theme.colors.error }]}
                      onPress={handleClearLogs}
                    >
                      <Text style={[styles.debugButtonText, { color: theme.colors.error }]}>Clear All</Text>
                    </TouchableOpacity>
                  </View>
                  
                  <Text style={[styles.debugDescription, { color: theme.colors.text.secondary }]}>
                    Debug logs help track app behavior and are automatically cleaned up every 2 days. 
                    Logs contain no personal information.
                  </Text>

                  {logsLoaded && (
                    <View style={[styles.recentLogsContainer, { borderColor: theme.colors.border.light }]}>
                      {recentLogs.length > 0 ? (
                        <ScrollView style={styles.recentLogsScroll} nestedScrollEnabled>
                          {recentLogs.map((line, index) => (
                            <Text
                              key={`${index}-${line}`}
                              style={[styles.recentLogLine, { color: theme.colors.text.secondary }]}
                            >
                              {line}
                            </Text>
                          ))}
                        </ScrollView>
                      ) : (
                        <Text style={[styles.emptyLogsText, { color: theme.colors.text.secondary }]}>
                          No debug logs found. Use the app normally, then return here to view recent activity.
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              )}
            </View>
          ),
        },
      ],
    },
  ];

  const renderSettingItem = (item, index) => {
    if (item.type === 'custom') {
      return (
        <View key={index} style={styles.customItem}>
          {item.component}
        </View>
      );
    }

    return (
      <TouchableOpacity
        key={index}
        style={[
          styles.settingItem,
          { borderBottomColor: theme.colors.border.light },
          item.dangerous && { backgroundColor: theme.colors.error + '15' },
        ]}
        onPress={item.onPress}
        disabled={!item.onPress && item.type !== 'switch'}
      >
        <View style={styles.settingContent}>
          <Text style={[
            styles.settingItemTitle,
            { color: item.dangerous ? theme.colors.error : theme.colors.text.primary },
          ]}>
            {item.title}
          </Text>
          
          {item.subtitle && (
            <Text style={[styles.settingItemSubtitle, { color: theme.colors.text.secondary }]}>{item.subtitle}</Text>
          )}
        </View>
        
        <View style={styles.settingAction}>
          {item.type === 'switch' ? (
            <Switch
              value={item.value}
              onValueChange={item.onValueChange}
              trackColor={{ false: theme.colors.switchControl.trackOff, true: theme.colors.switchControl.trackOn }}
              thumbColor={item.value ? theme.colors.switchControl.thumbOn : theme.colors.switchControl.thumbOff}
            />
          ) : item.value ? (
            <Text style={[styles.settingValue, { color: theme.colors.text.secondary }]}>{item.value}</Text>
          ) : item.onPress ? (
            <Text style={[styles.chevron, { color: theme.colors.text.light }]}>›</Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <TouchableOpacity
            accessibilityLabel="Back to settings"
            onPress={() => navigation.goBack()}
            style={styles.headerBackButton}
          >
            <Icon name="arrow-left" size={21} color={theme.colors.text.secondary} />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={[styles.title, { color: theme.colors.text.primary }]}>Advanced settings</Text>
            <Text style={[styles.subtitle, { color: theme.colors.text.secondary }]}>Driver information, tracking, backups, updates, and diagnostics.</Text>
          </View>
        </View>

        {settingSections.map((section, sectionIndex) => (
          <View key={sectionIndex} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.text.primary }]}>{section.title}</Text>
            <View style={[styles.sectionContent, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border.light }]}>
              {section.items.map((item, itemIndex) => renderSettingItem(item, itemIndex))}
            </View>
          </View>
        ))}

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: theme.colors.text.primary }]}>
            Drively
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (theme) => StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 28,
  },
  headerBackButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 7,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    backgroundColor: theme.colors.surface,
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    fontFamily: theme.typography.families.display,
    fontSize: 27,
    fontWeight: '700',
    color: theme.colors.text.primary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.text.secondary,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  sectionContent: {
    borderRadius: 7,
    borderWidth: 1,
    overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border.light,
  },
  dangerousItem: {
    backgroundColor: theme.colors.error + '15',
  },
  customItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border.light,
  },
  settingContent: {
    flex: 1,
  },
  settingItemTitle: {
    fontSize: 16,
    fontWeight: '500',
  },
  dangerousText: {
    color: theme.colors.error,
  },
  settingItemSubtitle: {
    fontSize: 14,
    color: theme.colors.text.secondary,
    marginTop: 2,
  },
  settingAction: {
    alignItems: 'center',
  },
  settingValue: {
    fontSize: 14,
    color: theme.colors.text.secondary,
  },
  chevron: {
    fontSize: 18,
    color: theme.colors.text.light,
  },
  goalsContainer: {},
  driverInfoContainer: {},
  settingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text.primary,
  },
  editButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  editButtonText: {
    color: theme.colors.text.inverse,
    fontSize: 14,
    fontWeight: '500',
  },
  goalsDisplay: {},
  driverInfoDisplay: {
    gap: 8,
  },
  driverInfoSensitiveRow: {
    gap: 2,
  },
  driverInfoLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.text.secondary,
  },
  driverInfoText: {
    fontSize: 14,
    color: theme.colors.text.primary,
  },
  goalText: {
    fontSize: 14,
    color: theme.colors.text.primary,
  },
  goalSubtext: {
    fontSize: 12,
    color: theme.colors.text.secondary,
    marginTop: 4,
  },
  goalHelperText: {
    fontSize: 12,
    color: theme.colors.text.secondary,
  },
  editGoalsContainer: {
    gap: 12,
  },
  editDriverInfoContainer: {
    gap: 12,
  },
  driverInfoInputGroup: {
    gap: 6,
  },
  goalInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inputLabel: {
    fontSize: 14,
    color: theme.colors.text.primary,
    flex: 1,
  },
  numberInput: {
    borderWidth: 1,
    borderColor: theme.colors.border.medium,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: 6,
    padding: 8,
    width: 80,
    textAlign: 'center',
    color: theme.colors.text.primary,
  },
  textInput: {
    borderWidth: 1,
    borderColor: theme.colors.border.medium,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: 6,
    padding: 10,
    fontSize: 14,
    color: theme.colors.text.primary,
  },
  datePickerButton: {
    minHeight: 46,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: theme.colors.surfaceSecondary,
    borderColor: theme.colors.border.medium,
  },
  datePickerText: {
    flex: 1,
    fontSize: 15,
    color: theme.colors.text.primary,
  },
  cancelButton: {
    backgroundColor: theme.colors.surfaceSecondary,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: theme.colors.text.secondary,
    fontSize: 14,
    fontWeight: '500',
  },
  footer: {
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 20,
  },
  footerText: {
    fontSize: 16,
    color: theme.colors.text.primary,
    marginBottom: 4,
  },
  footerSubtext: {
    fontSize: 14,
    color: theme.colors.text.secondary,
  },
  themeContainer: {
    gap: 12,
  },
  themeOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  themeOption: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
  },
  themeOptionText: {
    fontSize: 14,
    fontWeight: '500',
  },
  // Temperature unit styles
  temperatureContainer: {
    gap: 12,
  },
  temperatureOptions: {
    gap: 8,
  },
  temperatureOption: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
  },
  temperatureOptionText: {
    fontSize: 14,
    fontWeight: '500',
  },
  trackingContainer: {
    gap: 12,
  },
  sensitivityOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  sensitivityOption: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  sensitivityText: {
    fontSize: 12,
    fontWeight: '600',
  },
  settingSubtitle: {
    fontSize: 13,
    marginTop: -4,
    marginBottom: 8,
  },
  updateContainer: {
    gap: 12,
  },
  updateStatusText: {
    fontSize: 13,
    marginTop: 8,
  },
  updateActionsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  updateButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  updateButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  // Reset button styles
  resetButton: {
    borderRadius: 7,
    borderWidth: 2,
    padding: 16,
    marginVertical: 8,
  },
  resetButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  resetButtonIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  resetButtonText: {
    flex: 1,
  },
  resetButtonTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  resetButtonSubtitle: {
    fontSize: 14,
  },
  // Debug section styles
  debugContainer: {
    gap: 12,
  },
  debugDetailsContainer: {
    gap: 16,
  },
  logStatsContainer: {
    backgroundColor: theme.colors.surfaceSecondary,
    padding: 12,
    borderRadius: 8,
    gap: 4,
  },
  logStatsText: {
    fontSize: 12,
    fontFamily: 'monospace',
  },
  debugActionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  debugButton: {
    flex: 1,
    minWidth: '45%',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  debugButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  debugDescription: {
    fontSize: 12,
    fontStyle: 'italic',
    lineHeight: 16,
  },
  recentLogsContainer: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  recentLogsScroll: {
    maxHeight: 260,
  },
  recentLogLine: {
    fontSize: 11,
    lineHeight: 16,
    fontFamily: 'monospace',
  },
  emptyLogsText: {
    fontSize: 13,
    lineHeight: 18,
  },
});

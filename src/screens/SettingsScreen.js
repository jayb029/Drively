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
} from 'react-native';
import { useDriving } from '../contexts/DrivingContext';
import { useTheme, THEME_MODES } from '../contexts/ThemeContext';
import { clearAllData } from '../utils/storage';
import { getAppVersion } from '../utils/appInfo';
import { createDevDrivingData } from '../utils/devData';
import {
  isDriveDetectionRunning,
  requestDriveDetectionPermissions,
  startDriveDetection,
  stopDriveDetection,
} from '../services/driveDetection';
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
    settings, 
    updateSettings, 
    setUserInfo, 
    replaceData,
    resetData 
  } = useDriving();

  const { theme, themeMode, setThemeMode } = useTheme();

  const [editingGoals, setEditingGoals] = useState(false);
  const [tempDayHours, setTempDayHours] = useState(user.goalDayHours.toString());
  const [tempNightHours, setTempNightHours] = useState(user.goalNightHours.toString());
  const [editingDriverInfo, setEditingDriverInfo] = useState(false);
  const [tempDriverName, setTempDriverName] = useState(user.driverName || user.fullName || user.name || '');
  const [tempDateOfBirth, setTempDateOfBirth] = useState(user.dateOfBirth || user.birthDate || user.dob || '');
  const [tempPermitNumber, setTempPermitNumber] = useState(user.permitNumber || user.licenseNumber || '');
  
  // Debug logging state
  const [logStats, setLogStats] = useState(null);
  const [showDebugDetails, setShowDebugDetails] = useState(false);
  const [driveDetectionRunning, setDriveDetectionRunning] = useState(false);
  const [updatingDetection, setUpdatingDetection] = useState(false);
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
    setTempDateOfBirth(user.dateOfBirth || user.birthDate || user.dob || '');
    setTempPermitNumber(user.permitNumber || user.licenseNumber || '');
    setEditingDriverInfo(false);
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

  const loadDevData = () => {
    if (!__DEV__) return;

    Alert.alert(
      'Load Fake Dev Data',
      'This replaces your current local data with generated placeholder drives and supervisors.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Load',
          onPress: () => {
            const fakeData = createDevDrivingData(settings);
            replaceData(fakeData);
            logUserAction('load_fake_dev_data', 'SETTINGS', {
              drivesCount: fakeData.drives.length,
              supervisorsCount: fakeData.supervisorProfiles.length,
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

  // Debug logging functions
  const handleLoadLogStats = async () => {
    try {
      const stats = await getLogStats();
      setLogStats(stats);
    } catch (error) {
      Alert.alert('Error', 'Failed to load log statistics');
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
              await clearLogs();
              setLogStats(null);
              logUserAction('clear_logs', 'SETTINGS');
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
    try {
      const recentLogs = await getRecentLogs(50);
      if (recentLogs.length === 0) {
        Alert.alert('No Logs', 'No recent debug logs found');
        return;
      }
      
      const logText = recentLogs.join('\n');
      Alert.alert(
        'Recent Debug Logs',
        logText,
        [{ text: 'OK' }],
        { scrollable: true }
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to load recent logs');
    }
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
                    setTempDateOfBirth(user.dateOfBirth || user.birthDate || user.dob || '');
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
                      autoCapitalize="words"
                    />
                  </View>
                  <View style={styles.driverInfoInputGroup}>
                    <Text style={styles.inputLabel}>Date of Birth</Text>
                    <TextInput
                      style={styles.textInput}
                      value={tempDateOfBirth}
                      onChangeText={setTempDateOfBirth}
                      placeholder="MM/DD/YYYY"
                      keyboardType="numbers-and-punctuation"
                    />
                  </View>
                  <View style={styles.driverInfoInputGroup}>
                    <Text style={styles.inputLabel}>Permit Number</Text>
                    <TextInput
                      style={styles.textInput}
                      value={tempPermitNumber}
                      onChangeText={setTempPermitNumber}
                      placeholder="Optional"
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
                  <Text style={styles.driverInfoText}>Name: {user.driverName || user.fullName || user.name || 'Not set'}</Text>
                  <Text style={styles.driverInfoText}>Date of birth: {user.dateOfBirth || user.birthDate || user.dob || 'Not set'}</Text>
                  <Text style={styles.driverInfoText}>Permit: {user.permitNumber || user.licenseNumber || 'Optional'}</Text>
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
                  trackColor={{ false: theme.colors.border.medium, true: theme.colors.primaryLight }}
                  thumbColor={settings.driveDetectionEnabled ? theme.colors.primary : theme.colors.surface}
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
                Notifications: {settings.notificationPermissionStatus || 'not requested'} | Background location: {settings.backgroundLocationStatus || 'not requested'}
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
          type: 'custom',
          component: (
            <TouchableOpacity
              style={[styles.resetButton, { backgroundColor: theme.colors.error + '15', borderColor: theme.colors.error }]}
              onPress={handleResetData}
            >
              <View style={styles.resetButtonContent}>
                <Text style={[styles.resetButtonIcon, { color: theme.colors.error }]}>⚠️</Text>
                <View style={styles.resetButtonText}>
                  <Text style={[styles.resetButtonTitle, { color: theme.colors.error }]}>Reset All Data</Text>
                  <Text style={[styles.resetButtonSubtitle, { color: theme.colors.text.secondary }]}>Permanently delete all data</Text>
                </View>
              </View>
            </TouchableOpacity>
          ),
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
                    >
                      <Text style={[styles.debugButtonText, { color: theme.colors.primary }]}>View Recent</Text>
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
        disabled={!item.onPress}
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
              trackColor={{ false: theme.colors.border.medium, true: theme.colors.primaryLight }}
              thumbColor={item.value ? theme.colors.primary : theme.colors.surface}
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
          <Text style={[styles.title, { color: theme.colors.text.primary }]}>Settings</Text>
          <Text style={[styles.subtitle, { color: theme.colors.text.secondary }]}>Customize your Drively experience</Text>
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
            🛣️ Drively - Your offline driving companion
          </Text>
          <Text style={[styles.footerSubtext, { color: theme.colors.text.secondary }]}>
            Made with ❤️ for safe driving
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
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
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  dangerousItem: {
    backgroundColor: '#fef2f2',
  },
  customItem: {
    padding: 16,
  },
  settingContent: {
    flex: 1,
  },
  settingItemTitle: {
    fontSize: 16,
    fontWeight: '500',
  },
  dangerousText: {
    color: '#dc2626',
  },
  settingItemSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
  },
  settingAction: {
    alignItems: 'center',
  },
  settingValue: {
    fontSize: 14,
    color: '#6b7280',
  },
  chevron: {
    fontSize: 18,
    color: '#9ca3af',
  },
  goalsContainer: {},
  driverInfoContainer: {
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    paddingTop: 16,
  },
  settingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  editButton: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  editButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },
  goalsDisplay: {},
  driverInfoDisplay: {
    gap: 4,
  },
  driverInfoText: {
    fontSize: 14,
    color: '#374151',
  },
  goalText: {
    fontSize: 14,
    color: '#374151',
  },
  goalSubtext: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  goalHelperText: {
    fontSize: 12,
    color: '#6b7280',
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
    color: '#374151',
    flex: 1,
  },
  numberInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    padding: 8,
    width: 80,
    textAlign: 'center',
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    padding: 10,
    fontSize: 14,
  },
  cancelButton: {
    backgroundColor: '#f3f4f6',
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#6b7280',
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
    color: '#374151',
    marginBottom: 4,
  },
  footerSubtext: {
    fontSize: 14,
    color: '#6b7280',
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
  // Reset button styles
  resetButton: {
    borderRadius: 12,
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
    backgroundColor: '#f3f4f6',
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
});

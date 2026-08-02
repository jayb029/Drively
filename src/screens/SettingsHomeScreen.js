import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDriving } from '../contexts/DrivingContext';
import { useTheme } from '../contexts/ThemeContext';
import { getAppVersion } from '../utils/appInfo';

export default function SettingsHomeScreen({ navigation }) {
  const { settings, supervisorProfiles, user } = useDriving();
  const { theme, themeMode } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const groups = [
    {
      title: 'Driving record',
      rows: [
        {
          icon: 'target',
          label: 'Driving goal',
          value: `${user.goalDayHours} total · ${user.goalNightHours} night`,
          onPress: () => navigation.navigate('Goals'),
        },
        {
          icon: 'card-account-details-outline',
          label: 'Driver information',
          value: user.driverName || 'Add export details',
          onPress: () => navigation.navigate('DriverProfile'),
        },
        {
          icon: 'account-supervisor-outline',
          label: 'Supervisor profiles',
          value: `${supervisorProfiles.length} saved`,
          onPress: () => navigation.navigate('Supervisors'),
        },
        {
          icon: 'file-export-outline',
          label: 'Export logbook',
          onPress: () => navigation.navigate('Export'),
        },
      ],
    },
    {
      title: 'Preferences',
      rows: [
        {
          icon: 'theme-light-dark',
          label: 'Appearance',
          value: themeMode === 'system' ? 'System theme' : `${themeMode[0].toUpperCase()}${themeMode.slice(1)} theme`,
          onPress: () => navigation.navigate('Appearance'),
        },
        {
          icon: 'crosshairs-gps',
          label: 'Drive tracking',
          value: settings.driveDetectionEnabled ? 'Detection on' : 'Detection off',
          onPress: () => navigation.navigate('DriveTracking'),
        },
        {
          icon: 'weather-partly-cloudy',
          label: 'Weather lookup',
          value: (settings.weatherEnabled ?? true) ? 'Enabled' : 'Disabled',
          onPress: () => navigation.navigate('WeatherSettings'),
        },
      ],
    },
    {
      title: 'App and data',
      rows: [
        {
          icon: 'database-cog-outline',
          label: 'Data and backups',
          onPress: () => navigation.navigate('DataSettings'),
        },
        {
          icon: 'information-outline',
          label: 'About and updates',
          value: getAppVersion(),
          onPress: () => navigation.navigate('AboutSettings'),
        },
        {
          icon: 'stethoscope',
          label: 'Diagnostics',
          onPress: () => navigation.navigate('Diagnostics'),
        },
      ],
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
          <Text style={styles.subtitle}>Your logbook, tracking, and display preferences.</Text>
        </View>

        {groups.map((group) => (
          <View key={group.title} style={styles.group}>
            <Text style={styles.groupTitle}>{group.title}</Text>
            <View style={styles.rows}>
              {group.rows.map((row, index) => (
                <TouchableOpacity
                  accessibilityRole="button"
                  key={row.label}
                  onPress={row.onPress}
                  style={[styles.row, index < group.rows.length - 1 && styles.rowBorder]}
                >
                  <Icon name={row.icon} size={21} color={theme.colors.text.secondary} />
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowLabel}>{row.label}</Text>
                    {!!row.value && <Text style={styles.rowValue}>{row.value}</Text>}
                  </View>
                  <Icon name="chevron-right" size={21} color={theme.colors.text.light} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        <Text style={styles.version}>Drively {getAppVersion()}</Text>
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
      paddingBottom: 112,
      gap: 26,
    },
    header: {
      gap: 4,
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
      fontSize: 14,
      lineHeight: 20,
    },
    group: {
      gap: 10,
    },
    groupTitle: {
      color: theme.colors.text.primary,
      fontSize: 15,
      fontWeight: '700',
    },
    rows: {
      borderWidth: 1,
      borderColor: theme.colors.border.light,
      borderRadius: 7,
      overflow: 'hidden',
      backgroundColor: theme.colors.surface,
    },
    row: {
      minHeight: 62,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 14,
    },
    rowBorder: {
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border.light,
    },
    rowCopy: {
      flex: 1,
      gap: 2,
    },
    rowLabel: {
      color: theme.colors.text.primary,
      fontSize: 15,
      fontWeight: '600',
    },
    rowValue: {
      color: theme.colors.text.secondary,
      fontSize: 12,
    },
    version: {
      color: theme.colors.text.light,
      fontSize: 12,
      textAlign: 'center',
    },
  });
}

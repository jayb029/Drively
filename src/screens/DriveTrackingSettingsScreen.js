import React, { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import {
  SettingsChoice,
  SettingsActionRow,
  SettingsPage,
  SettingsSection,
  SettingsSwitchRow,
} from '../components/SettingsComponents';
import { useDriving } from '../contexts/DrivingContext';
import {
  isDriveDetectionRunning,
  requestDriveDetectionPermissions,
  startDriveDetection,
  stopDriveDetection,
} from '../services/driveDetection';

export default function DriveTrackingSettingsScreen({ navigation }) {
  const { settings, updateSettings } = useDriving();
  const [running, setRunning] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    isDriveDetectionRunning().then(setRunning).catch(() => setRunning(false));
  }, []);

  const toggleDetection = async (enabled) => {
    setUpdating(true);
    try {
      if (enabled) {
        const permissions = await requestDriveDetectionPermissions();
        updateSettings({
          notificationPermissionStatus: permissions.notifications,
          backgroundLocationStatus: permissions.backgroundLocation,
        });
        if (!permissions.granted) {
          Alert.alert('Permissions needed', 'Drive detection needs notification, foreground location, and background location permission on Android.');
          return;
        }
        await startDriveDetection();
      } else {
        await stopDriveDetection();
      }
      setRunning(enabled);
      updateSettings({ driveDetectionEnabled: enabled });
    } catch (error) {
      Alert.alert('Tracking error', 'Could not update drive detection. Try again from a development or release build.');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <SettingsPage navigation={navigation} title="Drive tracking" subtitle="Control active-drive behavior and optional background detection.">
      <SettingsSection title="Active drives">
        <SettingsSwitchRow
          label="Keep screen awake"
          onValueChange={(value) => updateSettings({ alwaysOnWhileTracking: value })}
          subtitle="Prevent the display from sleeping while a drive is being tracked."
          value={settings.alwaysOnWhileTracking ?? true}
        />
      </SettingsSection>

      <SettingsSection title="Automatic detection">
        <SettingsSwitchRow
          disabled={updating}
          label="Driving detection"
          onValueChange={toggleDetection}
          subtitle={running ? 'Background detector is running.' : 'Notify when driving-like movement is detected.'}
          value={!!settings.driveDetectionEnabled}
        />
        <SettingsChoice
          label="Detection sensitivity"
          onChange={(value) => updateSettings({ driveDetectionSensitivity: value })}
          options={[
            { value: 'conservative', label: 'Low' },
            { value: 'balanced', label: 'Balanced' },
            { value: 'sensitive', label: 'High' },
          ]}
          value={settings.driveDetectionSensitivity || 'balanced'}
        />
      </SettingsSection>

      <SettingsSection title="Permission status">
        <SettingsStatus label="Notifications" value={settings.notificationPermissionStatus} />
        <SettingsStatus label="Background location" value={settings.backgroundLocationStatus} />
      </SettingsSection>
    </SettingsPage>
  );
}

function SettingsStatus({ label, value }) {
  return <SettingsActionRow label={label} value={value || 'Not requested'} />;
}

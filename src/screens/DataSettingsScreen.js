import React from 'react';
import { Alert, Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import {
  SettingsActionRow,
  SettingsPage,
  SettingsSection,
  SettingsSwitchRow,
} from '../components/SettingsComponents';
import { useDriving } from '../contexts/DrivingContext';
import { clearAllData, importDataFromJSON } from '../utils/storage';
import { logUserAction } from '../utils/logger';

export default function DataSettingsScreen({ navigation }) {
  const { replaceData, resetData, settings, updateSettings } = useDriving();

  const importBackup = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset) throw new Error('No file selected');
      const fileContents = Platform.OS === 'web'
        ? await (await fetch(asset.uri)).text()
        : await FileSystem.readAsStringAsync(asset.uri);
      const importedData = await importDataFromJSON(fileContents);
      if (!importedData) {
        Alert.alert('Import failed', 'That file is not a valid Drively JSON backup.');
        return;
      }

      Alert.alert('Import backup', 'This replaces the current local Drively data with the selected backup.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Import',
          onPress: () => {
            replaceData(importedData);
            logUserAction('import_json_backup', 'SETTINGS', { drivesCount: importedData.drives?.length || 0 });
            Alert.alert('Backup imported', 'Your Drively backup has been restored.');
          },
        },
      ]);
    } catch (error) {
      Alert.alert('Import failed', 'Unable to import that backup file.');
    }
  };

  const resetAllData = () => {
    Alert.alert(
      'Reset all data',
      'This permanently deletes every drive, profile, goal, and setting on this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearAllData();
              resetData();
            } catch (error) {
              Alert.alert('Reset failed', 'Drively could not clear its local data.');
            }
          },
        },
      ]
    );
  };

  return (
    <SettingsPage navigation={navigation} title="Data and backups" subtitle="Export, restore, or remove the logbook stored on this device.">
      <SettingsSection title="Backups">
        <SettingsSwitchRow
          label="Backup reminders"
          onValueChange={(value) => updateSettings({ backupReminder: value })}
          subtitle="Remind me to make a fresh logbook backup."
          value={!!settings.backupReminder}
        />
        <SettingsActionRow label="Export logbook" onPress={() => navigation.navigate('Export')} subtitle="Create a shareable backup or report." />
        <SettingsActionRow label="Import backup" onPress={importBackup} subtitle="Restore a Drively JSON backup." />
      </SettingsSection>

      <SettingsSection title="Storage">
        <SettingsActionRow label="Local app storage" subtitle="Driving records stay on this device unless you export them." value="On device" />
        <SettingsActionRow danger label="Reset all data" onPress={resetAllData} subtitle="Permanently delete local Drively data." />
      </SettingsSection>
    </SettingsPage>
  );
}

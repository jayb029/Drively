import React, { useState } from 'react';
import { Alert, Platform, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import {
  SettingsActionRow,
  SettingsButton,
  SettingsPage,
  SettingsSection,
  SettingsSwitchRow,
} from '../components/SettingsComponents';
import { useDriving } from '../contexts/DrivingContext';
import { useDataSecurity } from '../contexts/DataSecurityContext';
import { clearAllData, importDataFromJSON, mergeImportedData } from '../utils/storage';
import { logUserAction } from '../utils/logger';

export default function DataSettingsScreen({ navigation }) {
  const security = useDataSecurity();
  const driving = useDriving();
  const {
    detectedEvents,
    drives,
    replaceData,
    resetData,
    setCloudBackupEnabled,
    settings,
    streaks,
    supervisorProfiles,
    updateSettings,
    user,
  } = driving;
  const [changingCloudBackup, setChangingCloudBackup] = useState(false);
  const [pendingImport, setPendingImport] = useState(null);
  const [importCategories, setImportCategories] = useState({
    driver: true,
    logbook: true,
    supervisors: true,
    settings: true,
  });

  const changeCloudBackup = async (enabled) => {
    setChangingCloudBackup(true);
    const didSave = await setCloudBackupEnabled(enabled);
    setChangingCloudBackup(false);

    if (!didSave) {
      Alert.alert('Setting not changed', 'Drively could not move your logbook to the requested storage location.');
    }
  };

  const requestCloudBackupChange = (enabled) => {
    if (!enabled) {
      changeCloudBackup(false);
      return;
    }

    Alert.alert(
      'Enable Android cloud backup?',
      'Android may copy your full Drively logbook—including driver, supervisor, drive, and location-derived records—to the backup account configured on this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Enable', onPress: () => changeCloudBackup(true) },
      ]
    );
  };

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

      setPendingImport(importedData);
    } catch (error) {
      Alert.alert('Import failed', 'Unable to import that backup file.');
    }
  };

  const toggleImportCategory = (category) => (enabled) => {
    setImportCategories((current) => ({ ...current, [category]: enabled }));
  };

  const applyImport = () => {
    if (!pendingImport || !Object.values(importCategories).some(Boolean)) {
      Alert.alert('Choose data to import', 'Select at least one category from the backup.');
      return;
    }

    const currentData = { detectedEvents, drives, settings, streaks, supervisorProfiles, user };
    replaceData(mergeImportedData(currentData, pendingImport, importCategories));
    logUserAction('import_json_backup', 'SETTINGS', { categories: importCategories });
    setPendingImport(null);
    Alert.alert('Backup imported', 'The selected categories were replaced from your backup.');
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
      <SettingsSection title="Data protection">
        <SettingsActionRow
          label="Local data encryption"
          onPress={security.metadata?.enabled
            ? () => navigation.navigate('EncryptionSettings')
            : security.beginEncryptionSetup}
          subtitle={security.metadata?.enabled
            ? 'Profiles, drives, settings, and location-derived records are encrypted at rest.'
            : 'Off. Encryption is strongly recommended for this logbook.'}
          value={security.metadata?.enabled ? 'Manage' : 'Set up'}
        />
      </SettingsSection>
      <SettingsSection title="Backups">
        {Platform.OS === 'android' && (
          <SettingsSwitchRow
            disabled={changingCloudBackup}
            label="Android cloud backup"
            onValueChange={requestCloudBackupChange}
            subtitle="Allow Android to back up your full logbook to this device's configured backup account. Off by default."
            value={!!settings.cloudBackupEnabled}
          />
        )}
        <SettingsSwitchRow
          label="Backup reminders"
          onValueChange={(value) => updateSettings({ backupReminder: value })}
          subtitle="Remind me to make a fresh logbook backup."
          value={!!settings.backupReminder}
        />
        <SettingsActionRow label="Export logbook" onPress={() => navigation.navigate('Export')} subtitle="Create a shareable backup or report." />
        <SettingsActionRow label="Import backup" onPress={importBackup} subtitle="Restore a Drively JSON backup." />
      </SettingsSection>

      {pendingImport && (
        <SettingsSection title="Choose what to replace">
          <SettingsSwitchRow label="Driver profile and goals" onValueChange={toggleImportCategory('driver')} value={importCategories.driver} />
          <SettingsSwitchRow label="Drive log, detections, and streaks" onValueChange={toggleImportCategory('logbook')} value={importCategories.logbook} />
          <SettingsSwitchRow label="Supervisor profiles" onValueChange={toggleImportCategory('supervisors')} value={importCategories.supervisors} />
          <SettingsSwitchRow label="App settings" onValueChange={toggleImportCategory('settings')} value={importCategories.settings} />
          <ImportActions onCancel={() => setPendingImport(null)} onImport={applyImport} />
        </SettingsSection>
      )}

      <SettingsSection title="Storage">
        <SettingsActionRow
          label="Logbook storage"
          subtitle={settings.cloudBackupEnabled
            ? 'Stored on this device and eligible for Android cloud backup.'
            : 'Stored on this device unless you export it.'}
          value={settings.cloudBackupEnabled ? 'Cloud backup on' : 'On device'}
        />
        <SettingsActionRow danger label="Reset all data" onPress={resetAllData} subtitle="Permanently delete local Drively data." />
      </SettingsSection>
    </SettingsPage>
  );
}

function ImportActions({ onCancel, onImport }) {
  return (
    <View style={{ gap: 10, padding: 14 }}>
      <SettingsButton label="Import selected data" onPress={onImport} />
      <SettingsButton label="Cancel import" onPress={onCancel} secondary />
    </View>
  );
}

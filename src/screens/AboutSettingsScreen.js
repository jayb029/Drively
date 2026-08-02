import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import * as Updates from 'expo-updates';
import {
  SettingsActionRow,
  SettingsButton,
  SettingsPage,
  SettingsSection,
} from '../components/SettingsComponents';
import { useDriving } from '../contexts/DrivingContext';
import { useTheme } from '../contexts/ThemeContext';
import { createDevDrivingData } from '../utils/devData';
import { getAppVersion } from '../utils/appInfo';
import { logUserAction } from '../utils/logger';

export default function AboutSettingsScreen({ navigation }) {
  const driving = useDriving();
  const { theme } = useTheme();
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [status, setStatus] = useState(null);
  const [versionTaps, setVersionTaps] = useState(0);

  const checkForUpdates = async () => {
    if (!Updates.isEnabled || __DEV__) {
      Alert.alert('Updates unavailable', 'OTA updates can only be checked from an installed preview or production build.');
      return;
    }
    try {
      setChecking(true);
      setStatus('Checking…');
      const result = await Updates.checkForUpdateAsync();
      setStatus(result.isAvailable || result.isRollBackToEmbedded ? 'Update available' : 'Up to date');
    } catch (error) {
      setStatus('Could not check for updates');
    } finally {
      setChecking(false);
    }
  };

  const applyUpdate = async () => {
    if (!Updates.isEnabled || __DEV__) {
      Alert.alert('Updates unavailable', 'OTA updates can only be installed from an installed preview or production build.');
      return;
    }
    try {
      setApplying(true);
      setStatus('Downloading…');
      const result = await Updates.fetchUpdateAsync();
      if (result.isNew || result.isRollBackToEmbedded) {
        logUserAction('apply_ota_update', 'SETTINGS', { channel: Updates.channel, runtimeVersion: Updates.runtimeVersion });
        setStatus('Restarting…');
        await Updates.reloadAsync();
      } else {
        setStatus('No new update is ready');
      }
    } catch (error) {
      setStatus('Could not install update');
    } finally {
      setApplying(false);
    }
  };

  const handleVersionPress = () => {
    if (!__DEV__) return;
    const nextTaps = versionTaps + 1;
    if (nextTaps < 10) {
      setVersionTaps(nextTaps);
      return;
    }
    setVersionTaps(0);
    Alert.alert('Load fake development data', 'Add placeholder drives and supervisors without replacing current records?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Load',
        onPress: () => driving.replaceData(createDevDrivingData(driving)),
      },
    ]);
  };

  return (
    <SettingsPage navigation={navigation} title="About and updates" subtitle="Version details, app updates, and service information.">
      <SettingsSection title="Version">
        <SettingsActionRow label="Drively version" onPress={__DEV__ ? handleVersionPress : undefined} value={getAppVersion()} />
        <SettingsActionRow label="Update channel" value={Updates.channel || 'Embedded build'} />
        <SettingsActionRow label="Runtime version" value={String(Updates.runtimeVersion || 'Not available')} />
      </SettingsSection>

      <SettingsSection title="App updates">
        <View style={{ padding: 14, gap: 10 }}>
          {!!status && <Text style={{ color: theme.colors.text.secondary, fontSize: 13 }}>{status}</Text>}
          <SettingsButton disabled={checking || applying} label={checking ? 'Checking…' : 'Check for updates'} onPress={checkForUpdates} secondary />
          <SettingsButton disabled={checking || applying} label={applying ? 'Updating…' : 'Update now'} onPress={applyUpdate} />
        </View>
      </SettingsSection>

      <SettingsSection title="Services">
        <SettingsActionRow label="Weather data" subtitle="Fetched directly from Open-Meteo only when weather lookup is enabled." />
        <SettingsActionRow label="Logbook data" subtitle="Stored locally unless you choose to export it." />
      </SettingsSection>
    </SettingsPage>
  );
}

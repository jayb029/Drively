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
import { useApkUpdate } from '../contexts/ApkUpdateContext';
import { useTheme } from '../contexts/ThemeContext';
import { formatApkSize } from '../services/apkUpdater';
import { createDevDrivingData } from '../utils/devData';
import { getAppVersion } from '../utils/appInfo';

export default function AboutSettingsScreen({ navigation }) {
  const driving = useDriving();
  const apkUpdate = useApkUpdate();
  const { theme } = useTheme();
  const [versionTaps, setVersionTaps] = useState(0);

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

  const apkReleaseDetails = apkUpdate.release
    ? [
      `Build ${apkUpdate.release.versionCode}`,
      formatApkSize(apkUpdate.release.sizeBytes),
    ].filter(Boolean).join(' · ')
    : null;

  return (
    <SettingsPage navigation={navigation} title="About and updates" subtitle="Version details, app updates, and service information.">
      <SettingsSection title="Version">
        <SettingsActionRow label="Drively version" onPress={__DEV__ ? handleVersionPress : undefined} value={getAppVersion()} />
        <SettingsActionRow label="APK build" value={String(apkUpdate.installed.versionCode || 'Not available')} />
        <SettingsActionRow label="Update channel" value={Updates.channel || 'Embedded build'} />
        <SettingsActionRow label="Runtime version" value={String(Updates.runtimeVersion || 'Not available')} />
      </SettingsSection>

      <SettingsSection title="App updates">
        <SettingsActionRow
          label={apkUpdate.status === 'available' ? `Drively v${apkUpdate.release.version}` : 'Installed APK'}
          subtitle={apkUpdate.status === 'available'
            ? apkUpdate.release.changes.map((change) => `• ${change}`).join('\n') || 'A newer signed Android package is available.'
            : 'Checks the public Drively GitHub release for a newer signed APK.'}
          value={apkUpdate.status === 'available' ? apkReleaseDetails : `v${apkUpdate.installed.version}`}
        />
        <View style={{ padding: 14, gap: 10 }}>
          {!!apkUpdate.message && (
            <Text style={{
              color: apkUpdate.status === 'error' ? theme.colors.error : theme.colors.text.secondary,
              fontSize: 13,
              lineHeight: 18,
            }}>
              {apkUpdate.message}
            </Text>
          )}
          {apkUpdate.status === 'available' && (
            <SettingsButton label={`Update to Drively v${apkUpdate.release.version}`} onPress={apkUpdate.startUpdate} />
          )}
          <SettingsButton
            disabled={apkUpdate.status === 'checking'}
            label={apkUpdate.status === 'checking' ? 'Checking GitHub…' : apkUpdate.status === 'available' ? 'Check again' : 'Check for APK update'}
            onPress={() => apkUpdate.checkForApkUpdate()}
            secondary={apkUpdate.status === 'available'}
          />
          <Text style={{ color: theme.colors.text.light, fontSize: 12, lineHeight: 17 }}>
            Small OTA fixes download silently in the background. APK updates may ask for browser install permission.
          </Text>
        </View>
      </SettingsSection>

      <SettingsSection title="Services">
        <SettingsActionRow label="Weather data" subtitle="Fetched directly from Open-Meteo only when weather lookup is enabled." />
        <SettingsActionRow label="Logbook data" subtitle="Stored locally unless you choose to export it." />
      </SettingsSection>
    </SettingsPage>
  );
}

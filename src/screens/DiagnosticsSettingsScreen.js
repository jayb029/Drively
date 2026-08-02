import React, { useState } from 'react';
import { Alert, Share, StyleSheet, Text, View } from 'react-native';
import {
  SettingsButton,
  SettingsPage,
  SettingsSection,
} from '../components/SettingsComponents';
import { useTheme } from '../contexts/ThemeContext';
import { cleanupOldLogs, clearLogs, exportLogs, getLogStats, getRecentLogs } from '../utils/logger';

export default function DiagnosticsSettingsScreen({ navigation }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const [lines, setLines] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const [nextStats, nextLines] = await Promise.all([getLogStats(), getRecentLogs(50)]);
      setStats(nextStats);
      setLines(nextLines);
    } catch (error) {
      Alert.alert('Diagnostics unavailable', 'Could not read the local debug log.');
    } finally {
      setLoading(false);
    }
  };

  const shareLogs = async () => {
    try {
      const result = await exportLogs();
      await Share.share({ url: result.uri, title: 'Drively debug logs', message: `Drively debug logs (${result.sizeFormatted || 'unknown size'})` });
    } catch (error) {
      Alert.alert('Export failed', 'Could not export the debug log.');
    }
  };

  const cleanup = async () => {
    await cleanupOldLogs();
    await refresh();
  };

  const clear = () => Alert.alert('Clear debug logs', 'Delete all local debug log entries?', [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Clear',
      style: 'destructive',
      onPress: async () => {
        await clearLogs();
        setLines([]);
        setStats(null);
      },
    },
  ]);

  return (
    <SettingsPage navigation={navigation} title="Diagnostics" subtitle="Inspect and export local app logs when troubleshooting.">
      <SettingsSection title="Debug log">
        <View style={styles.actions}>
          <Text style={styles.summary}>
            {stats ? `${stats.sizeFormatted || '0 Bytes'} · ${stats.lineCount || 0} lines` : 'Load the log summary and recent entries.'}
          </Text>
          <SettingsButton disabled={loading} label={loading ? 'Loading…' : 'Load recent logs'} onPress={refresh} />
          <SettingsButton label="Export logs" onPress={shareLogs} secondary />
          <SettingsButton label="Clean up old logs" onPress={cleanup} secondary />
          <SettingsButton label="Clear logs" onPress={clear} secondary />
        </View>
      </SettingsSection>
      {lines.length > 0 && (
        <SettingsSection title="Recent entries">
          <View style={styles.logBlock}>
            {lines.map((line, index) => <Text key={`${index}-${line}`} style={styles.logLine}>{line}</Text>)}
          </View>
        </SettingsSection>
      )}
    </SettingsPage>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    actions: { padding: 14, gap: 10 },
    summary: { color: theme.colors.text.secondary, fontSize: 13, lineHeight: 18 },
    logBlock: { padding: 12, maxHeight: 360 },
    logLine: { color: theme.colors.text.secondary, fontFamily: theme.typography.families.utility, fontSize: 11, lineHeight: 16 },
  });
}

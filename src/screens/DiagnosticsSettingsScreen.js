import React, { useEffect, useState } from 'react';
import { Alert, Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Sharing from 'expo-sharing';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  SettingsActionRow,
  SettingsButton,
  SettingsPage,
  SettingsSection,
} from '../components/SettingsComponents';
import { useTheme } from '../contexts/ThemeContext';
import { cleanupOldLogs, clearLogs, exportLogs, getAllLogs, getLogStats, getRecentLogs } from '../utils/logger';
import { getAppVersion } from '../utils/appInfo';
import { haptics } from '../utils/haptics';

const GITHUB_NEW_ISSUE_URL = 'https://github.com/jayb029/Drively/issues/new';

function summarizeLogLine(line) {
  if (!line) return null;
  const summary = line
    .replace(/^\S+ \[ERROR\] /, '')
    .replace(/ \| Data:.*$/, '')
    .trim();
  return summary.length > 240 ? `${summary.slice(0, 237)}…` : summary;
}

export default function DiagnosticsSettingsScreen({ navigation }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const [lines, setLines] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [recentError, setRecentError] = useState(null);

  const refreshHealth = async () => {
    setLoading(true);
    try {
      const [nextStats, recentErrors] = await Promise.all([getLogStats(), getRecentLogs(1, 'ERROR')]);
      setStats(nextStats);
      setRecentError(summarizeLogLine(recentErrors[0]));
    } catch (error) {
      Alert.alert('Diagnostics unavailable', 'Could not read the local debug log.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshHealth();
  }, []);

  const loadFullLog = async () => {
    setLoading(true);
    try {
      const [nextStats, nextLines] = await Promise.all([getLogStats(), getAllLogs()]);
      setStats(nextStats);
      setLines(nextLines);
      setLogOpen(true);
    } catch (error) {
      Alert.alert('Diagnostics unavailable', 'Could not read the local debug log.');
    } finally {
      setLoading(false);
    }
  };

  const shareLogs = async () => {
    try {
      const result = await exportLogs();
      if (!(await Sharing.isAvailableAsync())) {
        throw new Error('File sharing is unavailable');
      }
      await Sharing.shareAsync(result.uri, {
        dialogTitle: 'Share Drively debug log',
        mimeType: 'text/plain',
        UTI: 'public.plain-text',
      });
    } catch (error) {
      Alert.alert('Export failed', 'Could not export the debug log.');
    }
  };

  const cleanup = async () => {
    await cleanupOldLogs();
    await refreshHealth();
    if (logOpen) {
      setLines(await getAllLogs());
    }
  };

  const clear = () => Alert.alert('Clear debug logs', 'Delete all local debug log entries?', [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Clear',
      style: 'destructive',
      onPress: async () => {
        await clearLogs();
        setLines([]);
        setLogOpen(false);
        setStats({ exists: false, size: 0, lineCount: 0, warningCount: 0, errorCount: 0, sizeFormatted: '0 Bytes' });
      },
    },
  ]);

  const reportIssue = async () => {
    try {
      const errorLines = await getRecentLogs(8, 'ERROR');
      const relevantLogs = errorLines
        .map((line) => line.replace(/ \| Data:.*$/, '').trim())
        .filter(Boolean)
        .join('\n')
        .slice(-4000);
      const issueBody = [
        '## What happened?',
        errorLines.length > 0
          ? 'Drively diagnostics detected an error. Add what you were doing and what you expected instead.'
          : 'Describe the problem and what you expected to happen instead.',
        '',
        '## Steps to reproduce',
        '1. Open ...',
        '2. Tap ...',
        '3. Observe ...',
        '',
        '## Drively version',
        getAppVersion(),
        '',
        '## Device and Android version',
        `Android ${Platform.Version}`,
        '',
        '## Installation type',
        __DEV__ ? 'Local development build' : 'GitHub Release APK or EAS build',
        '',
        '## How often does this happen?',
        'Unknown',
        '',
        '## Logs or screenshots',
        relevantLogs ? `\`\`\`text\n${relevantLogs}\n\`\`\`` : 'No error entries were detected in the retained log.',
        '',
        '## Additional context',
        'Add relevant settings, permissions, recent upgrades, or workarounds.',
        '',
        '## Checklist',
        '- [ ] I searched existing issues for the same problem.',
        '- [x] Drively removed structured personal and location fields from these log excerpts.',
        '- [ ] This is not a security vulnerability.',
      ].join('\n');
      const title = recentError ? `[Bug]: ${recentError.slice(0, 80)}` : '[Bug]: ';
      const url = `${GITHUB_NEW_ISSUE_URL}?labels=bug&title=${encodeURIComponent(title)}&body=${encodeURIComponent(issueBody)}`;
      haptics.action();
      await Linking.openURL(url);
    } catch (error) {
      Alert.alert('Could not open GitHub', 'Open the Drively repository and choose the bug report template.');
    }
  };

  const errorCount = stats?.errorCount || 0;
  const warningCount = stats?.warningCount || 0;
  const health = loading && !stats
    ? {
        icon: 'progress-clock',
        title: 'Checking for problems…',
        detail: 'Drively is reviewing its local diagnostic log.',
        color: theme.colors.text.secondary,
      }
    : stats?.error
      ? {
          icon: 'alert-circle-outline',
          title: 'Diagnostics could not be checked',
          detail: 'Open Advanced diagnostics to try again or export the log for support.',
          color: theme.colors.error,
        }
      : errorCount > 0
        ? {
            icon: 'alert-circle-outline',
            title: `${errorCount} ${errorCount === 1 ? 'problem was' : 'problems were'} detected`,
            detail: recentError || 'Drively recorded an app error. Advanced diagnostics has more detail.',
            color: theme.colors.error,
          }
        : warningCount > 0
          ? {
              icon: 'alert-outline',
              title: 'Something may need attention',
              detail: `${warningCount} ${warningCount === 1 ? 'warning was' : 'warnings were'} recorded. Drively can still be used normally.`,
              color: theme.colors.warning,
            }
          : {
              icon: 'check-circle-outline',
              title: 'No problems were detected',
              detail: 'Drively has not recorded any errors or warnings in its retained diagnostic log.',
              color: theme.colors.success,
            };

  return (
    <SettingsPage navigation={navigation} title="Diagnostics" subtitle="Check whether Drively has noticed any app problems.">
      <SettingsSection title="App health">
        <View accessible accessibilityLabel={`${health.title}. ${health.detail}`} style={styles.health}>
          <Icon name={health.icon} size={28} color={health.color} />
          <View style={styles.healthCopy}>
            <Text style={styles.healthTitle}>{health.title}</Text>
            <Text style={styles.healthDetail}>{health.detail}</Text>
          </View>
        </View>
      </SettingsSection>

      <SettingsSection title="Troubleshooting">
        <TouchableOpacity accessibilityRole="button" onPress={reportIssue} style={styles.reportButton}>
          <Icon name="github" size={21} color={theme.colors.text.primary} />
          <View style={styles.reportCopy}>
            <Text style={styles.reportLabel}>Report an issue</Text>
            <Text style={styles.reportDetail}>
              {errorCount > 0 ? 'Open a prefilled bug report with relevant error entries.' : 'Open a new bug report on GitHub.'}
            </Text>
          </View>
          <Icon name="open-in-new" size={18} color={theme.colors.text.light} />
        </TouchableOpacity>
        <SettingsActionRow
          label="Advanced diagnostics"
          onPress={() => setAdvancedOpen((open) => !open)}
          subtitle="View or export technical logs and manage stored entries."
          value={advancedOpen ? 'Hide' : 'Show'}
        />
      </SettingsSection>

      {advancedOpen && (
        <SettingsSection title="Advanced diagnostics">
          <View style={styles.actions}>
            <Text style={styles.summary}>
              {stats ? `${stats.sizeFormatted || '0 Bytes'} · ${stats.lineCount || 0} entries · kept for up to 2 days` : 'No log summary is available.'}
            </Text>
            <SettingsButton disabled={loading} label={loading ? 'Loading…' : (logOpen ? 'Refresh full log' : 'View full log')} onPress={loadFullLog} />
            <SettingsButton label="Export logs" onPress={shareLogs} secondary />
            <SettingsButton label="Clean up old logs" onPress={cleanup} secondary />
            <SettingsButton label="Clear logs" onPress={clear} secondary />
          </View>
        </SettingsSection>
      )}

      {advancedOpen && logOpen && (
        <SettingsSection title="Full debug log">
          <ScrollView
            contentContainerStyle={styles.logBlock}
            nestedScrollEnabled
            showsVerticalScrollIndicator
            style={styles.logScroller}
          >
            {lines.length > 0
              ? lines.map((line, index) => <Text key={`${index}-${line}`} selectable style={styles.logLine}>{line}</Text>)
              : <Text style={styles.emptyLog}>The diagnostic log is empty.</Text>}
          </ScrollView>
        </SettingsSection>
      )}
    </SettingsPage>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    health: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 16 },
    healthCopy: { flex: 1, gap: 4 },
    healthTitle: { color: theme.colors.text.primary, fontSize: 16, fontWeight: '700', lineHeight: 21 },
    healthDetail: { color: theme.colors.text.secondary, fontSize: 13, lineHeight: 19 },
    actions: { padding: 14, gap: 10 },
    reportButton: {
      minHeight: 68,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border.light,
    },
    reportCopy: { flex: 1, gap: 3 },
    reportLabel: { color: theme.colors.text.primary, fontSize: 15, fontWeight: '600' },
    reportDetail: { color: theme.colors.text.secondary, fontSize: 12, lineHeight: 17 },
    summary: { color: theme.colors.text.secondary, fontSize: 13, lineHeight: 18 },
    logScroller: { maxHeight: 360 },
    logBlock: { padding: 12 },
    logLine: { color: theme.colors.text.secondary, fontFamily: theme.typography.families.utility, fontSize: 11, lineHeight: 16 },
    emptyLog: { color: theme.colors.text.secondary, fontSize: 13, lineHeight: 18 },
  });
}

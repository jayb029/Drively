import React, { useMemo } from 'react';
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDriving } from '../contexts/DrivingContext';
import { THEME_MODES, useTheme } from '../contexts/ThemeContext';

const THEME_OPTIONS = [
  { value: THEME_MODES.LIGHT, label: 'Light', icon: 'white-balance-sunny' },
  { value: THEME_MODES.DARK, label: 'Dark', icon: 'weather-night' },
  { value: THEME_MODES.SYSTEM, label: 'System', icon: 'cellphone-cog' },
];

export default function AppearanceSettingsScreen({ navigation }) {
  const { settings, updateSettings } = useDriving();
  const { setThemeMode, theme, themeMode } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const censoringEnabled = settings.censorSensitiveInfo ?? true;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topBar}>
          <TouchableOpacity accessibilityLabel="Go back" onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backButtonText}>‹</Text>
          </TouchableOpacity>
          <View style={styles.intro}>
            <Text style={styles.title}>Appearance</Text>
            <Text style={styles.subtitle}>Choose how Drively looks and how personal information is displayed.</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Theme</Text>
          <View style={styles.segmented}>
            {THEME_OPTIONS.map((option) => {
              const selected = option.value === themeMode;
              return (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  key={option.value}
                  onPress={() => setThemeMode(option.value)}
                  style={[styles.segment, selected && styles.segmentSelected]}
                >
                  <Icon
                    name={option.icon}
                    size={18}
                    color={selected ? theme.colors.primary : theme.colors.text.secondary}
                  />
                  <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{option.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Navigation</Text>
          <View style={styles.settingRow}>
            <View style={styles.settingCopy}>
              <Text style={styles.settingTitle}>Large icon-only navigation</Text>
              <Text style={styles.settingBody}>Show larger bottom-bar icons without text labels.</Text>
            </View>
            <Switch
              accessibilityLabel="Large icon-only navigation"
              onValueChange={(value) => updateSettings({ largeBottomNavIcons: value })}
              thumbColor={(settings.largeBottomNavIcons ?? true) ? theme.colors.switchControl.thumbOn : theme.colors.switchControl.thumbOff}
              trackColor={{ false: theme.colors.switchControl.trackOff, true: theme.colors.switchControl.trackOn }}
              value={settings.largeBottomNavIcons ?? true}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacy</Text>
          <View style={styles.settingRow}>
            <View style={styles.settingCopy}>
              <Text style={styles.settingTitle}>Censor personal information</Text>
              <Text style={styles.settingBody}>
                Hide names, birth dates, permit numbers, and signatures until you tap them. Supervisor choices while logging a drive always stay visible.
              </Text>
            </View>
            <Switch
              accessibilityLabel="Censor personal information"
              onValueChange={(value) => updateSettings({ censorSensitiveInfo: value })}
              thumbColor={censoringEnabled ? theme.colors.switchControl.thumbOn : theme.colors.switchControl.thumbOff}
              trackColor={{
                false: theme.colors.switchControl.trackOff,
                true: theme.colors.switchControl.trackOn,
              }}
              value={censoringEnabled}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Units</Text>
          <UnitRow
            label="Distance and speed"
            onChange={(value) => updateSettings({ distanceUnit: value })}
            options={[
              { value: 'imperial', label: 'Miles · mph' },
              { value: 'metric', label: 'Kilometers · km/h' },
            ]}
            styles={styles}
            value={settings.distanceUnit || 'metric'}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function UnitRow({ label, onChange, options, styles, value }) {
  return (
    <View style={styles.unitRow}>
      <Text style={styles.settingTitle}>{label}</Text>
      <View style={styles.unitOptions}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={option.value}
              onPress={() => onChange(option.value)}
              style={[styles.unitOption, selected && styles.unitOptionSelected]}
            >
              <Text style={[styles.unitOptionText, selected && styles.unitOptionTextSelected]}>{option.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
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
      paddingBottom: 44,
      gap: 28,
    },
    intro: {
      flex: 1,
      gap: 6,
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    backButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border.light,
      borderRadius: 7,
      backgroundColor: theme.colors.surface,
    },
    backButtonText: {
      color: theme.colors.text.secondary,
      fontSize: 29,
      lineHeight: 31,
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
      fontSize: 15,
      lineHeight: 22,
    },
    section: {
      gap: 12,
    },
    sectionTitle: {
      color: theme.colors.text.primary,
      fontSize: 16,
      fontWeight: '700',
    },
    segmented: {
      minHeight: 52,
      flexDirection: 'row',
      borderWidth: 1,
      borderColor: theme.colors.border.medium,
      borderRadius: 7,
      overflow: 'hidden',
      backgroundColor: theme.colors.surface,
    },
    segment: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderRightWidth: 1,
      borderRightColor: theme.colors.border.light,
    },
    segmentSelected: {
      backgroundColor: theme.colors.surfaceSecondary,
    },
    segmentText: {
      color: theme.colors.text.secondary,
      fontSize: 13,
      fontWeight: '600',
    },
    segmentTextSelected: {
      color: theme.colors.primary,
    },
    settingRow: {
      minHeight: 96,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: theme.colors.border.light,
      paddingVertical: 14,
    },
    settingCopy: {
      flex: 1,
      gap: 3,
    },
    settingTitle: {
      color: theme.colors.text.primary,
      fontSize: 15,
      fontWeight: '600',
    },
    settingBody: {
      color: theme.colors.text.secondary,
      fontSize: 13,
      lineHeight: 19,
    },
    unitRow: {
      gap: 10,
      paddingVertical: 14,
      borderTopWidth: 1,
      borderColor: theme.colors.border.light,
    },
    unitOptions: {
      flexDirection: 'row',
      gap: 8,
    },
    unitOption: {
      flex: 1,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border.medium,
      borderRadius: 7,
      backgroundColor: theme.colors.surface,
    },
    unitOptionSelected: {
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.surfaceSecondary,
    },
    unitOptionText: {
      color: theme.colors.text.secondary,
      fontSize: 13,
      fontWeight: '600',
    },
    unitOptionTextSelected: {
      color: theme.colors.primary,
    },
  });
}

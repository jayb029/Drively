import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../contexts/ThemeContext';

const styleCache = new WeakMap();

function useSettingsStyles(theme) {
  return useMemo(() => {
    if (!styleCache.has(theme)) {
      styleCache.set(theme, createStyles(theme));
    }
    return styleCache.get(theme);
  }, [theme]);
}

export function SettingsPage({ children, navigation, subtitle, title }) {
  const { theme } = useTheme();
  const styles = useSettingsStyles(theme);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <TouchableOpacity
            accessibilityLabel="Go back"
            accessibilityRole="button"
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Icon name="arrow-left" size={21} color={theme.colors.text.secondary} />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>{title}</Text>
            {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          </View>
        </View>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function SettingsSection({ children, title }) {
  const { theme } = useTheme();
  const styles = useSettingsStyles(theme);

  return (
    <View style={styles.section}>
      {!!title && <Text style={styles.sectionTitle}>{title}</Text>}
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

export function SettingsActionRow({ danger = false, label, onPress, subtitle, value }) {
  const { theme } = useTheme();
  const styles = useSettingsStyles(theme);

  return (
    <TouchableOpacity
      accessibilityRole="button"
      disabled={!onPress}
      onPress={onPress}
      style={[styles.row, danger && styles.dangerRow]}
    >
      <View style={styles.rowCopy}>
        <Text style={[styles.rowLabel, danger && styles.dangerText]}>{label}</Text>
        {!!subtitle && <Text style={styles.rowSubtitle}>{subtitle}</Text>}
      </View>
      {!!value && <Text style={styles.rowValue}>{value}</Text>}
      {!!onPress && <Icon name="chevron-right" size={21} color={danger ? theme.colors.error : theme.colors.text.light} />}
    </TouchableOpacity>
  );
}

export function SettingsSwitchRow({ disabled = false, label, onValueChange, subtitle, value }) {
  const { theme } = useTheme();
  const styles = useSettingsStyles(theme);

  return (
    <View style={[styles.row, disabled && styles.disabled]}>
      <View style={styles.rowCopy}>
        <Text style={styles.rowLabel}>{label}</Text>
        {!!subtitle && <Text style={styles.rowSubtitle}>{subtitle}</Text>}
      </View>
      <Switch
        accessibilityLabel={label}
        disabled={disabled}
        onValueChange={onValueChange}
        thumbColor={value ? theme.colors.switchControl.thumbOn : theme.colors.switchControl.thumbOff}
        trackColor={{ false: theme.colors.switchControl.trackOff, true: theme.colors.switchControl.trackOn }}
        value={value}
      />
    </View>
  );
}

export function SettingsChoice({ label, onChange, options, value }) {
  const { theme } = useTheme();
  const styles = useSettingsStyles(theme);

  return (
    <View style={styles.choiceBlock}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.choices}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={option.value}
              onPress={() => onChange(option.value)}
              style={[styles.choice, selected && styles.choiceSelected]}
            >
              <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{option.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export function SettingsButton({ disabled = false, label, onPress, secondary = false }) {
  const { theme } = useTheme();
  const styles = useSettingsStyles(theme);
  return (
    <TouchableOpacity
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, secondary && styles.secondaryButton, disabled && styles.disabled]}
    >
      <Text style={[styles.buttonText, secondary && styles.secondaryButtonText]}>{label}</Text>
    </TouchableOpacity>
  );
}

function createStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    content: { padding: 20, paddingBottom: 44, gap: 24 },
    header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
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
    headerCopy: { flex: 1, gap: 5 },
    title: {
      color: theme.colors.text.primary,
      fontFamily: theme.typography.families.display,
      fontSize: 28,
      fontWeight: '700',
      letterSpacing: -0.4,
    },
    subtitle: { color: theme.colors.text.secondary, fontSize: 14, lineHeight: 20 },
    section: { gap: 10 },
    sectionTitle: { color: theme.colors.text.primary, fontSize: 15, fontWeight: '700' },
    sectionBody: {
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border.light,
      borderRadius: 7,
      overflow: 'hidden',
    },
    row: {
      minHeight: 64,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border.light,
    },
    rowCopy: { flex: 1, gap: 3 },
    rowLabel: { color: theme.colors.text.primary, fontSize: 15, fontWeight: '600' },
    rowSubtitle: { color: theme.colors.text.secondary, fontSize: 12, lineHeight: 17 },
    rowValue: { color: theme.colors.text.secondary, fontSize: 13 },
    dangerRow: { backgroundColor: `${theme.colors.error}0D` },
    dangerText: { color: theme.colors.error },
    choiceBlock: { padding: 14, gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border.light },
    choices: { flexDirection: 'row', gap: 8 },
    choice: {
      flex: 1,
      minHeight: 42,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
      borderRadius: 7,
      borderWidth: 1,
      borderColor: theme.colors.border.medium,
      backgroundColor: theme.colors.surfaceSecondary,
    },
    choiceSelected: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary },
    choiceText: { color: theme.colors.text.secondary, fontSize: 13, fontWeight: '600' },
    choiceTextSelected: { color: theme.colors.text.inverse },
    button: {
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 7,
      backgroundColor: theme.colors.primary,
      paddingHorizontal: 16,
    },
    buttonText: { color: theme.colors.text.inverse, fontSize: 15, fontWeight: '700' },
    secondaryButton: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border.medium },
    secondaryButtonText: { color: theme.colors.text.primary },
    disabled: { opacity: 0.55 },
  });
}

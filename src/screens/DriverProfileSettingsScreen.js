import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { SettingsButton, SettingsChoice, SettingsPage, SettingsSection } from '../components/SettingsComponents';
import { useDriving } from '../contexts/DrivingContext';
import { useTheme } from '../contexts/ThemeContext';
import { logUserAction } from '../utils/logger';
import {
  formatDateOfBirthFromDate,
  formatDateOfBirthInput,
  getDateOfBirthDate,
  getMinimumDateOfBirthDate,
} from '../utils/time';

const LICENSE_LABELS = {
  learners: "Learner's permit",
  restricted: 'Restricted license',
  unrestricted: 'Unrestricted license',
};
const LICENSE_OPTIONS = Object.entries(LICENSE_LABELS).map(([value, label]) => ({ value, label }));

export default function DriverProfileSettingsScreen({ navigation }) {
  const { setUserInfo, user } = useDriving();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [driverName, setDriverName] = useState(user.driverName || user.fullName || user.name || '');
  const [dateOfBirth, setDateOfBirth] = useState(formatDateOfBirthInput(user.dateOfBirth || user.birthDate || user.dob || ''));
  const [permitNumber, setPermitNumber] = useState(user.permitNumber || user.licenseNumber || '');
  const [licenseType, setLicenseType] = useState(user.licenseType || 'learners');

  const openDatePicker = () => {
    DateTimePickerAndroid.open({
      value: getDateOfBirthDate(dateOfBirth) || new Date(1980, 0, 1),
      mode: 'date',
      minimumDate: getMinimumDateOfBirthDate(),
      maximumDate: new Date(),
      onValueChange: (_event, selectedDate) => {
        setDateOfBirth(formatDateOfBirthFromDate(selectedDate));
      },
    });
  };

  const save = () => {
    setUserInfo({
      driverName: driverName.trim(),
      dateOfBirth: dateOfBirth.trim(),
      permitNumber: permitNumber.trim(),
      licenseType,
    });
    logUserAction('update_driver_info', 'SETTINGS');
    Alert.alert('Driver information saved', 'Future exports will use these details.');
  };

  return (
    <SettingsPage
      navigation={navigation}
      title="Driver information"
      subtitle="These details appear on official logbook exports."
    >
      <SettingsSection title="License">
        <SettingsChoice
          label="License type"
          onChange={setLicenseType}
          options={LICENSE_OPTIONS}
          value={licenseType}
        />
        <Text style={styles.note}>This changes whether Drively requires supervisor information on new drive logs.</Text>
      </SettingsSection>

      <SettingsSection title="Export details">
        <Field label="Driver name" onChangeText={setDriverName} placeholder="Full name" styles={styles} value={driverName} />
        <View style={styles.field}>
          <Text style={styles.label}>Date of birth</Text>
          <TouchableOpacity accessibilityRole="button" onPress={openDatePicker} style={styles.dateButton}>
            <Text style={[styles.dateText, !dateOfBirth && styles.placeholder]}>{dateOfBirth || 'Choose date'}</Text>
            <Icon name="calendar-month-outline" size={20} color={theme.colors.text.secondary} />
          </TouchableOpacity>
        </View>
        <Field
          autoCapitalize="characters"
          label="Permit or license number"
          onChangeText={setPermitNumber}
          placeholder="Optional"
          styles={styles}
          value={permitNumber}
        />
      </SettingsSection>
      <SettingsButton label="Save driver information" onPress={save} />
    </SettingsPage>
  );
}

function Field({ autoCapitalize = 'words', label, onChangeText, placeholder, styles, value }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        autoCapitalize={autoCapitalize}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={styles.placeholder.color}
        style={styles.input}
        value={value}
      />
    </View>
  );
}

function createStyles(theme) {
  return StyleSheet.create({
    field: { padding: 14, gap: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border.light },
    label: { color: theme.colors.text.primary, fontSize: 14, fontWeight: '600' },
    input: {
      minHeight: 46,
      borderWidth: 1,
      borderColor: theme.colors.border.medium,
      borderRadius: 7,
      paddingHorizontal: 12,
      color: theme.colors.text.primary,
      backgroundColor: theme.colors.surfaceSecondary,
      fontSize: 15,
    },
    dateButton: {
      minHeight: 46,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      borderWidth: 1,
      borderColor: theme.colors.border.medium,
      borderRadius: 7,
      paddingHorizontal: 12,
      backgroundColor: theme.colors.surfaceSecondary,
    },
    dateText: { flex: 1, color: theme.colors.text.primary, fontSize: 15 },
    placeholder: { color: theme.colors.text.light },
    note: { color: theme.colors.text.secondary, fontSize: 12, lineHeight: 17, paddingHorizontal: 14, paddingBottom: 14 },
  });
}

import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import ReauthenticationModal from '../components/ReauthenticationModal';
import {
  SettingsActionRow,
  SettingsButton,
  SettingsPage,
  SettingsSection,
  SettingsSwitchRow,
} from '../components/SettingsComponents';
import { useDataSecurity } from '../contexts/DataSecurityContext';
import { useTheme } from '../contexts/ThemeContext';

export default function EncryptionSettingsScreen({ navigation }) {
  const security = useDataSecurity();
  const { theme } = useTheme();
  const [reauthAction, setReauthAction] = useState(null);
  const [editingPasscode, setEditingPasscode] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const savePasscode = async () => {
    if (!/^\d{4,}$/.test(passcode)) {
      setError('Enter a passcode with at least 4 digits.');
      return;
    }
    if (passcode !== confirmation) {
      setError('The passcodes do not match.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      await security.changePasscode(passcode);
      setPasscode('');
      setConfirmation('');
      setEditingPasscode(false);
      Alert.alert('Passcode changed', 'Use the new passcode the next time Drively is locked.');
    } catch {
      setError('Drively could not change the encryption passcode.');
    } finally {
      setBusy(false);
    }
  };

  const requestDisable = () => Alert.alert(
    'Turn off data encryption?',
    'Drively will rewrite profiles, drives, settings, and location-derived records without app-level encryption. Your device lock still applies.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Continue', style: 'destructive', onPress: () => setReauthAction('disable') },
    ]
  );

  const finishReauthentication = async () => {
    const action = reauthAction;
    setReauthAction(null);
    if (action === 'change') {
      setEditingPasscode(true);
      return;
    }

    setBusy(true);
    try {
      await security.disableEncryption();
      Alert.alert('Encryption turned off', 'New and existing Drively data is now stored without app-level encryption.');
      navigation.goBack();
    } catch {
      Alert.alert('Encryption not changed', 'Drively could not safely rewrite all stored data. Encryption remains on.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsPage navigation={navigation} title="Data encryption" subtitle="Control how the logbook is protected on this device.">
      <SettingsSection title="Protection">
        <SettingsActionRow
          label="Encryption status"
          subtitle="Profiles, drives, settings, and location-derived records are encrypted at rest."
          value="On"
        />
        {security.biometricsAvailable && (
          <SettingsSwitchRow
            disabled={busy}
            label="Biometric unlock"
            onValueChange={async (enabled) => {
              setBusy(true);
              try {
                await security.setBiometricsEnabled(enabled);
              } catch {
                Alert.alert('Setting not changed', 'Drively could not update biometric unlock on this device.');
              } finally {
                setBusy(false);
              }
            }}
            subtitle="Use this device's fingerprint or face authentication instead of entering the passcode."
            value={!!security.metadata?.biometricEnabled}
          />
        )}
        <SettingsActionRow label="Change passcode" onPress={() => setReauthAction('change')} subtitle="Choose a new passcode without re-encrypting your logbook." />
      </SettingsSection>

      {editingPasscode && (
        <SettingsSection title="New passcode">
          <View style={styles.form}>
            <Text style={[styles.label, { color: theme.colors.text.primary }]}>New passcode</Text>
            <TextInput
              accessibilityLabel="New encryption passcode"
              autoFocus
              editable={!busy}
              keyboardType="number-pad"
              maxLength={16}
              onChangeText={(value) => { setPasscode(value.replace(/\D/g, '')); setError(''); }}
              secureTextEntry
              style={[styles.input, { borderColor: theme.colors.border.medium, color: theme.colors.text.primary }]}
              value={passcode}
            />
            <Text style={[styles.label, { color: theme.colors.text.primary }]}>Confirm new passcode</Text>
            <TextInput
              accessibilityLabel="Confirm new encryption passcode"
              editable={!busy}
              keyboardType="number-pad"
              maxLength={16}
              onChangeText={(value) => { setConfirmation(value.replace(/\D/g, '')); setError(''); }}
              onSubmitEditing={savePasscode}
              secureTextEntry
              style={[styles.input, { borderColor: error ? theme.colors.error : theme.colors.border.medium, color: theme.colors.text.primary }]}
              value={confirmation}
            />
            {!!error && <Text accessibilityLiveRegion="polite" style={[styles.error, { color: theme.colors.error }]}>{error}</Text>}
            <SettingsButton disabled={busy} label="Save new passcode" onPress={savePasscode} />
            <SettingsButton disabled={busy} label="Cancel" onPress={() => { setEditingPasscode(false); setPasscode(''); setConfirmation(''); setError(''); }} secondary />
          </View>
        </SettingsSection>
      )}

      <SettingsSection title="Encryption">
        <SettingsActionRow
          danger
          label="Turn off encryption"
          onPress={busy ? undefined : requestDisable}
          subtitle="Store the full logbook without Drively's app-level encryption."
        />
      </SettingsSection>

      <ReauthenticationModal
        body={reauthAction === 'disable'
          ? 'Confirm your identity before Drively rewrites the full logbook without app-level encryption.'
          : 'Confirm your identity before choosing a new encryption passcode.'}
        confirmLabel="Confirm and continue"
        onCancel={() => setReauthAction(null)}
        onSuccess={finishReauthentication}
        title={reauthAction === 'disable' ? 'Confirm encryption change' : 'Confirm passcode change'}
        visible={!!reauthAction}
      />
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  form: { gap: 10, padding: 14 },
  label: { fontSize: 14, fontWeight: '600' },
  input: { borderRadius: 7, borderWidth: 1, fontSize: 17, letterSpacing: 3, paddingHorizontal: 13, paddingVertical: 12 },
  error: { fontSize: 13, lineHeight: 18 },
});

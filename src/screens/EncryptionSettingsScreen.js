import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import PasscodeKeypad from '../components/PasscodeKeypad';
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
  const [passcodeStage, setPasscodeStage] = useState('create');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const automaticEntry = security.metadata?.automaticPasscodeEntry !== false;

  const resetPasscodeEditor = () => {
    setEditingPasscode(false);
    setPasscode('');
    setConfirmation('');
    setPasscodeStage('create');
    setError('');
  };

  const savePasscode = async (candidate = passcode, candidateConfirmation = confirmation) => {
    if (!/^\d{4,}$/.test(candidate)) {
      setError('Enter a passcode with at least 4 digits.');
      return;
    }
    if (candidate !== candidateConfirmation) {
      setError('The passcodes do not match.');
      if (automaticEntry) setConfirmation('');
      return;
    }

    setBusy(true);
    setError('');
    try {
      await security.changePasscode(candidate);
      resetPasscodeEditor();
      Alert.alert('Passcode changed', 'Use the new passcode the next time Drively is locked.');
    } catch {
      setError('Drively could not change the encryption passcode.');
    } finally {
      setBusy(false);
    }
  };

  const continuePasscodeChange = () => {
    if (!/^\d{4,}$/.test(passcode)) {
      setError('Enter a passcode with at least 4 digits.');
      return;
    }
    setError('');
    setPasscodeStage('confirm');
  };

  const updateKeypadValue = (next) => {
    if (error) setError('');
    if (passcodeStage === 'confirm') {
      setConfirmation(next);
      if (next.length === passcode.length) savePasscode(passcode, next);
    } else {
      setPasscode(next);
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
      setPasscodeStage('create');
      setEditingPasscode(true);
      return;
    }
    if (action === 'regenerate') {
      setBusy(true);
      try {
        await security.regenerateRecoveryKey();
      } catch {
        Alert.alert('Recovery key not changed', 'Drively could not safely generate a new recovery key. Your current key still works.');
      } finally {
        setBusy(false);
      }
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
        <SettingsSwitchRow
          disabled={busy}
          label="Automatic passcode entry"
          onValueChange={async (enabled) => {
            setBusy(true);
            try {
              await security.setAutomaticPasscodeEntry(enabled);
            } catch {
              Alert.alert('Setting not changed', 'Drively could not update automatic passcode entry.');
            } finally {
              setBusy(false);
            }
          }}
          subtitle="Show an integrated number pad and passcode dots, then unlock when the last digit is entered."
          value={security.metadata?.automaticPasscodeEntry !== false}
        />
        <SettingsActionRow label="Change passcode" onPress={() => setReauthAction('change')} subtitle="Choose a new passcode without re-encrypting your logbook." />
        <SettingsActionRow
          label="Generate a new recovery key"
          onPress={() => Alert.alert(
            'Replace recovery key?',
            'Your current recovery key will stop working immediately. You will need to save the new key.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Continue', onPress: () => setReauthAction('regenerate') },
            ]
          )}
          subtitle="Replace a lost or exposed recovery key. The old key will no longer unlock your logbook."
        />
      </SettingsSection>

      <SettingsSection title="Encryption">
        <SettingsActionRow
          danger
          label="Turn off encryption"
          onPress={busy ? undefined : requestDisable}
          subtitle="Store the full logbook without Drively's app-level encryption."
        />
      </SettingsSection>

      <ReauthenticationModal
        body={editingPasscode
          ? (passcodeStage === 'confirm'
            ? 'Enter the new passcode again to verify it.'
            : 'Choose a passcode with at least 4 digits.')
          : reauthAction === 'disable'
          ? 'Confirm your identity before Drively rewrites the full logbook without app-level encryption.'
          : reauthAction === 'regenerate'
          ? 'Confirm your identity before Drively replaces your current recovery key.'
          : 'Confirm your identity before choosing a new encryption passcode.'}
        confirmLabel="Confirm and continue"
        onCancel={editingPasscode ? resetPasscodeEditor : () => setReauthAction(null)}
        onSuccess={finishReauthentication}
        title={editingPasscode
          ? (passcodeStage === 'confirm' ? 'Confirm new passcode' : 'Enter new passcode')
          : reauthAction === 'disable' ? 'Confirm encryption change' : reauthAction === 'regenerate' ? 'Confirm recovery-key change' : 'Confirm passcode change'}
        visible={!!reauthAction || editingPasscode}
      >
        {editingPasscode ? (
          <View style={styles.form}>
            {automaticEntry ? (
              <PasscodeKeypad
                busy={busy}
                compact
                expectedLength={passcodeStage === 'confirm' ? passcode.length : null}
                onChange={updateKeypadValue}
                value={passcodeStage === 'confirm' ? confirmation : passcode}
              />
            ) : (
              <TextInput
                accessibilityLabel={passcodeStage === 'confirm' ? 'Confirm new encryption passcode' : 'New encryption passcode'}
                autoFocus
                editable={!busy}
                keyboardType="number-pad"
                maxLength={16}
                onChangeText={(value) => {
                  const next = value.replace(/\D/g, '');
                  if (passcodeStage === 'confirm') setConfirmation(next);
                  else setPasscode(next);
                  setError('');
                }}
                onSubmitEditing={passcodeStage === 'confirm' ? () => savePasscode() : continuePasscodeChange}
                secureTextEntry
                style={[styles.input, { borderColor: error ? theme.colors.error : theme.colors.border.medium, color: theme.colors.text.primary }]}
                value={passcodeStage === 'confirm' ? confirmation : passcode}
              />
            )}
            {!!error && <Text accessibilityLiveRegion="polite" style={[styles.error, { color: theme.colors.error }]}>{error}</Text>}
            {passcodeStage === 'create' && <SettingsButton disabled={busy} label="Continue" onPress={continuePasscodeChange} />}
            {!automaticEntry && passcodeStage === 'confirm' && <SettingsButton disabled={busy} label="Save new passcode" onPress={() => savePasscode()} />}
          </View>
        ) : null}
      </ReauthenticationModal>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  form: { gap: 10 },
  input: { borderRadius: 7, borderWidth: 1, fontSize: 17, letterSpacing: 3, paddingHorizontal: 13, paddingVertical: 12 },
  error: { fontSize: 13, lineHeight: 18 },
});

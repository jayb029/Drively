import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useDataSecurity } from '../contexts/DataSecurityContext';
import { useTheme } from '../contexts/ThemeContext';
import PasscodeKeypad from '../components/PasscodeKeypad';

export default function DataSecurityGate() {
  const security = useDataSecurity();
  const { theme } = useTheme();
  const [passcode, setPasscode] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [useBiometrics, setUseBiometrics] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [setupStage, setSetupStage] = useState('create');
  const automaticBiometricAttempted = useRef(false);
  const confirmationRef = useRef(null);
  const isSetup = security.metadata?.configured === false;
  const automaticEntry = isSetup || security.metadata?.automaticPasscodeEntry !== false;
  const savedPasscodeLength = Number.isInteger(security.metadata?.passcodeLength)
    ? security.metadata.passcodeLength
    : null;

  useEffect(() => {
    if (isSetup || !security.metadata?.biometricEnabled || automaticBiometricAttempted.current) return;
    automaticBiometricAttempted.current = true;
    security.unlockBiometric().then((success) => {
      if (!success) setError('Biometric unlock was not completed. Try again or enter your passcode.');
    });
  }, [isSetup, security.metadata?.biometricEnabled]);

  if (!security.metadata) return <View style={{ flex: 1, backgroundColor: theme.colors.background }} />;

  const updatePasscode = (value, setter) => {
    setter(value.replace(/\D/g, ''));
    if (error) setError('');
  };

  const submit = async (candidate = passcode, candidateConfirmation = confirmation) => {
    setError('');
    if (!/^\d{4,}$/.test(candidate)) {
      setError('Enter a passcode with at least 4 digits.');
      return;
    }
    if (isSetup && candidate !== candidateConfirmation) {
      setError('The passcodes do not match.');
      if (automaticEntry) setConfirmation('');
      return;
    }
    setBusy(true);
    try {
      if (isSetup) {
        await security.setupEncryption(candidate, useBiometrics);
      } else if (!(await security.unlockPasscode(candidate))) {
        setError('That passcode is incorrect.');
        if (automaticEntry) setPasscode('');
      }
    } catch (submissionError) {
      setError(submissionError.message || 'Drively could not update data protection.');
    } finally {
      setBusy(false);
    }
  };

  const updateKeypadValue = (next) => {
    if (error) setError('');
    if (isSetup && setupStage === 'confirm') {
      setConfirmation(next);
      if (next.length === passcode.length) submit(passcode, next);
      return;
    }
    setPasscode(next);
    if (!isSetup && savedPasscodeLength && next.length === savedPasscodeLength) submit(next);
  };

  const continueSetup = () => {
    if (!/^\d{4,}$/.test(passcode)) {
      setError('Enter a passcode with at least 4 digits.');
      return;
    }
    setError('');
    setSetupStage('confirm');
  };

  const unlockBiometric = async () => {
    setBusy(true);
    setError('');
    try {
      if (!(await security.unlockBiometric())) {
        setError('Biometric unlock was not completed. Try again or enter your passcode.');
      }
    } finally {
      setBusy(false);
    }
  };

  const skip = () => Alert.alert(
    'Keep data unencrypted?',
    'Profiles, drive history, settings, and location-derived records will be stored without Drively encryption.',
    [
      { text: 'Go back', style: 'cancel' },
      { text: 'Use without encryption', style: 'destructive', onPress: security.skipEncryption },
    ]
  );

  const inputColors = {
    backgroundColor: theme.colors.surfaceSecondary,
    borderColor: error ? theme.colors.error : theme.colors.border.medium,
    color: theme.colors.text.primary,
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]}>
      {isSetup && (
        <View style={styles.topActionRow}>
          <TouchableOpacity
            accessibilityHint="Continue using Drively without encrypting your data"
            accessibilityRole="button"
            disabled={busy}
            onPress={skip}
            style={[styles.skipButton, busy && styles.disabled]}
          >
            <Text style={[styles.skipText, { color: theme.colors.primary }]}>Skip for now</Text>
          </TouchableOpacity>
        </View>
      )}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            <View style={[styles.securityMark, { backgroundColor: theme.colors.primary }]}>
              <Icon name={isSetup ? 'shield-lock-outline' : 'lock-outline'} size={28} color={theme.colors.text.inverse} />
            </View>

            <Text style={[styles.title, { color: theme.colors.text.primary }]}>
              {isSetup ? 'Protect your Drively data' : 'Drively is locked'}
            </Text>
            <Text style={[styles.body, { color: theme.colors.text.secondary }]}>
              {isSetup
                ? 'Create a passcode to encrypt your profiles, drives, settings, and location-derived records on this device.'
                : 'Your data is encrypted. Unlock it to continue to Drively.'}
            </Text>

            {isSetup && (
              <View style={[styles.protectionSummary, { borderColor: theme.colors.border.light }]}>
                <ProtectionRow icon="cellphone-lock" text="Stored data is encrypted on this device" theme={theme} />
                <View style={[styles.rowDivider, { backgroundColor: theme.colors.border.light }]} />
                <ProtectionRow icon="key-outline" text="Your passcode cannot be recovered by Drively" theme={theme} />
              </View>
            )}

            <View style={styles.form}>
              <Text style={[styles.label, { color: theme.colors.text.primary }]}>
                {isSetup && setupStage === 'confirm' ? 'Confirm passcode' : isSetup ? 'Create passcode' : 'Passcode'}
              </Text>
              {automaticEntry ? (
                <PasscodeKeypad
                  busy={busy}
                  expectedLength={isSetup && setupStage === 'confirm' ? passcode.length : savedPasscodeLength}
                  onChange={updateKeypadValue}
                  value={isSetup && setupStage === 'confirm' ? confirmation : passcode}
                />
              ) : <TextInput
                accessibilityLabel={isSetup ? 'Create passcode' : 'Passcode'}
                autoFocus={!security.metadata?.biometricEnabled}
                editable={!busy}
                keyboardType="number-pad"
                maxLength={16}
                onChangeText={(value) => updatePasscode(value, setPasscode)}
                onSubmitEditing={isSetup ? () => confirmationRef.current?.focus() : () => submit()}
                placeholder="4 digits or more"
                placeholderTextColor={theme.colors.text.light}
                returnKeyType={isSetup ? 'next' : 'done'}
                secureTextEntry
                style={[styles.input, inputColors]}
                value={passcode}
              />}

              {isSetup && !automaticEntry && (
                <>
                  <Text style={[styles.label, styles.confirmLabel, { color: theme.colors.text.primary }]}>Confirm passcode</Text>
                  <TextInput
                    ref={confirmationRef}
                    accessibilityLabel="Confirm passcode"
                    editable={!busy}
                    keyboardType="number-pad"
                    maxLength={16}
                    onChangeText={(value) => updatePasscode(value, setConfirmation)}
                    onSubmitEditing={() => submit()}
                    returnKeyType="done"
                    secureTextEntry
                    style={[styles.input, inputColors]}
                    value={confirmation}
                  />
                </>
              )}

              {!!error && (
                <View accessibilityLiveRegion="polite" style={styles.errorRow}>
                  <Icon name="alert-circle-outline" size={17} color={theme.colors.error} />
                  <Text style={[styles.error, { color: theme.colors.error }]}>{error}</Text>
                </View>
              )}
            </View>

            {isSetup && setupStage === 'create' && security.biometricsAvailable && (
              <View style={[styles.biometricRow, { borderColor: theme.colors.border.light }]}>
                <Icon name="fingerprint" size={24} color={theme.colors.primary} />
                <View style={styles.biometricCopy}>
                  <Text style={[styles.biometricTitle, { color: theme.colors.text.primary }]}>Unlock with biometrics</Text>
                  <Text style={[styles.biometricBody, { color: theme.colors.text.secondary }]}>Use your fingerprint or face after setup.</Text>
                </View>
                <Switch
                  accessibilityLabel="Unlock with biometrics"
                  disabled={busy}
                  ios_backgroundColor={theme.colors.switchControl.trackOff}
                  onValueChange={setUseBiometrics}
                  thumbColor={useBiometrics ? theme.colors.switchControl.thumbOn : theme.colors.switchControl.thumbOff}
                  trackColor={{ false: theme.colors.switchControl.trackOff, true: theme.colors.switchControl.trackOn }}
                  value={useBiometrics}
                />
              </View>
            )}

            {((isSetup && setupStage === 'create') || !automaticEntry || (!isSetup && !savedPasscodeLength)) && <TouchableOpacity
              accessibilityRole="button"
              disabled={busy}
              onPress={isSetup && automaticEntry ? continueSetup : () => submit()}
              style={[styles.primaryButton, { backgroundColor: theme.colors.primary }, busy && styles.disabled]}
            >
              <Icon name={isSetup ? 'lock-check-outline' : 'lock-open-variant-outline'} size={20} color={theme.colors.text.inverse} />
              <Text style={[styles.primaryButtonText, { color: theme.colors.text.inverse }]}>
                {busy ? 'Please wait…' : isSetup && automaticEntry ? 'Continue' : isSetup ? 'Encrypt and continue' : 'Unlock Drively'}
              </Text>
            </TouchableOpacity>}

            {!isSetup && security.metadata.biometricEnabled && (
              <TouchableOpacity
                accessibilityRole="button"
                disabled={busy}
                onPress={unlockBiometric}
                style={[styles.secondaryButton, { borderColor: theme.colors.border.medium }]}
              >
                <Icon name="fingerprint" size={21} color={theme.colors.primary} />
                <Text style={[styles.secondaryButtonText, { color: theme.colors.text.primary }]}>Use biometrics</Text>
              </TouchableOpacity>
            )}

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ProtectionRow({ icon, text, theme }) {
  return (
    <View style={styles.protectionRow}>
      <Icon name={icon} size={19} color={theme.colors.primary} />
      <Text style={[styles.protectionText, { color: theme.colors.text.secondary }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingVertical: 32 },
  content: { alignSelf: 'center', maxWidth: 430, paddingHorizontal: 24, width: '100%' },
  securityMark: { alignItems: 'center', borderRadius: 10, height: 52, justifyContent: 'center', width: 52 },
  title: { fontSize: 28, fontWeight: '750', letterSpacing: -0.6, marginTop: 20 },
  body: { fontSize: 15, lineHeight: 22, marginTop: 7 },
  protectionSummary: { borderBottomWidth: 1, borderTopWidth: 1, marginTop: 24 },
  protectionRow: { alignItems: 'center', flexDirection: 'row', minHeight: 48, paddingHorizontal: 2 },
  protectionText: { flex: 1, fontSize: 13, lineHeight: 18, marginLeft: 12 },
  rowDivider: { height: StyleSheet.hairlineWidth, marginLeft: 33 },
  form: { marginTop: 25 },
  label: { fontSize: 13, fontWeight: '650', marginBottom: 8 },
  confirmLabel: { marginTop: 17 },
  input: { borderRadius: 8, borderWidth: 1, fontSize: 19, letterSpacing: 5, minHeight: 52, paddingHorizontal: 15, paddingVertical: 12 },
  errorRow: { alignItems: 'flex-start', flexDirection: 'row', marginTop: 11 },
  error: { flex: 1, fontSize: 13, lineHeight: 18, marginLeft: 7 },
  biometricRow: { alignItems: 'center', borderBottomWidth: 1, borderTopWidth: 1, flexDirection: 'row', marginTop: 24, minHeight: 68, paddingVertical: 10 },
  biometricCopy: { flex: 1, paddingHorizontal: 12 },
  biometricTitle: { fontSize: 15, fontWeight: '650' },
  biometricBody: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  primaryButton: { alignItems: 'center', borderRadius: 8, flexDirection: 'row', gap: 9, justifyContent: 'center', marginTop: 24, minHeight: 50, paddingHorizontal: 16 },
  primaryButtonText: { fontSize: 15, fontWeight: '700' },
  secondaryButton: { alignItems: 'center', borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 10, minHeight: 48, paddingHorizontal: 16 },
  secondaryButtonText: { fontSize: 15, fontWeight: '650' },
  topActionRow: { alignItems: 'flex-end', minHeight: 48, paddingHorizontal: 16 },
  skipButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingHorizontal: 8 },
  skipText: { fontSize: 14, fontWeight: '650' },
  disabled: { opacity: 0.55 },
});

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

export default function DataSecurityGate() {
  const security = useDataSecurity();
  const { theme } = useTheme();
  const [passcode, setPasscode] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [useBiometrics, setUseBiometrics] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const automaticBiometricAttempted = useRef(false);
  const confirmationRef = useRef(null);
  const isSetup = security.metadata?.configured === false;

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

  const submit = async () => {
    setError('');
    if (!/^\d{4,}$/.test(passcode)) {
      setError('Enter a passcode with at least 4 digits.');
      return;
    }
    if (isSetup && passcode !== confirmation) {
      setError('The passcodes do not match.');
      return;
    }
    setBusy(true);
    try {
      if (isSetup) {
        await security.setupEncryption(passcode, useBiometrics);
      } else if (!(await security.unlockPasscode(passcode))) {
        setError('That passcode is incorrect.');
      }
    } catch (submissionError) {
      setError(submissionError.message || 'Drively could not update data protection.');
    } finally {
      setBusy(false);
    }
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
                {isSetup ? 'Create passcode' : 'Passcode'}
              </Text>
              <TextInput
                accessibilityLabel={isSetup ? 'Create passcode' : 'Passcode'}
                autoFocus={!security.metadata?.biometricEnabled}
                editable={!busy}
                keyboardType="number-pad"
                maxLength={16}
                onChangeText={(value) => updatePasscode(value, setPasscode)}
                onSubmitEditing={isSetup ? () => confirmationRef.current?.focus() : submit}
                placeholder="4 digits or more"
                placeholderTextColor={theme.colors.text.light}
                returnKeyType={isSetup ? 'next' : 'done'}
                secureTextEntry
                style={[styles.input, inputColors]}
                value={passcode}
              />

              {isSetup && (
                <>
                  <Text style={[styles.label, styles.confirmLabel, { color: theme.colors.text.primary }]}>Confirm passcode</Text>
                  <TextInput
                    ref={confirmationRef}
                    accessibilityLabel="Confirm passcode"
                    editable={!busy}
                    keyboardType="number-pad"
                    maxLength={16}
                    onChangeText={(value) => updatePasscode(value, setConfirmation)}
                    onSubmitEditing={submit}
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

            {isSetup && security.biometricsAvailable && (
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

            <TouchableOpacity
              accessibilityRole="button"
              disabled={busy}
              onPress={submit}
              style={[styles.primaryButton, { backgroundColor: theme.colors.primary }, busy && styles.disabled]}
            >
              <Icon name={isSetup ? 'lock-check-outline' : 'lock-open-variant-outline'} size={20} color={theme.colors.text.inverse} />
              <Text style={[styles.primaryButtonText, { color: theme.colors.text.inverse }]}>
                {busy ? 'Please wait…' : isSetup ? 'Encrypt and continue' : 'Unlock Drively'}
              </Text>
            </TouchableOpacity>

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

            {isSetup && (
              <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={skip} style={styles.skipButton}>
                <Text style={[styles.skipText, { color: theme.colors.text.secondary }]}>Continue without encryption</Text>
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
  skipButton: { alignItems: 'center', marginTop: 6, paddingVertical: 14 },
  skipText: { fontSize: 14, textDecorationLine: 'underline' },
  disabled: { opacity: 0.55 },
});

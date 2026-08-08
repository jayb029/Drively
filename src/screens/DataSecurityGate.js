import React, { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
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
  const isSetup = security.metadata?.configured === false;

  useEffect(() => {
    if (isSetup || !security.metadata?.biometricEnabled || automaticBiometricAttempted.current) return;
    automaticBiometricAttempted.current = true;
    security.unlockBiometric().then((success) => {
      if (!success) setError('Biometric unlock was not completed. Try again or enter your passcode.');
    });
  }, [isSetup, security.metadata?.biometricEnabled]);

  if (!security.metadata) return <View style={{ flex: 1, backgroundColor: theme.colors.background }} />;

  const submit = async () => {
    setError('');
    if (!/^\d{4,}$/.test(passcode)) {
      setError('Use at least 4 digits.');
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
    'Your logbook may include identity and location-derived information. Encryption is strongly recommended.',
    [
      { text: 'Go back', style: 'cancel' },
      { text: 'Use without encryption', style: 'destructive', onPress: security.skipEncryption },
    ]
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
        <View style={styles.content}>
          <Icon name="shield-lock-outline" size={34} color={theme.colors.primary} />
          <Text style={[styles.title, { color: theme.colors.text.primary }]}>{isSetup ? 'Protect your logbook' : 'Unlock Drively'}</Text>
          <Text style={[styles.body, { color: theme.colors.text.secondary }]}>
            {isSetup
              ? 'Drively can encrypt profiles, drives, settings, and location-derived records before they are stored on this device.'
              : 'Enter your passcode to decrypt the logbook on this device.'}
          </Text>

          <Text style={[styles.label, { color: theme.colors.text.primary }]}>Passcode</Text>
          <TextInput
            autoFocus={!security.metadata?.biometricEnabled}
            editable={!busy}
            keyboardType="number-pad"
            maxLength={16}
            onChangeText={(value) => setPasscode(value.replace(/\D/g, ''))}
            onSubmitEditing={isSetup ? undefined : submit}
            placeholder="At least 4 digits"
            placeholderTextColor={theme.colors.text.light}
            secureTextEntry
            style={[styles.input, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border.light, color: theme.colors.text.primary }]}
            value={passcode}
          />
          {isSetup && (
            <>
              <Text style={[styles.label, { color: theme.colors.text.primary }]}>Confirm passcode</Text>
              <TextInput
                editable={!busy}
                keyboardType="number-pad"
                maxLength={16}
                onChangeText={(value) => setConfirmation(value.replace(/\D/g, ''))}
                onSubmitEditing={submit}
                secureTextEntry
                style={[styles.input, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border.light, color: theme.colors.text.primary }]}
                value={confirmation}
              />
            </>
          )}
          {!!error && <Text style={[styles.error, { color: theme.colors.error }]}>{error}</Text>}

          {isSetup && security.biometricsAvailable && (
            <View style={[styles.biometricRow, { borderColor: theme.colors.border.light }]}>
              <View style={styles.biometricCopy}>
                <Text style={[styles.biometricTitle, { color: theme.colors.text.primary }]}>Biometric unlock</Text>
                <Text style={[styles.biometricBody, { color: theme.colors.text.secondary }]}>Use this device's fingerprint or face authentication.</Text>
              </View>
              <Switch value={useBiometrics} onValueChange={setUseBiometrics} />
            </View>
          )}

          <TouchableOpacity disabled={busy} onPress={submit} style={[styles.primaryButton, { backgroundColor: theme.colors.primary }, busy && styles.disabled]}>
            <Text style={styles.primaryButtonText}>{busy ? 'Working…' : isSetup ? 'Encrypt my data' : 'Unlock'}</Text>
          </TouchableOpacity>
          {!isSetup && security.metadata.biometricEnabled && (
            <TouchableOpacity disabled={busy} onPress={unlockBiometric} style={[styles.secondaryButton, { borderColor: theme.colors.border.light }]}>
              <Icon name="fingerprint" size={20} color={theme.colors.primary} />
              <Text style={[styles.secondaryButtonText, { color: theme.colors.text.primary }]}>Use biometrics</Text>
            </TouchableOpacity>
          )}
          {isSetup && (
            <TouchableOpacity disabled={busy} onPress={skip} style={styles.skipButton}>
              <Text style={[styles.skipText, { color: theme.colors.text.secondary }]}>Continue without encryption</Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1, justifyContent: 'center' },
  content: { alignSelf: 'center', maxWidth: 440, paddingHorizontal: 28, width: '100%' },
  title: { fontSize: 27, fontWeight: '750', letterSpacing: -0.5, marginTop: 18 },
  body: { fontSize: 15, lineHeight: 22, marginBottom: 26, marginTop: 8 },
  label: { fontSize: 13, fontWeight: '650', marginBottom: 7, marginTop: 13 },
  input: { borderRadius: 9, borderWidth: 1, fontSize: 18, letterSpacing: 4, paddingHorizontal: 14, paddingVertical: 13 },
  error: { fontSize: 13, marginTop: 10 },
  biometricRow: { alignItems: 'center', borderBottomWidth: 1, borderTopWidth: 1, flexDirection: 'row', marginTop: 22, paddingVertical: 14 },
  biometricCopy: { flex: 1, paddingRight: 18 },
  biometricTitle: { fontSize: 15, fontWeight: '650' },
  biometricBody: { fontSize: 13, lineHeight: 18, marginTop: 3 },
  primaryButton: { alignItems: 'center', borderRadius: 9, marginTop: 24, paddingVertical: 14 },
  primaryButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  secondaryButton: { alignItems: 'center', borderRadius: 9, borderWidth: 1, flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 10, paddingVertical: 13 },
  secondaryButtonText: { fontSize: 15, fontWeight: '650' },
  skipButton: { alignItems: 'center', paddingVertical: 16 },
  skipText: { fontSize: 14, textDecorationLine: 'underline' },
  disabled: { opacity: 0.6 },
});

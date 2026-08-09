import React, { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import PasscodeKeypad from './PasscodeKeypad';
import { useDataSecurity } from '../contexts/DataSecurityContext';
import { useTheme } from '../contexts/ThemeContext';
import { formatPasscodeLockoutTime } from '../utils/dataEncryption';

export default function ReauthenticationModal({
  body = 'Confirm your identity before Drively creates the full plaintext JSON backup.',
  children,
  confirmLabel = 'Unlock and continue',
  title = 'Unlock to export backup',
  visible,
  onCancel,
  onSuccess,
}) {
  const security = useDataSecurity();
  const { theme } = useTheme();
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const automaticEntry = security.metadata?.automaticPasscodeEntry !== false;
  const passcodeLength = Number.isInteger(security.metadata?.passcodeLength)
    ? security.metadata.passcodeLength
    : null;
  const lockoutRemaining = Math.max(0, (security.passcodeLockoutUntil || 0) - Date.now());
  const isLockedOut = lockoutRemaining > 0;

  const finish = () => {
    setPasscode('');
    setError('');
    onSuccess();
  };

  const authenticate = async (candidate = passcode, biometric = false) => {
    if (isLockedOut) return;
    setBusy(true);
    setError('');
    const success = await security.requireReauthentication(candidate, biometric);
    setBusy(false);
    if (success) finish();
    else {
      if (automaticEntry && !biometric) setPasscode('');
      setError(biometric ? 'Biometric authentication was not completed.' : 'That passcode is incorrect.');
    }
  };

  const cancel = () => {
    setPasscode('');
    setError('');
    onCancel();
  };

  const updatePasscode = (next) => {
    setPasscode(next);
    if (error) setError('');
    if (passcodeLength && next.length === passcodeLength) authenticate(next);
  };
  const displayedError = isLockedOut
    ? `Too many incorrect attempts. Try again in ${formatPasscodeLockoutTime(lockoutRemaining)}.`
    : error;

  return (
    <Modal animationType="fade" onRequestClose={cancel} transparent visible={visible}>
      <View style={styles.backdrop}>
        <ScrollView
          contentContainerStyle={styles.dialogContent}
          keyboardShouldPersistTaps="handled"
          style={[styles.dialog, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border.light }]}
        >
          <Text style={[styles.title, { color: theme.colors.text.primary }]}>{title}</Text>
          <Text style={[styles.body, { color: theme.colors.text.secondary }]}>{body}</Text>
          {children || (automaticEntry ? (
            <PasscodeKeypad
              busy={busy || isLockedOut}
              compact
              expectedLength={passcodeLength}
              onChange={updatePasscode}
              value={passcode}
            />
          ) : <TextInput
            autoFocus
            editable={!busy && !isLockedOut}
            keyboardType="number-pad"
            onChangeText={(value) => setPasscode(value.replace(/\D/g, ''))}
            onSubmitEditing={() => authenticate()}
            placeholder="Passcode"
            placeholderTextColor={theme.colors.text.light}
            secureTextEntry
            style={[styles.input, { borderColor: theme.colors.border.light, color: theme.colors.text.primary }]}
            value={passcode}
          />)}
          {!children && !!displayedError && <Text accessibilityLiveRegion="polite" style={[styles.error, { color: theme.colors.error }]}>{displayedError}</Text>}
          {!children && (!automaticEntry || !passcodeLength) && <TouchableOpacity disabled={busy || isLockedOut || passcode.length < 4} onPress={() => authenticate()} style={[styles.primary, { backgroundColor: theme.colors.primary }]}>
            <Text style={styles.primaryText}>{confirmLabel}</Text>
          </TouchableOpacity>}
          {!children && security.metadata?.biometricEnabled && (
            <TouchableOpacity disabled={busy || isLockedOut} onPress={() => authenticate(passcode, true)} style={[styles.secondary, { borderColor: theme.colors.border.light }]}>
              <Icon name="fingerprint" size={20} color={theme.colors.primary} />
              <Text style={[styles.secondaryText, { color: theme.colors.text.primary }]}>Use biometrics</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity disabled={busy} onPress={cancel} style={styles.cancel}>
            <Text style={[styles.cancelText, { color: theme.colors.text.secondary }]}>Cancel</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.55)', flex: 1, justifyContent: 'center', padding: 24 },
  dialog: { borderRadius: 10, borderWidth: 1, flexGrow: 0, flexShrink: 1, maxHeight: '94%', maxWidth: 420, width: '100%' },
  dialogContent: { padding: 22 },
  title: { fontSize: 20, fontWeight: '700' },
  body: { fontSize: 14, lineHeight: 20, marginBottom: 18, marginTop: 7 },
  input: { borderRadius: 8, borderWidth: 1, fontSize: 17, letterSpacing: 3, paddingHorizontal: 13, paddingVertical: 12 },
  error: { fontSize: 13, marginTop: 8 },
  primary: { alignItems: 'center', borderRadius: 8, marginTop: 16, paddingVertical: 13 },
  primaryText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  secondary: { alignItems: 'center', borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 7, justifyContent: 'center', marginTop: 9, paddingVertical: 12 },
  secondaryText: { fontSize: 14, fontWeight: '650' },
  cancel: { alignItems: 'center', marginTop: 4, paddingVertical: 11 },
  cancelText: { fontSize: 14 },
});

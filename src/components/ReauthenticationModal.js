import React, { useState } from 'react';
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useDataSecurity } from '../contexts/DataSecurityContext';
import { useTheme } from '../contexts/ThemeContext';

export default function ReauthenticationModal({ visible, onCancel, onSuccess }) {
  const security = useDataSecurity();
  const { theme } = useTheme();
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const finish = () => {
    setPasscode('');
    setError('');
    onSuccess();
  };

  const authenticate = async (biometric = false) => {
    setBusy(true);
    setError('');
    const success = await security.requireReauthentication(passcode, biometric);
    setBusy(false);
    if (success) finish();
    else setError(biometric ? 'Biometric authentication was not completed.' : 'That passcode is incorrect.');
  };

  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible={visible}>
      <View style={styles.backdrop}>
        <View style={[styles.dialog, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border.light }]}>
          <Text style={[styles.title, { color: theme.colors.text.primary }]}>Unlock to export backup</Text>
          <Text style={[styles.body, { color: theme.colors.text.secondary }]}>Confirm your identity before Drively creates the full plaintext JSON backup.</Text>
          <TextInput
            autoFocus
            editable={!busy}
            keyboardType="number-pad"
            onChangeText={(value) => setPasscode(value.replace(/\D/g, ''))}
            onSubmitEditing={() => authenticate(false)}
            placeholder="Passcode"
            placeholderTextColor={theme.colors.text.light}
            secureTextEntry
            style={[styles.input, { borderColor: theme.colors.border.light, color: theme.colors.text.primary }]}
            value={passcode}
          />
          {!!error && <Text style={[styles.error, { color: theme.colors.error }]}>{error}</Text>}
          <TouchableOpacity disabled={busy || passcode.length < 4} onPress={() => authenticate(false)} style={[styles.primary, { backgroundColor: theme.colors.primary }]}>
            <Text style={styles.primaryText}>Unlock and continue</Text>
          </TouchableOpacity>
          {security.metadata?.biometricEnabled && (
            <TouchableOpacity disabled={busy} onPress={() => authenticate(true)} style={[styles.secondary, { borderColor: theme.colors.border.light }]}>
              <Icon name="fingerprint" size={20} color={theme.colors.primary} />
              <Text style={[styles.secondaryText, { color: theme.colors.text.primary }]}>Use biometrics</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity disabled={busy} onPress={onCancel} style={styles.cancel}>
            <Text style={[styles.cancelText, { color: theme.colors.text.secondary }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.55)', flex: 1, justifyContent: 'center', padding: 24 },
  dialog: { borderRadius: 10, borderWidth: 1, maxWidth: 420, padding: 22, width: '100%' },
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


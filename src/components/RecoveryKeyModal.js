import React, { useState } from 'react';
import { Modal, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useDataSecurity } from '../contexts/DataSecurityContext';
import { useTheme } from '../contexts/ThemeContext';

export default function RecoveryKeyModal() {
  const security = useDataSecurity();
  const { theme } = useTheme();
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const recoveryKey = security.pendingRecoveryKey;

  const finish = async () => {
    setBusy(true);
    try {
      await security.acknowledgeRecoveryKey();
      setConfirmed(false);
    } finally {
      setBusy(false);
    }
  };

  const share = () => Share.share({
    message: `Drively recovery key\n\n${recoveryKey}\n\nKeep this private. It can unlock your encrypted Drively logbook and reset your passcode.`,
    title: 'Save Drively recovery key',
  });

  return (
    <Modal animationType="fade" onRequestClose={() => undefined} transparent visible={!!recoveryKey}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border.light }]}>
          <View style={[styles.icon, { backgroundColor: theme.colors.primary }]}>
            <Icon name="key-variant" size={27} color={theme.colors.text.inverse} />
          </View>
          <Text style={[styles.title, { color: theme.colors.text.primary }]}>Save your recovery key</Text>
          <Text style={[styles.body, { color: theme.colors.text.secondary }]}>
            This is the only way to reset a forgotten passcode if biometrics are unavailable. Store it somewhere private outside Drively.
          </Text>
          <View style={[styles.keyBox, { backgroundColor: theme.colors.surfaceSecondary, borderColor: theme.colors.border.medium }]}>
            <Text accessibilityLabel={`Recovery key ${recoveryKey}`} selectable style={[styles.key, { color: theme.colors.text.primary }]}>
              {recoveryKey}
            </Text>
          </View>
          <Text style={[styles.warning, { color: theme.colors.text.secondary }]}>Drively cannot display this same key again. Regenerating it will invalidate the old one.</Text>
          <TouchableOpacity accessibilityRole="button" onPress={share} style={[styles.secondary, { borderColor: theme.colors.border.medium }]}>
            <Icon name="share-variant-outline" size={19} color={theme.colors.primary} />
            <Text style={[styles.secondaryText, { color: theme.colors.text.primary }]}>Save or share securely</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="checkbox"
            accessibilityState={{ checked: confirmed }}
            onPress={() => setConfirmed((value) => !value)}
            style={styles.confirmRow}
          >
            <Icon name={confirmed ? 'checkbox-marked' : 'checkbox-blank-outline'} size={23} color={theme.colors.primary} />
            <Text style={[styles.confirmText, { color: theme.colors.text.primary }]}>I saved this recovery key somewhere safe</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            disabled={!confirmed || busy}
            onPress={finish}
            style={[styles.primary, { backgroundColor: theme.colors.primary }, (!confirmed || busy) && styles.disabled]}
          >
            <Text style={[styles.primaryText, { color: theme.colors.text.inverse }]}>{busy ? 'Saving…' : 'Done'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.58)', flex: 1, justifyContent: 'center', padding: 20 },
  card: { borderRadius: 12, borderWidth: 1, maxWidth: 430, padding: 22, width: '100%' },
  icon: { alignItems: 'center', borderRadius: 9, height: 48, justifyContent: 'center', width: 48 },
  title: { fontSize: 23, fontWeight: '750', letterSpacing: -0.4, marginTop: 17 },
  body: { fontSize: 14, lineHeight: 21, marginTop: 7 },
  keyBox: { borderRadius: 8, borderWidth: 1, marginTop: 20, paddingHorizontal: 12, paddingVertical: 17 },
  key: { fontFamily: 'monospace', fontSize: 17, fontWeight: '700', letterSpacing: 1.2, lineHeight: 25, textAlign: 'center' },
  warning: { fontSize: 12, lineHeight: 17, marginTop: 9 },
  secondary: { alignItems: 'center', borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 18, minHeight: 46 },
  secondaryText: { fontSize: 14, fontWeight: '650' },
  confirmRow: { alignItems: 'center', flexDirection: 'row', gap: 10, marginTop: 18, minHeight: 44 },
  confirmText: { flex: 1, fontSize: 14, lineHeight: 19 },
  primary: { alignItems: 'center', borderRadius: 8, justifyContent: 'center', marginTop: 8, minHeight: 48 },
  primaryText: { fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.5 },
});

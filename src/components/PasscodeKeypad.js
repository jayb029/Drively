import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useTheme } from '../contexts/ThemeContext';
import { haptics } from '../utils/haptics';

export default function PasscodeKeypad({ busy = false, compact = false, expectedLength, onChange, value }) {
  const { theme } = useTheme();
  const bubbleCount = expectedLength || Math.max(4, value.length);
  const changeValue = (next) => {
    haptics.selection();
    onChange(next);
  };

  return (
    <View accessibilityLabel={`${value.length} passcode digits entered`} style={styles.keypadArea}>
      <View style={styles.passcodeBubbles}>
        {Array.from({ length: bubbleCount }, (_, index) => (
          <View
            key={index}
            style={[
              styles.passcodeBubble,
              { borderColor: theme.colors.border.medium },
              index < value.length && { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
            ]}
          />
        ))}
      </View>
      <View style={[styles.numberPad, compact && styles.numberPadCompact]}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
          <TouchableOpacity
            accessibilityLabel={`${digit}`}
            accessibilityRole="button"
            disabled={busy}
            key={digit}
            onPress={() => value.length < 16 && changeValue(`${value}${digit}`)}
            style={[
              styles.numberKey,
              compact && styles.numberKeyCompact,
              { borderColor: theme.colors.border.light, backgroundColor: theme.colors.surfaceSecondary },
            ]}
          >
            <Text style={[styles.numberKeyText, compact && styles.numberKeyTextCompact, { color: theme.colors.text.primary }]}>{digit}</Text>
          </TouchableOpacity>
        ))}
        <View style={[styles.numberKeySpacer, compact && styles.numberKeyCompact]} />
        <TouchableOpacity
          accessibilityLabel="0"
          accessibilityRole="button"
          disabled={busy}
          onPress={() => value.length < 16 && changeValue(`${value}0`)}
          style={[
            styles.numberKey,
            compact && styles.numberKeyCompact,
            { borderColor: theme.colors.border.light, backgroundColor: theme.colors.surfaceSecondary },
          ]}
        >
          <Text style={[styles.numberKeyText, compact && styles.numberKeyTextCompact, { color: theme.colors.text.primary }]}>0</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityLabel="Delete last digit"
          accessibilityRole="button"
          disabled={busy || !value.length}
          onPress={() => value.length && changeValue(value.slice(0, -1))}
          style={[styles.deleteKey, compact && styles.numberKeyCompact]}
        >
          <Icon name="backspace-outline" size={compact ? 22 : 25} color={value.length ? theme.colors.text.secondary : theme.colors.text.light} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  keypadArea: { marginTop: 2 },
  passcodeBubbles: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center', minHeight: 34, paddingHorizontal: 10 },
  passcodeBubble: { borderRadius: 9, borderWidth: 1.5, height: 16, width: 16 },
  numberPad: { alignSelf: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginTop: 18, maxWidth: 272 },
  numberPadCompact: { gap: 8, marginTop: 12, maxWidth: 232 },
  numberKey: { alignItems: 'center', borderRadius: 8, borderWidth: 1, height: 58, justifyContent: 'center', width: 84 },
  numberKeyCompact: { height: 48, width: 72 },
  numberKeyText: { fontSize: 23, fontWeight: '600' },
  numberKeyTextCompact: { fontSize: 20 },
  numberKeySpacer: { height: 58, width: 84 },
  deleteKey: { alignItems: 'center', height: 58, justifyContent: 'center', width: 84 },
});

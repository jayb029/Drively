import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { normalizeRecoveryKey } from '../utils/dataEncryption';

const SEGMENT_COUNT = 6;
const SEGMENT_LENGTH = 4;

export function formatRecoveryKeyInput(value) {
  const body = normalizeRecoveryKey(value).slice(0, SEGMENT_COUNT * SEGMENT_LENGTH);
  const segments = body.match(/.{1,4}/g) || [];
  return `DRIVELY-${segments.join('-')}`;
}

export default function RecoveryKeyInput({ disabled = false, error = false, onChangeText, value }) {
  const { theme } = useTheme();
  const inputRef = useRef(null);
  const [focused, setFocused] = useState(false);
  const body = normalizeRecoveryKey(value).slice(0, SEGMENT_COUNT * SEGMENT_LENGTH);
  const formattedValue = formatRecoveryKeyInput(body);

  const update = (next) => onChangeText(formatRecoveryKeyInput(next));

  useEffect(() => {
    const subscription = Keyboard.addListener('keyboardDidHide', () => {
      inputRef.current?.blur();
      setFocused(false);
    });
    return () => subscription.remove();
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.prefixRow}>
        <Text style={[styles.prefixText, { color: theme.colors.text.secondary }]}>DRIVELY-</Text>
        <Text style={[styles.progressText, { color: theme.colors.text.light }]}>{body.length} / 24</Text>
      </View>
      <View style={styles.inputArea}>
        <View pointerEvents="none" style={styles.segments}>
        {Array.from({ length: SEGMENT_COUNT }, (_, index) => {
          const segment = body.slice(index * SEGMENT_LENGTH, (index + 1) * SEGMENT_LENGTH);
          return (
            <View
              key={index}
              style={[
                styles.segment,
                {
                  backgroundColor: theme.colors.surfaceSecondary,
                  borderColor: error ? theme.colors.error : focused ? theme.colors.primary : theme.colors.border.medium,
                },
              ]}
            >
              <Text style={[styles.segmentText, { color: theme.colors.text.primary }]}>{segment || '····'}</Text>
            </View>
          );
        })}
        </View>
        <TextInput
          ref={inputRef}
          accessibilityHint="Enter the 24 characters after Drively"
          accessibilityLabel="Recovery key"
          autoCapitalize="characters"
          autoCorrect={false}
          caretHidden
          editable={!disabled}
          onBlur={() => setFocused(false)}
          onChangeText={update}
          onFocus={() => setFocused(true)}
          selection={{ end: formattedValue.length, start: formattedValue.length }}
          style={styles.touchInput}
          value={formattedValue}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%' },
  prefixRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 1 },
  prefixText: { fontFamily: 'monospace', fontSize: 14, fontWeight: '700', letterSpacing: 0.6 },
  progressText: { fontSize: 12, fontVariant: ['tabular-nums'] },
  inputArea: { position: 'relative' },
  segments: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  segment: { alignItems: 'center', borderRadius: 7, borderWidth: 1, flexBasis: '31%', flexGrow: 1, height: 48, justifyContent: 'center' },
  segmentText: { fontFamily: 'monospace', fontSize: 16, fontWeight: '700', letterSpacing: 2, textAlign: 'center' },
  touchInput: { bottom: 0, color: 'transparent', left: 0, opacity: 0.01, position: 'absolute', right: 0, top: 0 },
});

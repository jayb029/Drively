import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDriving } from '../contexts/DrivingContext';
import { useTheme } from '../contexts/ThemeContext';

const DEFAULT_PLACEHOLDER = 'Tap to reveal';

function buildMask(value) {
  const text = String(value || '').trim();
  if (!text) return DEFAULT_PLACEHOLDER;

  const length = Math.min(Math.max(text.length, 6), 18);
  return '•'.repeat(length);
}

export function SensitiveText({
  value,
  fallback = 'Not set',
  textStyle,
  containerStyle,
  placeholder,
  revealLabel = 'Sensitive information',
  numberOfLines,
  forceVisible = false,
}) {
  const { theme } = useTheme();
  const { settings } = useDriving();
  const [revealed, setRevealed] = useState(false);
  const fade = useRef(new Animated.Value(1)).current;
  const displayValue = value ? String(value) : fallback;
  const hiddenValue = placeholder || buildMask(value);
  const censoringEnabled = settings.censorSensitiveInfo ?? true;
  const isVisible = forceVisible || !censoringEnabled || revealed || !value;

  useEffect(() => {
    fade.setValue(0.72);
    Animated.timing(fade, {
      toValue: 1,
      duration: 150,
      useNativeDriver: true,
    }).start();
  }, [fade, revealed]);

  const toggleReveal = () => {
    if (!value || forceVisible || !censoringEnabled) return;
    setRevealed((current) => !current);
  };

  return (
    <Pressable
      onPress={toggleReveal}
      disabled={!value || forceVisible || !censoringEnabled}
      accessibilityRole={value && censoringEnabled && !forceVisible ? 'button' : undefined}
      accessibilityLabel={
        value && censoringEnabled && !forceVisible
          ? (revealed ? `${revealLabel}, revealed` : `${revealLabel}, hidden. Tap to reveal.`)
          : undefined
      }
      style={[styles.pressable, containerStyle]}
    >
      <Animated.View style={[styles.row, { opacity: fade }]}>
        <Text
          style={[
            textStyle,
            !isVisible && {
              color: theme.colors.text.secondary,
              textShadowColor: theme.colors.text.secondary,
              textShadowOffset: { width: 0, height: 0 },
              textShadowRadius: 8,
            },
          ]}
          numberOfLines={numberOfLines}
        >
          {isVisible ? displayValue : hiddenValue}
        </Text>
        {!!value && censoringEnabled && !forceVisible && (
          <Icon
            name={revealed ? 'eye-off-outline' : 'eye-outline'}
            size={15}
            color={theme.colors.text.secondary}
            style={styles.icon}
          />
        )}
      </Animated.View>
    </Pressable>
  );
}

export function SensitiveField({
  label,
  value,
  fallback,
  labelStyle,
  valueStyle,
  containerStyle,
  revealLabel,
}) {
  return (
    <View style={containerStyle}>
      {!!label && <Text style={labelStyle}>{label}</Text>}
      <SensitiveText
        value={value}
        fallback={fallback}
        textStyle={valueStyle}
        revealLabel={revealLabel || label}
      />
    </View>
  );
}

export function SensitiveBlock({
  children,
  containerStyle,
  hiddenStyle,
  revealLabel = 'Sensitive information',
}) {
  const { theme } = useTheme();
  const { settings } = useDriving();
  const [revealed, setRevealed] = useState(false);
  const censoringEnabled = settings.censorSensitiveInfo ?? true;

  if (!censoringEnabled) {
    return <View style={containerStyle}>{children}</View>;
  }

  return (
    <Pressable
      onPress={() => setRevealed((current) => !current)}
      accessibilityRole="button"
      accessibilityLabel={revealed ? `${revealLabel}, revealed` : `${revealLabel}, hidden. Tap to reveal.`}
      style={containerStyle}
    >
      {revealed ? (
        children
      ) : (
        <View style={[styles.hiddenBlock, { borderColor: theme.colors.border.light }, hiddenStyle]}>
          <Text
            style={[
              styles.hiddenBlockText,
              {
                color: theme.colors.text.secondary,
                textShadowColor: theme.colors.text.secondary,
              },
            ]}
          >
            {'•'.repeat(14)}
          </Text>
          <Icon name="eye-outline" size={17} color={theme.colors.text.secondary} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  row: {
    minHeight: 20,
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '100%',
  },
  icon: {
    marginLeft: 6,
  },
  hiddenBlock: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  hiddenBlockText: {
    fontSize: 18,
    letterSpacing: 0,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
});

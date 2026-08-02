import React from 'react';
import { View, Text as RNText, TouchableOpacity, StyleSheet } from 'react-native';
import { Button as PaperButton, Card as PaperCard, Text as PaperText, Badge as PaperBadge, ProgressBar as PaperProgressBar } from 'react-native-paper';
import Animated from 'react-native-reanimated';
import { useTheme } from '../contexts/ThemeContext';
import { borderRadius, colors, shadows, spacing, typography } from '../utils/theme';

/**
 * Modern Button Component with multiple variants
 * Uses React Native Paper Button component underneath
 */
export const Button = ({ 
  title, 
  onPress, 
  variant = 'primary', 
  size = 'md', 
  disabled = false,
  icon,
  style,
  children,
  ...props 
}) => {
  const { theme } = useTheme();

  // Map our variant names to Paper's mode prop
  const modeMap = {
    primary: 'contained',
    secondary: 'outlined',
    tertiary: 'text',
    success: 'contained',
    warning: 'contained',
    danger: 'contained',
  };

  // Map our colors based on variant
  const colorMap = {
    primary: theme.colors.primary,
    secondary: theme.colors.secondary,
    tertiary: theme.colors.secondary,
    success: theme.colors.success,
    warning: theme.colors.warning,
    danger: theme.colors.error,
  };

  // Map size to style adjustments
  const sizeStyleMap = {
    sm: { paddingHorizontal: theme.spacing.sm },
    md: {}, // default
    lg: { paddingHorizontal: theme.spacing.lg, height: 48 },
  };
  
  const labelStyle = {
    fontSize: size === 'sm' ? theme.typography.sizes.sm : 
             size === 'lg' ? theme.typography.sizes.lg : 
             theme.typography.sizes.base
  };

  return (
    <PaperButton
      mode={modeMap[variant] || 'contained'}
      buttonColor={variant !== 'secondary' ? colorMap[variant] : undefined}
      onPress={onPress}
      disabled={disabled}
      icon={icon}
      style={[sizeStyleMap[size], style]}
      labelStyle={labelStyle}
      {...props}
    >
      {title || children}
    </PaperButton>
  );
};

/**
 * Modern Card Component based on React Native Paper
 */
export const Card = ({ 
  children, 
  style, 
  padding = 'md', 
  title, 
  subtitle,
  onPress,
  elevation = 1,
  ...props 
}) => {
  const { theme } = useTheme();
  
  const paddingMap = {
    none: 0,
    sm: theme.spacing.lg,
    md: theme.spacing.xl,
    lg: theme.spacing.xxl,
    xl: theme.spacing.xxxl,
  };

  const cardPadding = paddingMap[padding] || paddingMap.md;
  
  return (
    <PaperCard
      style={[{
        marginVertical: theme.spacing.md,
        backgroundColor: theme.colors.surface,
      }, style]}
      elevation={elevation}
      onPress={onPress}
      {...props}
    >
      {(title || subtitle) && (
        <PaperCard.Title
          title={title}
          subtitle={subtitle}
          titleStyle={{
            fontSize: theme.typography.sizes.lg,
            fontWeight: theme.typography.weights.semibold,
          }}
          subtitleStyle={{
            fontSize: theme.typography.sizes.sm,
            color: theme.colors.text.secondary,
          }}
        />
      )}
      <PaperCard.Content style={{ padding: title ? 0 : cardPadding }}>
        {children}
      </PaperCard.Content>
    </PaperCard>
  );
};

/**
 * Progress Bar Component
 */
export const ProgressBar = ({ 
  progress, 
  color,
  height = 10,
  animated = true,
  style,
  ...props 
}) => {
  const { theme } = useTheme();
  
  return (
    <PaperProgressBar
      progress={progress / 100}
      color={color || theme.colors.primary}
      style={[{
        height,
        borderRadius: height / 2,
      }, style]}
      {...props}
    />
  );
};

/**
 * Text Component with theme support
 */
export const Text = ({
  children,
  style,
  variant = 'bodyMedium',
  color,
  ...props
}) => {
  const { theme } = useTheme();
  
  const textColor = color || theme.colors.text.primary;
  
  return (
    <PaperText
      variant={variant}
      style={[{ color: textColor }, style]}
      {...props}
    >
      {children}
    </PaperText>
  );
};

/**
 * Badge Component with theme support
 */
export const Badge = ({ 
  text, 
  variant = 'primary', 
  size = 'md',
  style,
  ...props 
}) => {
  const { theme } = useTheme();

  const colorMap = {
    primary: theme.colors.primary,
    secondary: theme.colors.secondary,
    success: theme.colors.success,
    warning: theme.colors.warning,
    danger: theme.colors.error,
    light: theme.colors.gray[100],
  };

  // Size adjustments
  const sizeMap = {
    sm: { fontSize: theme.typography.sizes.xs },
    md: { fontSize: theme.typography.sizes.sm },
    lg: { fontSize: theme.typography.sizes.base },
  };

  return (
    <PaperBadge
      style={[
        {
          backgroundColor: colorMap[variant],
        },
        sizeMap[size],
        style
      ]}
      size={size === 'lg' ? 25 : size === 'sm' ? 15 : 20}
      {...props}
    >
      {text}
    </PaperBadge>
  );
};

/**
 * Section Header Component
 */
export const SectionHeader = ({ 
  title, 
  subtitle, 
  action,
  style,
  ...props 
}) => {
  const { theme } = useTheme();
  
  return (
    <View style={[{
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: theme.spacing.xl,
    }, style]} {...props}>
      <View style={{ flex: 1 }}>
        <Text 
          variant="titleLarge"
          style={{
            fontWeight: theme.typography.weights.bold,
            letterSpacing: -0.3,
            marginBottom: theme.spacing.xs,
          }}
        >
          {title}
        </Text>
        
        {subtitle && (
          <Text 
            variant="bodyMedium"
            style={{
              color: theme.colors.text.secondary,
              fontWeight: theme.typography.weights.medium,
            }}
          >
            {subtitle}
          </Text>
        )}
      </View>
      {action && action}
    </View>
  );
};

/**
 * Creates a fade-in animation using Reanimated
 */
export const FadeIn = ({ children, duration = 500, delay = 0, style, ...props }) => {
  const { FadeIn } = Animated;
  
  return (
    <Animated.View 
      entering={FadeIn.duration(duration).delay(delay)} 
      style={style} 
      {...props}
    >
      {children}
    </Animated.View>
  );
};

/**
 * Creates a slide-in animation using Reanimated
 */
export const SlideIn = ({ 
  children, 
  duration = 500, 
  delay = 0, 
  direction = 'left', 
  style, 
  ...props 
}) => {
  const { SlideInLeft, SlideInRight, SlideInUp, SlideInDown } = Animated;
  
  const getAnimation = () => {
    switch (direction) {
      case 'right': return SlideInRight;
      case 'up': return SlideInUp;
      case 'down': return SlideInDown;
      default: return SlideInLeft;
    }
  };
  
  const Animation = getAnimation();
  
  return (
    <Animated.View 
      entering={Animation.duration(duration).delay(delay)} 
      style={style} 
      {...props}
    >
      {children}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border.light,
    ...shadows.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  sectionHeaderText: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    color: colors.text.primary,
    letterSpacing: -0.3,
    marginBottom: spacing.xs,
  },
  sectionSubtitle: {
    fontSize: typography.sizes.base,
    color: colors.text.secondary,
    fontWeight: typography.weights.medium,
  },
});

export default {
  Button,
  Card,
  ProgressBar,
  Badge,
  SectionHeader,
  Text,
  FadeIn,
  SlideIn,
};

/**
 * Theme configuration for consistent styling across the app
 * Supports both light and dark mode themes
 * Integrates with React Native Paper for material design components
 */
import { MD3LightTheme, MD3DarkTheme } from 'react-native-paper';

// Base color palette that works for both themes
export const baseColors = {
  // Primary Colors (slightly adjusted for better dark mode contrast)
  primary: '#3b82f6',
  primaryDark: '#1e40af',
  primaryLight: '#93c5fd',
  
  // Secondary Colors
  secondary: '#10b981',
  secondaryDark: '#059669',
  secondaryLight: '#6ee7b7',
  
  // Accent Colors
  accent: '#f59e0b',
  accentDark: '#d97706',
  accentLight: '#fcd34d',
  
  // Status Colors
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',
  
  // Neutral Colors
  white: '#ffffff',
  black: '#000000',
  gray: {
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
  },
};

// Light theme colors
export const lightColors = {
  ...baseColors,
  
  // Background Colors
  background: '#f0f4f8',
  surface: '#ffffff',
  surfaceSecondary: '#f8fafc',
  overlay: 'rgba(0, 0, 0, 0.5)',
  
  // Text Colors
  text: {
    primary: '#1e293b',
    secondary: '#64748b',
    light: '#94a3b8',
    inverse: '#ffffff',
  },
  
  // Border Colors
  border: {
    light: '#e2e8f0',
    medium: '#cbd5e1',
    dark: '#94a3b8',
  },

  switchControl: {
    trackOff: '#cbd5e1',
    trackOn: '#93c5fd',
    thumbOff: '#ffffff',
    thumbOn: '#1e40af',
  },
  
  // Card Colors
  card: {
    background: '#ffffff',
    border: '#e2e8f0',
  },
};

// Dark theme colors
export const darkColors = {
  ...baseColors,
  
  // Adjusted primary colors for better dark mode visibility
  primary: '#60a5fa',
  primaryDark: '#3b82f6',
  primaryLight: '#93c5fd',
  
  // Background Colors
  background: '#0f172a',
  surface: '#1e293b',
  surfaceSecondary: '#334155',
  overlay: 'rgba(0, 0, 0, 0.7)',
  
  // Text Colors
  text: {
    primary: '#f1f5f9',
    secondary: '#94a3b8',
    light: '#64748b',
    inverse: '#1e293b',
  },
  
  // Border Colors
  border: {
    light: '#334155',
    medium: '#475569',
    dark: '#64748b',
  },

  switchControl: {
    trackOff: '#334155',
    trackOn: '#2563eb',
    thumbOff: '#cbd5e1',
    thumbOn: '#ffffff',
  },
  
  // Card Colors
  card: {
    background: '#1e293b',
    border: '#334155',
  },
};

// Legacy colors export for backward compatibility
export const colors = lightColors;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
};

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  round: 9999,
};

export const typography = {
  sizes: {
    xs: 11,
    sm: 13,
    base: 15,
    lg: 17,
    xl: 20,
    xxl: 22,
    xxxl: 28,
    huge: 36,
  },
  weights: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    extrabold: '800',
  },
  lineHeights: {
    tight: 1.2,
    normal: 1.4,
    relaxed: 1.6,
  }
};

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 4,
  },
  xl: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 6,
  },
  colored: (color, opacity = 0.3) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: opacity,
    shadowRadius: 8,
    elevation: 6,
  }),
};

// Dark mode shadows (more subtle)
export const darkShadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  xl: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 6,
  },
  colored: (color, opacity = 0.5) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: opacity,
    shadowRadius: 8,
    elevation: 6,
  }),
};

// Create a custom MD3 theme based on our color palette
const createCustomMD3Theme = (colors, isDark) => {
  const baseMD3Theme = isDark ? MD3DarkTheme : MD3LightTheme;
  
  return {
    ...baseMD3Theme,
    colors: {
      ...baseMD3Theme.colors,
      primary: colors.primary,
      onPrimary: colors.text.inverse,
      primaryContainer: colors.primaryLight,
      onPrimaryContainer: isDark ? colors.text.primary : colors.primaryDark,
      secondary: colors.secondary,
      onSecondary: colors.text.inverse,
      secondaryContainer: colors.secondaryLight,
      onSecondaryContainer: isDark ? colors.text.primary : colors.secondaryDark,
      tertiary: colors.accent,
      onTertiary: colors.text.inverse,
      tertiaryContainer: colors.accentLight,
      onTertiaryContainer: isDark ? colors.text.primary : colors.accentDark,
      error: colors.error,
      background: colors.background,
      onBackground: colors.text.primary,
      surface: colors.surface,
      onSurface: colors.text.primary,
      surfaceVariant: colors.surfaceSecondary,
      onSurfaceVariant: colors.text.secondary,
      outline: colors.border.medium,
      elevation: {
        level0: 'transparent',
        level1: colors.surface,
        level2: colors.surfaceSecondary,
        level3: isDark ? colors.gray[700] : colors.gray[100],
        level4: isDark ? colors.gray[600] : colors.gray[200],
        level5: isDark ? colors.gray[500] : colors.gray[300],
      }
    },
    roundness: borderRadius.md,
  };
};

// Light theme
export const lightTheme = {
  colors: lightColors,
  spacing,
  borderRadius,
  typography,
  shadows,
  materialTheme: createCustomMD3Theme(lightColors, false),
};

// Dark theme
export const darkTheme = {
  colors: darkColors,
  spacing,
  borderRadius,
  typography,
  shadows: darkShadows,
  materialTheme: createCustomMD3Theme(darkColors, true),
};

// Default theme (light) for backward compatibility
export const theme = lightTheme;

export default lightTheme;

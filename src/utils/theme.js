/**
 * Theme configuration for consistent styling across the app
 * Supports both light and dark mode themes
 * Integrates with React Native Paper for material design components
 */
import { Platform } from 'react-native';
import { MD3LightTheme, MD3DarkTheme } from 'react-native-paper';

// Base color palette that works for both themes
export const baseColors = {
  // Road-sign green anchors primary actions without reading as a generic
  // productivity-app blue.
  primary: '#355E4C',
  primaryDark: '#274638',
  primaryLight: '#A9C5B5',
  
  // Secondary Colors
  secondary: '#C97826',
  secondaryDark: '#995718',
  secondaryLight: '#E9C79F',
  
  // Accent Colors
  accent: '#C97826',
  accentDark: '#995718',
  accentLight: '#F0D7B9',
  
  // Status Colors
  success: '#477A5F',
  warning: '#C97826',
  error: '#B44A3D',
  info: '#5D6A61',
  
  // Neutral Colors
  white: '#ffffff',
  black: '#000000',
  gray: {
    50: '#F7F7F3',
    100: '#EFF0EA',
    200: '#D8DBD3',
    300: '#C2C6BD',
    400: '#979E94',
    500: '#70786F',
    600: '#535B54',
    700: '#3B413C',
    800: '#282D29',
    900: '#171B18',
  },
};

// Light theme colors
export const lightColors = {
  ...baseColors,
  
  // Background Colors
  background: '#F2F3EE',
  surface: '#FFFFFF',
  surfaceSecondary: '#F7F7F3',
  overlay: 'rgba(0, 0, 0, 0.5)',
  
  // Text Colors
  text: {
    primary: '#202521',
    secondary: '#5F675F',
    light: '#858D85',
    inverse: '#ffffff',
  },
  
  // Border Colors
  border: {
    light: '#DDE0D8',
    medium: '#C4C9C0',
    dark: '#929A91',
  },

  switchControl: {
    trackOff: '#C9CDC5',
    trackOn: '#8EAD9B',
    thumbOff: '#ffffff',
    thumbOn: '#355E4C',
  },
  
  // Card Colors
  card: {
    background: '#ffffff',
    border: '#DDE0D8',
  },
  instrument: {
    background: '#FFFFFF',
    text: '#202521',
    muted: '#5F675F',
    accent: '#995718',
  },
};

// Dark theme colors
export const darkColors = {
  ...baseColors,
  
  // Adjusted primary colors for better dark mode visibility
  primary: '#86AF99',
  primaryDark: '#6E9680',
  primaryLight: '#B8CFBF',
  
  // Background Colors
  background: '#151815',
  surface: '#202420',
  surfaceSecondary: '#292E29',
  overlay: 'rgba(0, 0, 0, 0.7)',
  
  // Text Colors
  text: {
    primary: '#F2F3EE',
    secondary: '#B3B9B1',
    light: '#858D85',
    inverse: '#172019',
  },
  
  // Border Colors
  border: {
    light: '#373D37',
    medium: '#4A514A',
    dark: '#6A736A',
  },

  switchControl: {
    trackOff: '#444A44',
    trackOn: '#668C78',
    thumbOff: '#B8BEB6',
    thumbOn: '#F2F3EE',
  },
  
  // Card Colors
  card: {
    background: '#202420',
    border: '#373D37',
  },
  instrument: {
    background: '#2A302B',
    text: '#F2F3EE',
    muted: '#B3B9B1',
    accent: '#E9C79F',
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
  sm: 4,
  md: 7,
  lg: 9,
  xl: 10,
  xxl: 12,
  round: 9999,
};

export const typography = {
  families: {
    display: Platform.select({
      ios: 'Avenir Next Condensed',
      android: 'sans-serif-condensed',
      default: undefined,
    }),
    body: Platform.select({
      ios: 'Avenir Next',
      android: 'sans-serif',
      default: undefined,
    }),
    utility: Platform.select({
      ios: 'Avenir Next Condensed',
      android: 'sans-serif-condensed',
      default: undefined,
    }),
  },
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
    elevation: 0,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  xl: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  colored: (color, opacity = 0.3) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: Math.min(opacity, 0.08),
    shadowRadius: 5,
    elevation: 2,
  }),
};

// Dark mode shadows (more subtle)
export const darkShadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 2,
    elevation: 0,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 1,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 2,
  },
  xl: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 3,
  },
  colored: (color, opacity = 0.5) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: Math.min(opacity, 0.24),
    shadowRadius: 5,
    elevation: 2,
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

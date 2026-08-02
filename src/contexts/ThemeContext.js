import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightTheme, darkTheme } from '../utils/theme';
import { logUserAction, logger } from '../utils/logger';

/**
 * Theme modes supported by the app
 */
export const THEME_MODES = {
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system',
};

const normalizeColorScheme = (colorScheme) => (
  colorScheme === 'dark' || colorScheme === 'light' ? colorScheme : null
);

const ThemeContext = createContext({
  theme: lightTheme,
  themeMode: THEME_MODES.SYSTEM,
  isDark: false,
  setThemeMode: () => {},
});

/**
 * ThemeProvider manages theme state and persistence
 * Supports light, dark, and system theme modes
 * Integrates with React Native Paper for material design
 */
export function ThemeProvider({ children }) {
  const systemColorScheme = useColorScheme();
  const [appearanceColorScheme, setAppearanceColorScheme] = useState(
    normalizeColorScheme(Appearance.getColorScheme())
  );
  const [themeMode, setThemeModeState] = useState(THEME_MODES.SYSTEM);
  const [isLoading, setIsLoading] = useState(true);

  // Keep a direct Appearance subscription because some native builds can lag
  // behind the hook when the app starts in system theme mode.
  useEffect(() => {
    const updateAppearanceColorScheme = ({ colorScheme } = {}) => {
      setAppearanceColorScheme(normalizeColorScheme(colorScheme ?? Appearance.getColorScheme()));
    };

    updateAppearanceColorScheme();
    const subscription = Appearance.addChangeListener(updateAppearanceColorScheme);

    return () => subscription?.remove();
  }, []);

  // Determine if dark mode should be active
  const effectiveSystemScheme = appearanceColorScheme || normalizeColorScheme(systemColorScheme) || 'light';
  const isDark = themeMode === THEME_MODES.DARK || 
    (themeMode === THEME_MODES.SYSTEM && effectiveSystemScheme === 'dark');

  // Get the current theme object
  const theme = isDark ? darkTheme : lightTheme;

  /**
   * Load saved theme preference from AsyncStorage
   */
  useEffect(() => {
    const loadThemePreference = async () => {
      try {
        const savedThemeMode = await AsyncStorage.getItem('themeMode');
        if (savedThemeMode && Object.values(THEME_MODES).includes(savedThemeMode)) {
          setThemeModeState(savedThemeMode);
        }
      } catch (error) {
        console.warn('Failed to load theme preference:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadThemePreference();
  }, []);

  /**
   * Update theme mode and persist to storage
   */
  const setThemeMode = useCallback(async (mode) => {
    if (!Object.values(THEME_MODES).includes(mode)) {
      console.warn('Invalid theme mode:', mode);
      return;
    }

    try {
      setThemeModeState(mode);
      await AsyncStorage.setItem('themeMode', mode);
      await logUserAction('change_theme', 'THEME_CONTEXT', { newTheme: mode, previousTheme: themeMode });
    } catch (error) {
      console.warn('Failed to save theme preference:', error);
      await logger.error('Failed to save theme preference', 'THEME_CONTEXT', { error: error.message, mode });
    }
  }, [themeMode]);

  const value = useMemo(() => ({
    theme,
    themeMode,
    isDark,
    setThemeMode,
    isLoading,
    systemColorScheme, // Original useColorScheme result
    systemTheme: appearanceColorScheme, // Backward-compatible processed system theme
    appearanceColorScheme,
    effectiveSystemScheme, // The one actually being used
    // Material design theme for React Native Paper
    paperTheme: theme.materialTheme,
  }), [appearanceColorScheme, effectiveSystemScheme, isDark, isLoading, setThemeMode, systemColorScheme, theme, themeMode]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * Hook to access theme context
 * @returns {Object} Theme context value
 */
export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

export default ThemeContext;

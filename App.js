import 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { PaperProvider } from 'react-native-paper';
import { DrivingProvider } from './src/contexts/DrivingContext';
import { DataSecurityProvider, useDataSecurity } from './src/contexts/DataSecurityContext';
import { ApkUpdateProvider } from './src/contexts/ApkUpdateContext';
import { ThemeProvider, preloadThemePreference, useTheme } from './src/contexts/ThemeContext';
import AppNavigator from './src/navigation/AppNavigator';
import DataSecurityGate from './src/screens/DataSecurityGate';
import RecoveryKeyModal from './src/components/RecoveryKeyModal';
import { initializeLogger, logger, logError, scheduleLogCleanup } from './src/utils/logger';
import { configureDriveNotifications } from './src/services/driveDetection';
import { addDrivePipModeListener, isInDrivePictureInPictureMode } from './src/services/drivePip';
import { downloadOtaUpdateInBackground } from './src/services/otaUpdater';

// Theme can be preloaded before rendering. App data waits for the security gate.
preloadThemePreference().catch(() => undefined);

function AppContent() {
  const { theme, isDark, isLoading, paperTheme } = useTheme();
  const insets = useSafeAreaInsets();
  const [isInPictureInPictureMode, setIsInPictureInPictureMode] = useState(false);
  
  // Initialize logger when app starts
  useEffect(() => {
    const setupLogger = async () => {
      try {
        // Add timeout to prevent hanging
        let timeoutId;
        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('Logger setup timeout')), 2000);
        });

        try {
          await Promise.race([
            (async () => {
              await initializeLogger();
              await logger.info('App started successfully', 'APP_STARTUP');

              // Schedule automatic log cleanup
              await scheduleLogCleanup();
              await logger.info('Log cleanup scheduler initialized', 'APP_STARTUP');
              await configureDriveNotifications();
            })(),
            timeoutPromise
          ]);
        } finally {
          clearTimeout(timeoutId);
        }

        // Set up global error handler (only in development)
        if (__DEV__) {
          try {
            // Check if ErrorUtils is available
            if (typeof global.ErrorUtils !== 'undefined' && global.ErrorUtils.setGlobalHandler) {
              const originalHandler = global.ErrorUtils.getGlobalHandler();
              global.ErrorUtils.setGlobalHandler(async (error, isFatal) => {
                try {
                  await logError(error, 'GLOBAL_ERROR', { isFatal });
                } catch (logErr) {
                  console.error('Failed to log error:', logErr);
                }
                
                // Call original handler
                if (originalHandler) {
                  originalHandler(error, isFatal);
                }
              });
            }
          } catch (errorUtilsError) {
            console.warn('Failed to set up global error handler:', errorUtilsError);
          }
        }
        
      } catch (error) {
        console.error('Failed to initialize app logger:', error);
        // Continue app startup even if logging fails
      }
    };

    setupLogger();
    downloadOtaUpdateInBackground().catch((error) => {
      logError(error, 'OTA_UPDATER', {
        context: 'Background OTA update failed',
        diagnostics: error?.diagnostics || null,
      });
    });
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;

    isInDrivePictureInPictureMode().then(setIsInPictureInPictureMode);
    const subscription = addDrivePipModeListener((event) => {
      setIsInPictureInPictureMode(!!event?.isInPictureInPictureMode);
    });

    return () => subscription.remove();
  }, []);
  
  // Don't render until theme is loaded to prevent theme flashing
  if (isLoading) {
    return null;
  }

  return (
    <PaperProvider theme={paperTheme}>
      <DrivingProvider>
        <ApkUpdateProvider>
          <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <StatusBar style={isDark ? 'light' : 'dark'} hidden={isInPictureInPictureMode} />
            {__DEV__ && !isInPictureInPictureMode && (
              <View style={[styles.developmentBanner, { height: insets.top + 24, paddingTop: insets.top }]}>
                <Text style={styles.developmentBannerText}>Development Build</Text>
              </View>
            )}
            <View style={[styles.content, __DEV__ && !isInPictureInPictureMode && styles.developmentContent]}>
              <AppNavigator />
            </View>
          </View>
        </ApkUpdateProvider>
      </DrivingProvider>
    </PaperProvider>
  );
}

function SecuredAppContent() {
  const { metadata, unlocked } = useDataSecurity();
  if (!metadata || !unlocked) return <DataSecurityGate />;
  return <><AppContent /><RecoveryKeyModal /></>;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <DataSecurityProvider>
          <SecuredAppContent />
        </DataSecurityProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  developmentContent: {
    paddingTop: 24,
  },
  developmentBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#5B4324',
  },
  developmentBannerText: {
    color: '#FFF7E8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});

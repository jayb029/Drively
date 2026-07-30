import 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { PaperProvider } from 'react-native-paper';
import { DrivingProvider } from './src/contexts/DrivingContext';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
import AppNavigator from './src/navigation/AppNavigator';
import { initializeLogger, logger, logError, scheduleLogCleanup } from './src/utils/logger';
import { configureDriveNotifications } from './src/services/driveDetection';
import { addDrivePipModeListener, isInDrivePictureInPictureMode } from './src/services/drivePip';

function AppContent() {
  const { theme, isDark, isLoading, paperTheme } = useTheme();
  const insets = useSafeAreaInsets();
  const [isInPictureInPictureMode, setIsInPictureInPictureMode] = useState(false);
  
  // Initialize logger when app starts
  useEffect(() => {
    const setupLogger = async () => {
      try {
        // Add timeout to prevent hanging
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Logger setup timeout')), 2000)
        );

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
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;

    isInDrivePictureInPictureMode().then(setIsInPictureInPictureMode);
    const subscription = addDrivePipModeListener((event) => {
      setIsInPictureInPictureMode(!!event?.isInPictureInPictureMode);
    });

    return () => subscription.remove();
  }, []);
  
  const topPaddingColor = theme.colors.background;
  const bottomPaddingColor = theme.colors.surface;

  // Don't render until theme is loaded to prevent theme flashing
  if (isLoading) {
    return null;
  }

  return (
    <PaperProvider theme={paperTheme}>
      <DrivingProvider>
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
          {/* Top padding */}
          <View style={[styles.topPadding, { backgroundColor: topPaddingColor, height: isInPictureInPictureMode ? 0 : insets.top }]} />
          
          <StatusBar style={isDark ? 'light' : 'dark'} hidden={isInPictureInPictureMode} />
          
          <View style={styles.content}>
            <AppNavigator />
          </View>
          
          {/* Bottom padding */}
          <View style={[styles.bottomPadding, { backgroundColor: bottomPaddingColor, height: isInPictureInPictureMode ? 0 : insets.bottom }]} />
        </View>
      </DrivingProvider>
    </PaperProvider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppContent />
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
  topPadding: {
    width: '100%',
  },
  bottomPadding: {
    width: '100%',
  },
});

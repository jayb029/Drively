import * as Application from 'expo-application';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Platform } from 'react-native';
import { evaluateApkRelease, fetchLatestApkRelease } from '../services/apkUpdater';
import { logError, logUserAction } from '../utils/logger';
import { useDriving } from './DrivingContext';

const ApkUpdateContext = createContext(null);

function getInstalledApk() {
  return {
    version: Application.nativeApplicationVersion || 'Unknown',
    versionCode: Application.nativeBuildVersion || null,
  };
}

export function ApkUpdateProvider({ children }) {
  const { loading, user } = useDriving();
  const installed = useMemo(getInstalledApk, []);
  const [state, setState] = useState({ status: 'idle', release: null, message: null });

  const openReleaseDownload = useCallback(async (release) => {
    if (!release?.downloadUrl) return false;

    try {
      await logUserAction('download_apk_update', 'UPDATES', {
        installedBuild: installed.versionCode,
        releaseBuild: release.versionCode,
        releaseVersion: release.version,
      });
      await Linking.openURL(release.downloadUrl);
      return true;
    } catch (error) {
      await logError(error, 'APK_UPDATER', 'Failed to open APK download');
      Alert.alert('Could not open download', 'Open About and updates and try again when you have an internet connection.');
      return false;
    }
  }, [installed.versionCode]);

  const showInstallGuide = useCallback((release) => {
    Alert.alert(
      'Before you update',
      '1. In Settings, open Data and backups.\n2. Export a full JSON backup and save it somewhere safe.\n3. Download and open the APK.\n4. If Android asks, allow installs from your browser, then tap Update.\n\nYour existing Drively data should remain in place, but a fresh backup is strongly recommended.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Download APK', onPress: () => openReleaseDownload(release) },
      ]
    );
  }, [openReleaseDownload]);

  const showUpdatePrompt = useCallback((release) => {
    const changelog = release.changes.length
      ? release.changes.map((change) => `• ${change}`).join('\n')
      : '• General improvements and fixes';

    Alert.alert(
      `Drively v${release.version} is available`,
      `What's changed:\n${changelog}`,
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Update', onPress: () => showInstallGuide(release) },
      ]
    );
  }, [showInstallGuide]);

  const checkForApkUpdate = useCallback(async ({ automatic = false } = {}) => {
    if (Platform.OS !== 'android') {
      const nextState = { status: 'unsupported', release: null, message: 'APK updates are only available on Android.' };
      setState(nextState);
      return nextState;
    }

    setState((current) => ({ ...current, status: 'checking', message: null }));

    try {
      const release = await fetchLatestApkRelease();
      const evaluation = evaluateApkRelease(release, installed);
      const nextState = {
        status: evaluation.isAvailable ? 'available' : 'current',
        release,
        message: evaluation.isAvailable
          ? `Drively v${release.version} (build ${release.versionCode}) is ready.`
          : `This APK is current (build ${evaluation.installedVersionCode}).`,
      };
      setState(nextState);

      if (automatic && evaluation.isAvailable) {
        showUpdatePrompt(release);
      }

      return nextState;
    } catch (error) {
      const nextState = {
        status: 'error',
        release: null,
        message: error?.message || 'Could not check for an APK update.',
      };
      setState(nextState);
      await logError(error, 'APK_UPDATER', 'APK update check failed');
      return nextState;
    }
  }, [installed, showUpdatePrompt]);

  useEffect(() => {
    if (__DEV__ || Platform.OS !== 'android' || loading || !user.onboardingComplete) return undefined;

    checkForApkUpdate({ automatic: true })
      .catch((error) => logError(error, 'APK_UPDATER', 'Automatic APK update check failed'));
    return undefined;
  }, [checkForApkUpdate, loading, user.onboardingComplete]);

  const downloadAvailableRelease = useCallback(
    () => openReleaseDownload(state.release),
    [openReleaseDownload, state.release]
  );

  const value = useMemo(() => ({
    ...state,
    checkForApkUpdate,
    installed,
    openReleaseDownload: downloadAvailableRelease,
    startUpdate: () => showInstallGuide(state.release),
  }), [checkForApkUpdate, downloadAvailableRelease, installed, showInstallGuide, state]);

  return <ApkUpdateContext.Provider value={value}>{children}</ApkUpdateContext.Provider>;
}

export function useApkUpdate() {
  const value = useContext(ApkUpdateContext);
  if (!value) throw new Error('useApkUpdate must be used inside ApkUpdateProvider');
  return value;
}

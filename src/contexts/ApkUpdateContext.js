import * as Application from 'expo-application';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Platform } from 'react-native';
import { evaluateApkRelease, fetchLatestApkRelease } from '../services/apkUpdater';
import { saveFullJsonBackup, shareFullJsonBackup } from '../services/jsonBackup';
import ReauthenticationModal from '../components/ReauthenticationModal';
import { logError, logUserAction } from '../utils/logger';
import { useDataSecurity } from './DataSecurityContext';
import { useDriving } from './DrivingContext';

const ApkUpdateContext = createContext(null);

function getInstalledApk() {
  return {
    version: Application.nativeApplicationVersion || 'Unknown',
    versionCode: Application.nativeBuildVersion || null,
  };
}

export function ApkUpdateProvider({ children }) {
  const { loading, settings, updateSettings, user } = useDriving();
  const security = useDataSecurity();
  const installed = useMemo(getInstalledApk, []);
  const [state, setState] = useState({ status: 'idle', release: null, message: null });
  const [backupRelease, setBackupRelease] = useState(null);
  const [isPreparingUpdate, setIsPreparingUpdate] = useState(false);

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

  const backupThenDownload = useCallback(async (release, destination) => {
    if (!release || isPreparingUpdate) return false;
    setIsPreparingUpdate(true);
    try {
      if (destination === 'save') {
        const backup = await saveFullJsonBackup(settings.exportDirectoryUri);
        if (backup.directoryUri !== settings.exportDirectoryUri) {
          await updateSettings({
            exportDirectoryUri: backup.directoryUri,
            storagePermissionStatus: 'granted',
          });
        }
      } else {
        await shareFullJsonBackup();
      }
      await logUserAction('backup_before_apk_update', 'UPDATES', {
        destination,
        releaseBuild: release.versionCode,
        releaseVersion: release.version,
      });
      return await openReleaseDownload(release);
    } catch (error) {
      await logError(error, 'APK_UPDATER', 'Failed to back up before APK update');
      Alert.alert(
        'Backup not completed',
        'Drively did not open the update because the backup could not be created. Try again, or choose Don’t back up.'
      );
      return false;
    } finally {
      setIsPreparingUpdate(false);
    }
  }, [isPreparingUpdate, openReleaseDownload, settings.exportDirectoryUri, updateSettings]);

  const chooseBackupDestination = useCallback((release) => {
    Alert.alert(
      'Save your backup',
      'Choose a folder on this device, or share the complete JSON backup with another app or service you trust.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Share', onPress: () => backupThenDownload(release, 'share') },
        { text: 'Save to folder', onPress: () => backupThenDownload(release, 'save') },
      ]
    );
  }, [backupThenDownload]);

  const beginBackup = useCallback((release) => {
    if (security.metadata?.enabled) {
      setBackupRelease(release);
      return;
    }
    chooseBackupDestination(release);
  }, [chooseBackupDestination, security.metadata?.enabled]);

  const showInstallGuide = useCallback((release) => {
    if (!release || isPreparingUpdate) return;
    Alert.alert(
      'Back up before updating?',
      'Updating should keep your Drively data. A fresh backup is still recommended in case Android cannot complete the update.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Don’t back up', onPress: () => openReleaseDownload(release) },
        { text: 'Back up', onPress: () => beginBackup(release) },
      ]
    );
  }, [beginBackup, isPreparingUpdate, openReleaseDownload]);

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
    isPreparingUpdate,
    openReleaseDownload: downloadAvailableRelease,
    startUpdate: () => showInstallGuide(state.release),
  }), [checkForApkUpdate, downloadAvailableRelease, installed, isPreparingUpdate, showInstallGuide, state]);

  return (
    <ApkUpdateContext.Provider value={value}>
      {children}
      <ReauthenticationModal
        body="Confirm your identity before Drively creates the full plaintext backup and continues to the APK update."
        onCancel={() => setBackupRelease(null)}
        onSuccess={() => {
          const release = backupRelease;
          setBackupRelease(null);
          chooseBackupDestination(release);
        }}
        title="Unlock to back up and update"
        visible={!!backupRelease}
      />
    </ApkUpdateContext.Provider>
  );
}

export function useApkUpdate() {
  const value = useContext(ApkUpdateContext);
  if (!value) throw new Error('useApkUpdate must be used inside ApkUpdateProvider');
  return value;
}

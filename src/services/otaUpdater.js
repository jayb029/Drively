import * as Updates from 'expo-updates';

function getOtaDiagnostics() {
  return {
    channel: Updates.channel || null,
    runtimeVersion: Updates.runtimeVersion || null,
    updateId: Updates.updateId || null,
    isEmbeddedLaunch: Updates.isEmbeddedLaunch,
    isEnabled: Updates.isEnabled,
  };
}

export async function downloadOtaUpdateInBackground() {
  if (__DEV__ || !Updates.isEnabled) return { downloaded: false };

  // GitHub Action / local Gradle builds must bake expo-channel-name into native config.
  // Without a channel, EAS Update rejects the check with a generic failure.
  if (!Updates.channel) {
    const error = new Error(
      'OTA updates are not configured with a channel. Rebuild the production APK so expo-channel-name is embedded.'
    );
    error.diagnostics = getOtaDiagnostics();
    throw error;
  }

  try {
    const update = await Updates.checkForUpdateAsync();
    if (!update.isAvailable && !update.isRollBackToEmbedded) return { downloaded: false };

    const result = await Updates.fetchUpdateAsync();
    return {
      downloaded: !!(result.isNew || result.isRollBackToEmbedded),
    };
  } catch (error) {
    if (error && typeof error === 'object') {
      error.diagnostics = getOtaDiagnostics();
    }
    throw error;
  }
}

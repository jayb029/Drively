import * as Updates from 'expo-updates';

export async function downloadOtaUpdateInBackground() {
  if (__DEV__ || !Updates.isEnabled) return { downloaded: false };

  const update = await Updates.checkForUpdateAsync();
  if (!update.isAvailable && !update.isRollBackToEmbedded) return { downloaded: false };

  const result = await Updates.fetchUpdateAsync();
  return {
    downloaded: !!(result.isNew || result.isRollBackToEmbedded),
  };
}

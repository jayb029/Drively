import { Platform, PermissionsAndroid } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Notifications from 'expo-notifications';

const ANDROID_STORAGE_PERMISSIONS = [
  PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
  PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
].filter(Boolean);

export async function requestNotificationPermission() {
  try {
    const result = await Notifications.requestPermissionsAsync();
    return result.status;
  } catch (error) {
    console.log('Notification permission error:', error);
    return 'error';
  }
}

export async function requestStoragePermission({ requestDirectory = false } = {}) {
  if (Platform.OS !== 'android') {
    return {
      status: 'not_required',
      directoryUri: null,
    };
  }

  let runtimeStatus = 'not_requested';

  try {
    if (ANDROID_STORAGE_PERMISSIONS.length > 0) {
      const results = await PermissionsAndroid.requestMultiple(ANDROID_STORAGE_PERMISSIONS);
      const statuses = Object.values(results);
      runtimeStatus = statuses.every((status) => status === PermissionsAndroid.RESULTS.GRANTED)
        ? 'granted'
        : statuses.some((status) => status === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN)
          ? 'never_ask_again'
          : 'denied';
    }
  } catch (error) {
    console.log('Android storage runtime permission error:', error);
    runtimeStatus = 'error';
  }

  if (!requestDirectory) {
    return {
      status: runtimeStatus,
      runtimeStatus,
      directoryUri: null,
    };
  }

  try {
    const directoryPermission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    return {
      status: directoryPermission.granted ? 'granted' : runtimeStatus,
      runtimeStatus,
      directoryUri: directoryPermission.granted ? directoryPermission.directoryUri : null,
    };
  } catch (error) {
    console.log('Android directory permission error:', error);
    return {
      status: runtimeStatus,
      runtimeStatus,
      directoryUri: null,
    };
  }
}

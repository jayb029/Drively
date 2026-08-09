import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { exportDataAsJSON } from '../utils/storage';

export function getJsonBackupFileName(date = new Date()) {
  return `drively_backup_${date.toISOString().split('T')[0]}.json`;
}

async function createFullJsonBackup() {
  const jsonData = await exportDataAsJSON();
  if (!jsonData) throw new Error('Failed to generate JSON data');
  const fileName = getJsonBackupFileName();
  const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(fileUri, jsonData);

  return { fileName, fileUri, jsonData };
}

export async function shareFullJsonBackup() {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }

  const backup = await createFullJsonBackup();
  await Sharing.shareAsync(backup.fileUri, {
    mimeType: 'application/json',
    dialogTitle: 'Save Drively backup',
  });

  return backup;
}

export async function saveFullJsonBackup(directoryUri = null) {
  let destination = directoryUri;
  if (!destination) {
    const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!permission.granted) throw new Error('No backup folder was selected.');
    destination = permission.directoryUri;
  }

  const backup = await createFullJsonBackup();
  const savedUri = await FileSystem.StorageAccessFramework.createFileAsync(
    destination,
    backup.fileName,
    'application/json'
  );
  await FileSystem.writeAsStringAsync(savedUri, backup.jsonData, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  return { ...backup, directoryUri: destination, savedUri };
}

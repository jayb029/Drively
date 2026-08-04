import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { getAppVersion } from './appInfo';
import { getDistanceUnitLabel, getSpeedUnitLabel } from './units';
import {
  getDriveDayMinutes,
  getDriveNightMinutes,
  getNightCalculationLabel,
  normalizeDriveNightFields,
  sumDriveMinutes,
} from './nightDriving';

const DATA_ROOT_DIR = `${FileSystem.documentDirectory}drively/`;
const LOCAL_DATA_DIR = `${DATA_ROOT_DIR}local/`;
const CLOUD_DATA_DIR = `${DATA_ROOT_DIR}cloud/`;
const LEGACY_MAIN_DATA_FILE = `${DATA_ROOT_DIR}data.json`;
const LEGACY_BACKUP_DATA_FILE = `${DATA_ROOT_DIR}backup.json`;
const CLOUD_BACKUP_PREFERENCE_KEY = 'drively.cloudBackupEnabled.v1';
const WEB_DATA_KEY = 'drively.data.v1';
let saveQueue = Promise.resolve();
let activeCloudBackup = null;

function getDataPaths(cloudBackupEnabled) {
  const directory = cloudBackupEnabled ? CLOUD_DATA_DIR : LOCAL_DATA_DIR;
  return {
    directory,
    mainFile: `${directory}data.json`,
    backupFile: `${directory}backup.json`,
  };
}

function isDefaultUserValue(key, value) {
  return DEFAULT_DATA.user[key] === value || value === undefined || value === null || value === '';
}

function dedupeByIdentity(items, identityBuilder) {
  if (!Array.isArray(items)) return [];

  const seen = new Map();
  items.forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const key = item.id || identityBuilder(item);
    if (!key) return;

    const current = seen.get(key);
    if (!current) {
      seen.set(key, item);
      return;
    }

    const currentUpdated = Date.parse(current.updatedAt || current.createdAt || current.date || 0) || 0;
    const itemUpdated = Date.parse(item.updatedAt || item.createdAt || item.date || 0) || 0;
    seen.set(key, itemUpdated >= currentUpdated ? { ...current, ...item } : { ...item, ...current });
  });

  return Array.from(seen.values());
}

function recalculateUserProgress(user, drives) {
  const totals = sumDriveMinutes(drives);

  return {
    ...user,
    completedDayHours: totals.dayMinutes / 60,
    completedNightHours: totals.nightMinutes / 60,
  };
}

/**
 * Default data structure for a new user
 */
const DEFAULT_DATA = {
  user: {
    licenseType: null,
    licenseDate: null,
    driverName: '',
    dateOfBirth: '',
    permitNumber: '',
    goalDayHours: 50,
    goalNightHours: 10,
    completedDayHours: 0,
    completedNightHours: 0,
    onboardingComplete: false,
  },
  supervisorProfiles: [],
  drives: [],
  detectedEvents: [],
  streaks: {
    current: 0,
    longest: 0,
    lastDriveDate: null,
    freezeDaysUsed: 0,
    freezeDaysThisMonth: 0,
  },
  settings: {
    nightDrivingMethod: 'civil_twilight',
    nightTimeStart: '18:00',
    nightTimeEnd: '06:00',
    backupReminder: true,
    cloudBackupEnabled: false,
    lastBackupDate: null,
    temperatureUnit: 'metric',
    weatherEnabled: true,
    distanceUnit: 'metric',
    censorSensitiveInfo: true,
    alwaysOnWhileTracking: true,
    driveDetectionEnabled: false,
    driveDetectionSensitivity: 'balanced',
    notificationPermissionStatus: null,
    backgroundLocationStatus: null,
    storagePermissionStatus: null,
    exportDirectoryUri: null,
  },
  version: getAppVersion(),
};

export function migrateData(data) {
  const drives = dedupeByIdentity(data.drives, (drive) => [
    drive.date,
    drive.startTime,
    drive.endTime,
    drive.duration,
    drive.destination,
  ].filter(Boolean).join('|')).map(normalizeDriveNightFields);
  const supervisorProfiles = dedupeByIdentity(data.supervisorProfiles, (profile) => [
    profile.name,
    profile.dateOfBirth || profile.birthDate || profile.dob,
    profile.licenseNumber,
  ].filter(Boolean).join('|'));
  const detectedEvents = dedupeByIdentity(data.detectedEvents, (event) => [
    event.startedAt,
    event.endedAt,
    event.startTime,
    event.endTime,
  ].filter(Boolean).join('|'));

  const merged = {
    ...DEFAULT_DATA,
    ...data,
    user: recalculateUserProgress({
      ...DEFAULT_DATA.user,
      ...(data.user || {}),
    }, drives),
    supervisorProfiles,
    drives,
    detectedEvents,
    streaks: {
      ...DEFAULT_DATA.streaks,
      ...(data.streaks || {}),
    },
    settings: {
      ...DEFAULT_DATA.settings,
      ...(data.settings || {}),
    },
    version: getAppVersion(),
  };

  return merged;
}

function hasMeaningfulData(data) {
  return !!(
    data?.drives?.length ||
    data?.supervisorProfiles?.length ||
    data?.detectedEvents?.length ||
    data?.user?.onboardingComplete ||
    !isDefaultUserValue('driverName', data?.user?.driverName) ||
    !isDefaultUserValue('dateOfBirth', data?.user?.dateOfBirth) ||
    !isDefaultUserValue('permitNumber', data?.user?.permitNumber)
  );
}

function pickRestoredData(primaryData, backupData) {
  if (!backupData) return primaryData;
  if (!hasMeaningfulData(primaryData) && hasMeaningfulData(backupData)) return backupData;
  return primaryData;
}

/**
 * Ensure the data directory exists
 */
async function ensureDirectoryExists(directory) {
  const dirInfo = await FileSystem.getInfoAsync(directory);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  }
}

async function fileExists(uri) {
  return (await FileSystem.getInfoAsync(uri)).exists;
}

async function deleteIfExists(uri) {
  if (await fileExists(uri)) {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  }
}

async function copyIfPresent(from, to) {
  if (!(await fileExists(from)) || await fileExists(to)) return;
  await FileSystem.copyAsync({ from, to });
}

async function migrateLegacyStorageToLocal() {
  const localPaths = getDataPaths(false);
  await ensureDirectoryExists(localPaths.directory);
  await copyIfPresent(LEGACY_MAIN_DATA_FILE, localPaths.mainFile);
  await copyIfPresent(LEGACY_BACKUP_DATA_FILE, localPaths.backupFile);
  await deleteIfExists(LEGACY_MAIN_DATA_FILE);
  await deleteIfExists(LEGACY_BACKUP_DATA_FILE);
}

async function getCloudBackupPreference() {
  if (Platform.OS === 'web') return false;
  if (activeCloudBackup !== null) return activeCloudBackup;

  const storedPreference = await AsyncStorage.getItem(CLOUD_BACKUP_PREFERENCE_KEY);
  if (storedPreference === 'true' || storedPreference === 'false') {
    activeCloudBackup = storedPreference === 'true';
    return activeCloudBackup;
  }

  const cloudPaths = getDataPaths(true);
  const localPaths = getDataPaths(false);
  const restoredCloudDataExists = await fileExists(cloudPaths.mainFile)
    && !(await fileExists(localPaths.mainFile))
    && !(await fileExists(LEGACY_MAIN_DATA_FILE));

  activeCloudBackup = restoredCloudDataExists;
  await AsyncStorage.setItem(CLOUD_BACKUP_PREFERENCE_KEY, String(activeCloudBackup));
  return activeCloudBackup;
}

async function writeDataPair(data, cloudBackupEnabled) {
  const paths = getDataPaths(cloudBackupEnabled);
  await ensureDirectoryExists(paths.directory);
  const serializedData = JSON.stringify(migrateData({
    ...data,
    settings: {
      ...(data.settings || {}),
      cloudBackupEnabled,
    },
  }));
  await FileSystem.writeAsStringAsync(paths.mainFile, serializedData);
  await FileSystem.writeAsStringAsync(paths.backupFile, serializedData);
}

export async function setCloudBackupEnabled(data, enabled) {
  if (Platform.OS === 'web') return false;

  try {
    const nextEnabled = enabled === true;
    await writeDataPair(data, nextEnabled);

    const previousPaths = getDataPaths(!nextEnabled);
    await deleteIfExists(previousPaths.directory);
    await deleteIfExists(LEGACY_MAIN_DATA_FILE);
    await deleteIfExists(LEGACY_BACKUP_DATA_FILE);
    await AsyncStorage.setItem(CLOUD_BACKUP_PREFERENCE_KEY, String(nextEnabled));
    activeCloudBackup = nextEnabled;
    return true;
  } catch (error) {
    console.error('Failed to change Android cloud backup setting:', error);
    return false;
  }
}

/**
 * Load data from the main file, fallback to backup if corrupted
 */
export async function loadData() {
  if (Platform.OS === 'web') {
    try {
      const dataString = await AsyncStorage.getItem(WEB_DATA_KEY);
      if (!dataString) {
        await saveData(DEFAULT_DATA);
        return migrateData(DEFAULT_DATA);
      }

      const data = JSON.parse(dataString);
      if (!data.user || !data.drives || !data.streaks || !data.settings) {
        throw new Error('Invalid data structure');
      }

      return migrateData(data);
    } catch (error) {
      console.warn('Web data unavailable, using defaults:', error);
      await saveData(DEFAULT_DATA);
      return migrateData(DEFAULT_DATA);
    }
  }

  try {
    const cloudBackupEnabled = await getCloudBackupPreference();
    if (!cloudBackupEnabled) {
      await migrateLegacyStorageToLocal();
    }
    const { directory, mainFile, backupFile } = getDataPaths(cloudBackupEnabled);
    await ensureDirectoryExists(directory);
    
    const mainFileInfo = await FileSystem.getInfoAsync(mainFile);
    if (!mainFileInfo.exists) {
      // First time user, create default data
      await saveData(DEFAULT_DATA);
      return DEFAULT_DATA;
    }

    const dataString = await FileSystem.readAsStringAsync(mainFile);
    const data = JSON.parse(dataString);
    
    // Validate the data structure
    if (!data.user || !data.drives || !data.streaks || !data.settings) {
      throw new Error('Invalid data structure');
    }
    
    let restoredData = data;
    if (!hasMeaningfulData(data)) {
      try {
        const backupFileInfo = await FileSystem.getInfoAsync(backupFile);
        if (backupFileInfo.exists) {
          const backupString = await FileSystem.readAsStringAsync(backupFile);
          restoredData = pickRestoredData(data, JSON.parse(backupString));
        }
      } catch (backupError) {
        console.warn('Backup data unavailable during restore check:', backupError);
      }
    }

    return migrateData(restoredData);
  } catch (error) {
    console.warn('Main data file corrupted, trying backup:', error);
    
    try {
      const cloudBackupEnabled = await getCloudBackupPreference();
      const { backupFile } = getDataPaths(cloudBackupEnabled);
      const backupFileInfo = await FileSystem.getInfoAsync(backupFile);
      if (backupFileInfo.exists) {
        const backupString = await FileSystem.readAsStringAsync(backupFile);
        const backupData = JSON.parse(backupString);
        
        // Restore from backup
        const migratedBackup = migrateData(backupData);
        await saveData(migratedBackup);
        return migratedBackup;
      }
    } catch (backupError) {
      console.warn('Backup file also corrupted:', backupError);
    }
    
    // Last resort: return default data
    await saveData(DEFAULT_DATA);
    return DEFAULT_DATA;
  }
}

/**
 * Save data to main file and create backup
 */
async function persistData(data) {
  if (Platform.OS === 'web') {
    try {
      await AsyncStorage.setItem(WEB_DATA_KEY, JSON.stringify(migrateData(data)));
      return true;
    } catch (error) {
      console.error('Failed to save web data:', error);
      return false;
    }
  }

  try {
    const cloudBackupEnabled = await getCloudBackupPreference();
    const { directory, mainFile, backupFile } = getDataPaths(cloudBackupEnabled);
    await ensureDirectoryExists(directory);
    const normalizedData = migrateData({
      ...data,
      settings: {
        ...(data.settings || {}),
        cloudBackupEnabled,
      },
    });
    
    // Create backup of current data before overwriting
    const mainFileInfo = await FileSystem.getInfoAsync(mainFile);
    if (mainFileInfo.exists) {
      await FileSystem.copyAsync({
        from: mainFile,
        to: backupFile,
      });
    }
    
    // Save new data
    const dataString = JSON.stringify(normalizedData);
    await FileSystem.writeAsStringAsync(mainFile, dataString);
    
    return true;
  } catch (error) {
    console.error('Failed to save data:', error);
    return false;
  }
}

export function saveData(data) {
  saveQueue = saveQueue
    .catch(() => undefined)
    .then(() => persistData(data));
  return saveQueue;
}

/**
 * Export data as JSON string
 */
export async function exportDataAsJSON() {
  try {
    const data = await loadData();
    return JSON.stringify(data, null, 2);
  } catch (error) {
    console.error('Failed to export data as JSON:', error);
    return null;
  }
}

/**
 * Parse and validate data from a Drively JSON backup string.
 */
export async function importDataFromJSON(jsonString) {
  try {
    const data = JSON.parse(jsonString);

    const isPlainObject = (value) => (
      value !== null && typeof value === 'object' && !Array.isArray(value)
    );
    const numericStreakFields = ['current', 'longest', 'freezeDaysUsed', 'freezeDaysThisMonth'];
    const hasValidStreakValues = numericStreakFields.every((field) => (
      data.streaks?.[field] === undefined
      || (typeof data.streaks[field] === 'number'
        && Number.isFinite(data.streaks[field])
        && data.streaks[field] >= 0)
    ));

    if (
      !isPlainObject(data.user)
      || !Array.isArray(data.drives)
      || !isPlainObject(data.streaks)
      || !isPlainObject(data.settings)
      || !hasValidStreakValues
    ) {
      throw new Error('Invalid backup format');
    }

    return migrateData(data);
  } catch (error) {
    console.error('Failed to import data from JSON:', error);
    return null;
  }
}

/**
 * Export drives data as CSV string
 */
export async function exportDrivesAsCSV() {
  try {
    const data = await loadData();
    const drives = data.drives;
    const distanceUnit = data.settings?.distanceUnit || 'metric';
    const distanceMultiplier = distanceUnit === 'imperial' ? 0.621371 : 1;
    
    if (drives.length === 0) {
      return 'No drives to export';
    }
    
    // CSV header
    const headers = [
      'Date',
      'Start Time',
      'End Time', 
      'Duration (minutes)',
      'Day Minutes',
      'Night Minutes',
      'Night Calculation',
      'Manually Adjusted',
      'Weather',
      'Skills Practiced',
      'Supervisor Name',
      'Supervisor Date of Birth',
      'Supervisor Age',
      'Supervisor License',
      'Destination',
      `Distance (${getDistanceUnitLabel(distanceUnit)})`,
      `Average Speed (${getSpeedUnitLabel(distanceUnit)})`,
      'Segments',
      'Detection Source'
    ];
    
    // CSV rows
    const rows = drives.map(drive => [
      drive.date,
      drive.startTime,
      drive.endTime,
      drive.duration,
      getDriveDayMinutes(drive),
      getDriveNightMinutes(drive),
      getNightCalculationLabel(drive.nightCalculation),
      drive.nightCalculation?.manuallyAdjusted ? 'Yes' : 'No',
      drive.weather || '',
      drive.skills || '',
      drive.supervisorName || '',
      drive.supervisorDateOfBirth || '',
      drive.supervisorAge || '',
      drive.supervisorLicense || '',
      drive.destination || '',
      drive.routeSummary?.distanceKm ? Number((drive.routeSummary.distanceKm * distanceMultiplier).toFixed(2)) : '',
      drive.routeSummary?.averageSpeedKmh ? Math.round(drive.routeSummary.averageSpeedKmh * distanceMultiplier) : '',
      Array.isArray(drive.segments) && drive.segments.length > 1 ? drive.segments.length : 1,
      drive.source || 'manual'
    ]);
    
    const escapeCSVField = (field) => {
      const stringValue = String(field ?? '');
      const formulaSafeValue = /^[=+\-@\t\r]/.test(stringValue)
        ? `'${stringValue}`
        : stringValue;
      return `"${formulaSafeValue.replace(/"/g, '""')}"`;
    };

    // Combine headers and rows
    const csvContent = [headers, ...rows]
      .map(row => row.map(escapeCSVField).join(','))
      .join('\n');
    
    return csvContent;
  } catch (error) {
    console.error('Failed to export drives as CSV:', error);
    return null;
  }
}

/**
 * Clear all data (for testing or reset)
 */
export async function clearAllData() {
  if (Platform.OS === 'web') {
    try {
      await AsyncStorage.removeItem(WEB_DATA_KEY);
      return true;
    } catch (error) {
      console.error('Failed to clear web data:', error);
      return false;
    }
  }

  try {
    await deleteIfExists(LOCAL_DATA_DIR);
    await deleteIfExists(CLOUD_DATA_DIR);
    await deleteIfExists(LEGACY_MAIN_DATA_FILE);
    await deleteIfExists(LEGACY_BACKUP_DATA_FILE);
    await AsyncStorage.removeItem(CLOUD_BACKUP_PREFERENCE_KEY);
    activeCloudBackup = null;
    
    return true;
  } catch (error) {
    console.error('Failed to clear data:', error);
    return false;
  }
}

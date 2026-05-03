import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { getAppVersion } from './appInfo';
import { getDistanceUnitLabel, getSpeedUnitLabel } from './units';

const DATA_DIR = `${FileSystem.documentDirectory}drively/`;
const MAIN_DATA_FILE = `${DATA_DIR}data.json`;
const BACKUP_DATA_FILE = `${DATA_DIR}backup.json`;
const WEB_DATA_KEY = 'drively.data.v1';

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
  const completedDayHours = drives
    .filter((drive) => !drive.isNightDrive)
    .reduce((sum, drive) => sum + ((Number(drive.duration) || 0) / 60), 0);
  const completedNightHours = drives
    .filter((drive) => drive.isNightDrive)
    .reduce((sum, drive) => sum + ((Number(drive.duration) || 0) / 60), 0);

  return {
    ...user,
    completedDayHours,
    completedNightHours,
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
    nightTimeStart: '18:00',
    nightTimeEnd: '06:00',
    backupReminder: true,
    lastBackupDate: null,
    temperatureUnit: 'metric',
    distanceUnit: 'metric',
    driveDetectionEnabled: false,
    driveDetectionSensitivity: 'balanced',
    notificationPermissionStatus: null,
    backgroundLocationStatus: null,
    storagePermissionStatus: null,
    exportDirectoryUri: null,
  },
  version: getAppVersion(),
};

function migrateData(data) {
  const drives = dedupeByIdentity(data.drives, (drive) => [
    drive.date,
    drive.startTime,
    drive.endTime,
    drive.duration,
    drive.destination,
  ].filter(Boolean).join('|'));
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
async function ensureDirectoryExists() {
  const dirInfo = await FileSystem.getInfoAsync(DATA_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(DATA_DIR, { intermediates: true });
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
    await ensureDirectoryExists();
    
    const mainFileInfo = await FileSystem.getInfoAsync(MAIN_DATA_FILE);
    if (!mainFileInfo.exists) {
      // First time user, create default data
      await saveData(DEFAULT_DATA);
      return DEFAULT_DATA;
    }

    const dataString = await FileSystem.readAsStringAsync(MAIN_DATA_FILE);
    const data = JSON.parse(dataString);
    
    // Validate the data structure
    if (!data.user || !data.drives || !data.streaks || !data.settings) {
      throw new Error('Invalid data structure');
    }
    
    let backupData = null;
    try {
      const backupFileInfo = await FileSystem.getInfoAsync(BACKUP_DATA_FILE);
      if (backupFileInfo.exists) {
        const backupString = await FileSystem.readAsStringAsync(BACKUP_DATA_FILE);
        backupData = JSON.parse(backupString);
      }
    } catch (backupError) {
      console.warn('Backup data unavailable during restore check:', backupError);
    }

    const migratedData = migrateData(pickRestoredData(data, backupData));
    await saveData(migratedData);
    return migratedData;
  } catch (error) {
    console.warn('Main data file corrupted, trying backup:', error);
    
    try {
      const backupFileInfo = await FileSystem.getInfoAsync(BACKUP_DATA_FILE);
      if (backupFileInfo.exists) {
        const backupString = await FileSystem.readAsStringAsync(BACKUP_DATA_FILE);
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
export async function saveData(data) {
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
    await ensureDirectoryExists();
    
    // Create backup of current data before overwriting
    const mainFileInfo = await FileSystem.getInfoAsync(MAIN_DATA_FILE);
    if (mainFileInfo.exists) {
      await FileSystem.copyAsync({
        from: MAIN_DATA_FILE,
        to: BACKUP_DATA_FILE,
      });
    }
    
    // Save new data
    const dataString = JSON.stringify(data, null, 2);
    await FileSystem.writeAsStringAsync(MAIN_DATA_FILE, dataString);
    
    return true;
  } catch (error) {
    console.error('Failed to save data:', error);
    return false;
  }
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

    if (!data.user || !data.drives || !data.streaks || !data.settings) {
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
      'Night Drive',
      'Weather',
      'Skills Practiced',
      'Supervisor Name',
      'Supervisor Date of Birth',
      'Supervisor Age',
      'Supervisor License',
      'Destination',
      `Distance (${getDistanceUnitLabel(distanceUnit)})`,
      `Average Speed (${getSpeedUnitLabel(distanceUnit)})`,
      'Detection Source'
    ];
    
    // CSV rows
    const rows = drives.map(drive => [
      drive.date,
      drive.startTime,
      drive.endTime,
      drive.duration,
      drive.isNightDrive ? 'Yes' : 'No',
      drive.weather || '',
      drive.skills || '',
      drive.supervisorName || '',
      drive.supervisorDateOfBirth || '',
      drive.supervisorAge || '',
      drive.supervisorLicense || '',
      drive.destination || '',
      drive.routeSummary?.distanceKm ? Number((drive.routeSummary.distanceKm * distanceMultiplier).toFixed(2)) : '',
      drive.routeSummary?.averageSpeedKmh ? Math.round(drive.routeSummary.averageSpeedKmh * distanceMultiplier) : '',
      drive.source || 'manual'
    ]);
    
    // Combine headers and rows
    const csvContent = [headers, ...rows]
      .map(row => row.map(field => `"${field}"`).join(','))
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
    await ensureDirectoryExists();
    
    const mainFileInfo = await FileSystem.getInfoAsync(MAIN_DATA_FILE);
    if (mainFileInfo.exists) {
      await FileSystem.deleteAsync(MAIN_DATA_FILE);
    }
    
    const backupFileInfo = await FileSystem.getInfoAsync(BACKUP_DATA_FILE);
    if (backupFileInfo.exists) {
      await FileSystem.deleteAsync(BACKUP_DATA_FILE);
    }
    
    return true;
  } catch (error) {
    console.error('Failed to clear data:', error);
    return false;
  }
}

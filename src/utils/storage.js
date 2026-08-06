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
let memoryDataCache = null;
let preloadPromise = null;

/**
 * Preload all app data into memory cache.
 */
export function preloadData() {
  if (memoryDataCache !== null) {
    return Promise.resolve(memoryDataCache);
  }
  if (!preloadPromise) {
    preloadPromise = loadData({ force: true }).catch((err) => {
      preloadPromise = null;
      throw err;
    });
  }
  return preloadPromise;
}

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
    largeBottomNavIcons: true,
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

/**
 * Rank datasets so a thin onboarded shell loses to a real export with drives.
 */
function dataRichnessScore(data) {
  if (!data) return -1;
  return (
    (Array.isArray(data.drives) ? data.drives.length : 0) * 1000 +
    (Array.isArray(data.supervisorProfiles) ? data.supervisorProfiles.length : 0) * 50 +
    (Array.isArray(data.detectedEvents) ? data.detectedEvents.length : 0) * 10 +
    (data.user?.onboardingComplete ? 5 : 0) +
    (!isDefaultUserValue('driverName', data?.user?.driverName) ? 1 : 0) +
    (!isDefaultUserValue('permitNumber', data?.user?.permitNumber) ? 1 : 0)
  );
}

function pickRestoredData(primaryData, backupData) {
  if (!primaryData) return backupData || null;
  if (!backupData) return primaryData;
  return dataRichnessScore(backupData) > dataRichnessScore(primaryData) ? backupData : primaryData;
}

function isValidDataShape(data) {
  return !!(data && data.user && data.drives && data.streaks && data.settings);
}

async function readJsonDataFile(uri) {
  try {
    if (!(await fileExists(uri))) return null;
    const raw = await FileSystem.readAsStringAsync(uri);
    const data = JSON.parse(raw);
    return isValidDataShape(data) ? data : null;
  } catch (error) {
    console.warn('Failed to read data file:', uri, error);
    return null;
  }
}

async function collectJsonFilesFromDirectory(directory, namePredicate) {
  try {
    if (!directory || !(await fileExists(directory))) return [];
    const names = await FileSystem.readDirectoryAsync(directory);
    return names
      .filter((name) => name.endsWith('.json') && (!namePredicate || namePredicate(name)))
      .map((name) => `${directory}${name}`);
  } catch (error) {
    console.warn('Failed to list directory for recovery:', directory, error);
    return [];
  }
}

/**
 * Scan main/backup across local, cloud, legacy, and export cache locations.
 * Prefers the richest valid dataset (most drives/profiles), not just "any onboarded shell".
 */
async function findBestAvailableData(preferredCloudBackup) {
  const preferred = getDataPaths(preferredCloudBackup);
  const alternate = getDataPaths(!preferredCloudBackup);
  const candidateUris = [
    preferred.mainFile,
    preferred.backupFile,
    alternate.mainFile,
    alternate.backupFile,
    LEGACY_MAIN_DATA_FILE,
    LEGACY_BACKUP_DATA_FILE,
  ];

  // Export/share flow writes JSON backups into the cache directory.
  if (FileSystem.cacheDirectory) {
    const cacheBackups = await collectJsonFilesFromDirectory(
      FileSystem.cacheDirectory,
      (name) => name.startsWith('drively_backup_') || name.startsWith('drively_export_')
    );
    const pickerBackups = await collectJsonFilesFromDirectory(
      `${FileSystem.cacheDirectory}DocumentPicker/`,
      () => true
    );
    candidateUris.push(...cacheBackups, ...pickerBackups);
  }

  let best = null;
  for (const uri of candidateUris) {
    const data = await readJsonDataFile(uri);
    if (!data) continue;
    best = pickRestoredData(best, data);
  }
  return best;
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
    memoryDataCache = migrateData({
      ...data,
      settings: {
        ...(data.settings || {}),
        cloudBackupEnabled: nextEnabled,
      },
    });
    return true;
  } catch (error) {
    console.error('Failed to change Android cloud backup setting:', error);
    return false;
  }
}

/**
 * Load data from memory cache if available, or from storage.
 * Never overwrites on-disk user data with empty defaults on read failure.
 */
export async function loadData(options = {}) {
  const force = options?.force === true;
  if (memoryDataCache !== null && !force) {
    return memoryDataCache;
  }

  let result;
  if (Platform.OS === 'web') {
    try {
      const dataString = await AsyncStorage.getItem(WEB_DATA_KEY);
      if (!dataString) {
        result = migrateData(DEFAULT_DATA);
      } else {
        const data = JSON.parse(dataString);
        if (!isValidDataShape(data)) {
          throw new Error('Invalid data structure');
        }
        result = migrateData(data);
      }
    } catch (error) {
      console.warn('Web data unavailable, using in-memory defaults (not wiping storage):', error);
      result = migrateData(DEFAULT_DATA);
    }
    memoryDataCache = result;
    return memoryDataCache;
  }

  try {
    const cloudBackupEnabled = await getCloudBackupPreference();
    if (!cloudBackupEnabled) {
      await migrateLegacyStorageToLocal();
    }

    const { directory, mainFile, backupFile } = getDataPaths(cloudBackupEnabled);
    await ensureDirectoryExists(directory);

    const mainData = await readJsonDataFile(mainFile);
    const backupData = await readJsonDataFile(backupFile);
    // Always scan all known locations so a thin onboarded shell cannot hide a richer export.
    const bestAvailable = await findBestAvailableData(cloudBackupEnabled);
    let restoredData = pickRestoredData(pickRestoredData(mainData, backupData), bestAvailable);

    if (!restoredData) {
      // True first launch — no files anywhere. Seed defaults without treating this as recovery.
      result = migrateData(DEFAULT_DATA);
      memoryDataCache = result;
      // Seed disk only when nothing exists yet so future loads have a file.
      await saveData(result, { allowEmpty: true });
      return memoryDataCache;
    }

    result = migrateData(restoredData);

    // Write back when we recovered a richer dataset than the active main file.
    if (dataRichnessScore(result) > dataRichnessScore(mainData)) {
      console.warn('Restored richer app data from backup/export storage location', {
        mainScore: dataRichnessScore(mainData),
        restoredScore: dataRichnessScore(result),
        drives: result.drives?.length || 0,
      });
      memoryDataCache = result;
      await saveData(result);
      return memoryDataCache;
    }
  } catch (error) {
    console.warn('Failed to load app data, trying full storage scan:', error);

    try {
      const cloudBackupEnabled = await getCloudBackupPreference();
      const recovered = await findBestAvailableData(cloudBackupEnabled);
      if (recovered) {
        result = migrateData(recovered);
        memoryDataCache = result;
        if (hasMeaningfulData(result)) {
          await saveData(result);
        }
        return memoryDataCache;
      }
    } catch (recoveryError) {
      console.warn('Full storage scan also failed:', recoveryError);
    }

    // Last resort: in-memory defaults only. Do NOT write defaults over unknown disk state.
    console.warn('Using in-memory defaults without wiping storage');
    result = migrateData(DEFAULT_DATA);
  }

  memoryDataCache = result;
  return memoryDataCache;
}

/**
 * Save data to main file and create backup.
 * Refuses to overwrite meaningful on-disk data with an empty default shell
 * unless allowEmpty is explicitly true (first-run seed / intentional reset).
 */
async function persistData(data, options = {}) {
  const allowEmpty = options?.allowEmpty === true;

  if (Platform.OS === 'web') {
    try {
      const normalizedData = migrateData(data);
      if (!allowEmpty && !hasMeaningfulData(normalizedData)) {
        const existingRaw = await AsyncStorage.getItem(WEB_DATA_KEY);
        if (existingRaw) {
          try {
            const existing = JSON.parse(existingRaw);
            if (hasMeaningfulData(existing)) {
              console.warn('Refusing to overwrite meaningful web data with empty defaults');
              return false;
            }
          } catch {
            // ignore parse errors and continue write
          }
        }
      }
      await AsyncStorage.setItem(WEB_DATA_KEY, JSON.stringify(normalizedData));
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

    // Safety net: never clobber real history with an empty/thin shell
    // (e.g. crash fallback state or a fresh onboarding overwrite).
    if (!allowEmpty) {
      const existingMain = await readJsonDataFile(mainFile);
      const existingBackup = await readJsonDataFile(backupFile);
      const existing = pickRestoredData(existingMain, existingBackup);
      if (existing) {
        const existingDrives = existing.drives?.length || 0;
        const nextDrives = normalizedData.drives?.length || 0;
        const existingScore = dataRichnessScore(existing);
        const nextScore = dataRichnessScore(normalizedData);

        if (!hasMeaningfulData(normalizedData) && hasMeaningfulData(existing)) {
          console.warn('Refusing to overwrite meaningful data with empty defaults');
          return false;
        }

        // Block wiping multi-drive history in one save (full reset uses clearAllData).
        if (existingDrives >= 2 && nextDrives === 0) {
          console.warn('Refusing to wipe drive history with an empty drives list', {
            existingDrives,
            nextDrives,
          });
          return false;
        }

        // Block sudden collapse from a rich profile to a thin onboarded shell.
        if (existingScore >= 1000 && nextScore < existingScore * 0.25) {
          console.warn('Refusing to overwrite rich data with much thinner dataset', {
            existingScore,
            nextScore,
          });
          return false;
        }
      }
    }

    // Create backup of current data before overwriting, but only when current main is meaningful.
    // Copying an empty shell into backup would destroy the last good copy.
    const existingMain = await readJsonDataFile(mainFile);
    if (existingMain && hasMeaningfulData(existingMain)) {
      await FileSystem.writeAsStringAsync(backupFile, JSON.stringify(migrateData(existingMain)));
    } else if (!(await fileExists(backupFile)) && existingMain) {
      await FileSystem.writeAsStringAsync(backupFile, JSON.stringify(migrateData(existingMain)));
    }

    const dataString = JSON.stringify(normalizedData);
    await FileSystem.writeAsStringAsync(mainFile, dataString);

    return true;
  } catch (error) {
    console.error('Failed to save data:', error);
    return false;
  }
}

export function saveData(data, options = {}) {
  const normalizedData = migrateData({
    ...data,
    settings: {
      ...(data.settings || {}),
      cloudBackupEnabled: activeCloudBackup ?? data.settings?.cloudBackupEnabled ?? false,
    },
  });

  // Keep memory cache in sync only when this save is allowed to represent app state.
  // If we refuse an empty overwrite later, loadData(force) can still recover from disk.
  const shouldUpdateCache = options?.allowEmpty === true || hasMeaningfulData(normalizedData) || memoryDataCache === null;
  if (shouldUpdateCache) {
    memoryDataCache = normalizedData;
  }

  saveQueue = saveQueue
    .catch(() => undefined)
    .then(() => persistData(normalizedData, options));
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

export function mergeImportedData(currentData, importedData, categories) {
  const importLogbook = categories.logbook === true;
  const merged = {
    ...currentData,
    user: categories.driver === true ? importedData.user : currentData.user,
    supervisorProfiles: categories.supervisors === true
      ? importedData.supervisorProfiles
      : currentData.supervisorProfiles,
    drives: importLogbook ? importedData.drives : currentData.drives,
    detectedEvents: importLogbook ? importedData.detectedEvents : currentData.detectedEvents,
    streaks: importLogbook ? importedData.streaks : currentData.streaks,
    settings: categories.settings === true
      ? {
          ...importedData.settings,
          cloudBackupEnabled: !!currentData.settings?.cloudBackupEnabled,
        }
      : currentData.settings,
  };

  return migrateData(merged);
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
  memoryDataCache = null;
  preloadPromise = null;
  activeCloudBackup = null;

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
    
    return true;
  } catch (error) {
    console.error('Failed to clear data:', error);
    return false;
  }
}

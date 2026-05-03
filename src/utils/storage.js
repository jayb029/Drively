import * as FileSystem from 'expo-file-system/legacy';
import { getAppVersion } from './appInfo';

const DATA_DIR = `${FileSystem.documentDirectory}drively/`;
const MAIN_DATA_FILE = `${DATA_DIR}data.json`;
const BACKUP_DATA_FILE = `${DATA_DIR}backup.json`;

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
    driveDetectionEnabled: false,
    driveDetectionSensitivity: 'balanced',
    notificationPermissionStatus: null,
    backgroundLocationStatus: null,
  },
  version: getAppVersion(),
};

function migrateData(data) {
  const merged = {
    ...DEFAULT_DATA,
    ...data,
    user: {
      ...DEFAULT_DATA.user,
      ...(data.user || {}),
    },
    supervisorProfiles: Array.isArray(data.supervisorProfiles) ? data.supervisorProfiles : [],
    drives: Array.isArray(data.drives) ? data.drives : [],
    detectedEvents: Array.isArray(data.detectedEvents) ? data.detectedEvents : [],
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
    
    return migrateData(data);
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
 * Export drives data as CSV string
 */
export async function exportDrivesAsCSV() {
  try {
    const data = await loadData();
    const drives = data.drives;
    
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
      'Distance (km)',
      'Average Speed (km/h)',
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
      drive.routeSummary?.distanceKm || '',
      drive.routeSummary?.averageSpeedKmh || '',
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

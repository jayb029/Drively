import { calculateCurrentStreak, calculateLongestStreak, formatDateForStorage } from './streaks';

const supervisors = [
  {
    id: 'dev-supervisor-1',
    name: 'Avery Lorem',
    relationship: 'Parent',
    dateOfBirth: '1984-03-12',
    age: 42,
    licenseNumber: 'DEV-LOREM-001',
    phone: '555-0101',
    signature: null,
    signatureCapturedAt: null,
    createdAt: '2026-01-02T14:00:00.000Z',
  },
  {
    id: 'dev-supervisor-2',
    name: 'Morgan Ipsum',
    relationship: 'Guardian',
    dateOfBirth: '1986-08-24',
    age: 39,
    licenseNumber: 'DEV-IPSUM-002',
    phone: '555-0102',
    signature: null,
    signatureCapturedAt: null,
    createdAt: '2026-01-10T16:30:00.000Z',
  },
];

const destinations = [
  'Lorem practice loop',
  'Ipsum High School',
  'Dolor grocery route',
  'Sit amet parking lot',
  'Consectetur freeway segment',
  'Adipiscing neighborhood loop',
];

const weatherOptions = ['Clear', 'Cloudy', 'Rain', 'Windy', 'Fog'];
const skillSets = [
  'Parking, Turns',
  'Lane changes, Intersections',
  'Merging, Highway',
  'Backing up, Parking',
  'Night driving, Lane changes',
  'Intersections, Turns',
];

function timeFromMinutes(minutes) {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function makeRoutePreview(index) {
  const baseLatitude = 41.8781 + index * 0.002;
  const baseLongitude = -87.6298 - index * 0.002;

  return Array.from({ length: 8 }, (_, pointIndex) => ({
    latitude: Number((baseLatitude + pointIndex * 0.001).toFixed(6)),
    longitude: Number((baseLongitude - pointIndex * 0.001).toFixed(6)),
    accuracy: 12 + pointIndex,
    timestamp: Date.now() - (index * 86400000) + pointIndex * 60000,
    speed: 9 + pointIndex,
  }));
}

function makeDrive(index) {
  const driveDate = new Date();
  driveDate.setDate(driveDate.getDate() - index);

  const isNightDrive = index % 4 === 0;
  const duration = [35, 48, 62, 27, 75, 41, 54, 33, 68, 46, 58, 39][index % 12];
  const startMinutes = isNightDrive ? 19 * 60 + (index % 3) * 20 : 8 * 60 + (index % 7) * 55;
  const distanceKm = Number((duration * (isNightDrive ? 0.62 : 0.78)).toFixed(1));

  return {
    id: `dev-drive-${index + 1}`,
    date: formatDateForStorage(driveDate),
    startTime: timeFromMinutes(startMinutes),
    endTime: timeFromMinutes(startMinutes + duration),
    duration,
    isNightDrive,
    weather: weatherOptions[index % weatherOptions.length],
    weatherData: null,
    skills: skillSets[index % skillSets.length],
    supervisorId: supervisors[index % supervisors.length].id,
    supervisorName: supervisors[index % supervisors.length].name,
    supervisorDateOfBirth: supervisors[index % supervisors.length].dateOfBirth,
    supervisorAge: supervisors[index % supervisors.length].age,
    supervisorLicense: supervisors[index % supervisors.length].licenseNumber,
    destination: destinations[index % destinations.length],
    source: index % 9 === 0 ? 'detected' : 'manual',
    routeSummary: {
      distanceKm,
      averageSpeedKmh: Number((distanceKm / Math.max(duration / 60, 0.1)).toFixed(1)),
      maxSpeedKmh: 48 + (index % 6) * 5,
      samples: 24 + index,
    },
    routePreview: makeRoutePreview(index),
  };
}

export function createDevDrivingData(currentSettings = {}) {
  const drives = Array.from({ length: 24 }, (_, index) => makeDrive(index)).reverse();
  const settings = {
    nightTimeStart: '18:00',
    nightTimeEnd: '06:00',
    backupReminder: true,
    lastBackupDate: null,
    temperatureUnit: 'metric',
    distanceUnit: 'metric',
    driveDetectionSensitivity: 'balanced',
    notificationPermissionStatus: null,
    backgroundLocationStatus: null,
    storagePermissionStatus: null,
    exportDirectoryUri: null,
    ...currentSettings,
    driveDetectionEnabled: false,
  };
  const completedDayHours = drives
    .filter((drive) => !drive.isNightDrive)
    .reduce((sum, drive) => sum + drive.duration / 60, 0);
  const completedNightHours = drives
    .filter((drive) => drive.isNightDrive)
    .reduce((sum, drive) => sum + drive.duration / 60, 0);
  const latestDrive = drives[drives.length - 1];

  return {
    user: {
      licenseType: 'learners',
      licenseDate: '2026-01-15',
      goalDayHours: 50,
      goalNightHours: 10,
      completedDayHours,
      completedNightHours,
      onboardingComplete: true,
    },
    supervisorProfiles: supervisors.map((supervisor) => ({ ...supervisor })),
    drives,
    detectedEvents: [
      {
        id: 'dev-detected-1',
        detectedAt: new Date().toISOString(),
        speedKmh: 46,
        latitude: 41.8781,
        longitude: -87.6298,
        accuracy: 18,
        status: 'new',
      },
    ],
    streaks: {
      current: calculateCurrentStreak(drives),
      longest: calculateLongestStreak(drives),
      lastDriveDate: latestDrive?.date || null,
      freezeDaysUsed: 1,
      freezeDaysThisMonth: 1,
      lastFreezeReset: formatDateForStorage(),
    },
    settings,
  };
}

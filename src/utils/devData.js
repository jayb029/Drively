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

function makeDrive(index, supervisor, forceNightDrive = null) {
  const driveDate = new Date();
  driveDate.setDate(driveDate.getDate() - index);

  const isNightDrive = forceNightDrive ?? index % 4 === 0;
  const duration = [35, 48, 62, 27, 75, 41, 54, 33, 68, 46, 58, 39][index % 12];
  const startMinutes = isNightDrive ? 19 * 60 + (index % 3) * 20 : 8 * 60 + (index % 7) * 55;
  const distanceKm = Number((duration * (isNightDrive ? 0.62 : 0.78)).toFixed(1));
  const assignedSupervisor = supervisor || supervisors[index % supervisors.length];

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
    supervisorId: assignedSupervisor.id,
    supervisorName: assignedSupervisor.name,
    supervisorDateOfBirth: assignedSupervisor.dateOfBirth || assignedSupervisor.birthDate || assignedSupervisor.dob || null,
    supervisorAge: assignedSupervisor.age ?? null,
    supervisorLicense: assignedSupervisor.licenseNumber || null,
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

function sumHours(drives, isNightDrive) {
  return drives
    .filter((drive) => Boolean(drive.isNightDrive) === isNightDrive)
    .reduce((sum, drive) => sum + (Number(drive.duration) || 0) / 60, 0);
}

function makeMissingGoalDrives(existingDrives, availableSupervisors, user = {}) {
  const existingTotalHours = sumHours(existingDrives, false) + sumHours(existingDrives, true);
  const existingNightHours = sumHours(existingDrives, true);
  const totalGoalHours = Number(user.goalDayHours) || 50;
  const nightGoalHours = Number(user.goalNightHours) || 10;
  const missingNightHours = Math.max(nightGoalHours - existingNightHours, 0);
  const missingTotalHours = Math.max(totalGoalHours - existingTotalHours, 0);
  const missingDayHours = Math.max(missingTotalHours - missingNightHours, 0);
  const drives = [];
  let index = existingDrives.length;

  const addDrivesForHours = (targetHours, isNightDrive) => {
    let addedHours = 0;

    while (addedHours < targetHours && drives.length < 80) {
      const supervisor = availableSupervisors[index % availableSupervisors.length];
      const drive = makeDrive(index, supervisor, isNightDrive);
      drives.push(drive);
      addedHours += drive.duration / 60;
      index += 1;
    }
  };

  addDrivesForHours(missingDayHours, false);
  addDrivesForHours(missingNightHours, true);

  return drives;
}

export function createDevDrivingData(currentData = {}) {
  const currentUser = currentData.user || {};
  const currentSettings = currentData.settings || currentData || {};
  const existingDrives = Array.isArray(currentData.drives) ? currentData.drives : [];
  const existingSupervisors = Array.isArray(currentData.supervisorProfiles) ? currentData.supervisorProfiles : [];
  const supervisorProfiles = existingSupervisors.length > 0
    ? existingSupervisors
    : supervisors.map((supervisor) => ({ ...supervisor }));
  const existingDriveIds = new Set(existingDrives.map((drive) => drive.id));
  const missingDrives = makeMissingGoalDrives(existingDrives, supervisorProfiles, currentUser)
    .filter((drive) => !existingDriveIds.has(drive.id));
  const drives = [...existingDrives, ...missingDrives];
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
    driveDetectionEnabled: currentSettings.driveDetectionEnabled ?? false,
  };
  const completedDayHours = sumHours(drives, false);
  const completedNightHours = sumHours(drives, true);
  const latestDrive = drives.reduce((latest, drive) => {
    if (!latest) return drive;
    return new Date(drive.date) > new Date(latest.date) ? drive : latest;
  }, null);

  return {
    user: {
      ...currentUser,
      licenseType: currentUser.licenseType ?? 'learners',
      licenseDate: currentUser.licenseDate ?? '2026-01-15',
      goalDayHours: currentUser.goalDayHours ?? 50,
      goalNightHours: currentUser.goalNightHours ?? 10,
      completedDayHours,
      completedNightHours,
      onboardingComplete: currentUser.onboardingComplete ?? true,
    },
    supervisorProfiles,
    drives,
    detectedEvents: Array.isArray(currentData.detectedEvents) && currentData.detectedEvents.length > 0
      ? currentData.detectedEvents
      : [
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
      ...(currentData.streaks || {}),
      current: calculateCurrentStreak(drives),
      longest: calculateLongestStreak(drives),
      lastDriveDate: latestDrive?.date || null,
      freezeDaysUsed: currentData.streaks?.freezeDaysUsed ?? 1,
      freezeDaysThisMonth: currentData.streaks?.freezeDaysThisMonth ?? 1,
      lastFreezeReset: formatDateForStorage(),
    },
    settings,
  };
}

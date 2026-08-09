const DOCUMENT_DIRECTORY = 'file:///documents/';
const LOCAL_DIRECTORY = `${DOCUMENT_DIRECTORY}drively/local/`;
const CLOUD_DIRECTORY = `${DOCUMENT_DIRECTORY}drively/cloud/`;
const LEGACY_MAIN = `${DOCUMENT_DIRECTORY}drively/data.json`;
const LOCAL_MAIN = `${LOCAL_DIRECTORY}data.json`;
const LOCAL_BACKUP = `${LOCAL_DIRECTORY}backup.json`;

function makeData(driveIds = []) {
  return {
    user: { onboardingComplete: true, driverName: 'Driver', completedDayHours: 999 },
    supervisorProfiles: [],
    drives: driveIds.map((id, index) => ({
      id,
      date: `2026-08-0${index + 1}`,
      startTime: '10:00',
      endTime: '10:30',
      duration: 30,
      dayMinutes: 30,
      nightMinutes: 0,
      destination: index === 0 ? '=DANGEROUS()' : 'School',
    })),
    detectedEvents: [],
    streaks: { current: 0, longest: 0, freezeDaysUsed: 0, freezeDaysThisMonth: 0 },
    settings: { cloudBackupEnabled: false, distanceUnit: 'metric' },
    version: '2.2.1',
  };
}

async function createHarness(initialFiles = {}, cloudEnabled = false) {
  jest.resetModules();
  const files = new Map(Object.entries(initialFiles));
  const writes = [];
  const reads = [];
  const FileSystem = require('expo-file-system/legacy');
  const AsyncStorageModule = require('@react-native-async-storage/async-storage');
  const AsyncStorage = AsyncStorageModule.default || AsyncStorageModule;
  await AsyncStorage.clear();
  await AsyncStorage.setItem('drively.cloudBackupEnabled.v1', String(cloudEnabled));

  FileSystem.getInfoAsync.mockImplementation(async (uri) => ({
    exists: files.has(uri) || [...files.keys()].some((key) => key.startsWith(uri)),
  }));
  FileSystem.makeDirectoryAsync.mockResolvedValue(undefined);
  FileSystem.readAsStringAsync.mockImplementation(async (uri) => {
    reads.push(uri);
    if (!files.has(uri)) throw new Error(`Missing test file: ${uri}`);
    return files.get(uri);
  });
  FileSystem.writeAsStringAsync.mockImplementation(async (uri, value) => {
    writes.push(uri);
    files.set(uri, value);
  });
  FileSystem.deleteAsync.mockImplementation(async (uri) => {
    for (const key of [...files.keys()]) {
      if (key === uri || key.startsWith(uri)) files.delete(key);
    }
  });

  let storage;
  jest.isolateModules(() => { storage = require('../src/utils/storage'); });
  return { AsyncStorage, files, reads, storage, writes };
}

describe('persistent storage simulated runtime', () => {
  test('migrates legacy storage once and recovers a missing main file from backup', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const legacy = await createHarness({ [LEGACY_MAIN]: JSON.stringify(makeData(['legacy'])) });
    const migrated = await legacy.storage.loadData({ force: true });
    expect(migrated.drives.map(({ id }) => id)).toEqual(['legacy']);
    expect(JSON.parse(legacy.files.get(LOCAL_MAIN)).storageMigration.localLayoutVersion).toBe(2);
    expect(legacy.files.has(LOCAL_BACKUP)).toBe(true);
    const writeCount = legacy.writes.length;
    await legacy.storage.loadData({ force: true });
    expect(legacy.writes).toHaveLength(writeCount);

    const backup = await createHarness({ [LOCAL_BACKUP]: JSON.stringify(makeData(['recovered'])) });
    await expect(backup.storage.loadData({ force: true })).resolves.toMatchObject({ drives: [{ id: 'recovered' }] });
    expect(backup.files.has(LOCAL_MAIN)).toBe(true);
  });

  test('preserves intentional deletions and rejects empty accidental overwrites', async () => {
    const harness = await createHarness({
      [LOCAL_MAIN]: JSON.stringify(makeData(['keep', 'delete'])),
      [LOCAL_BACKUP]: JSON.stringify(makeData(['older-a', 'older-b'])),
    });
    await harness.storage.loadData({ force: true });
    await expect(harness.storage.saveData(makeData(['keep']))).resolves.toBe(true);
    expect((await harness.storage.loadData({ force: true })).drives.map(({ id }) => id)).toEqual(['keep']);
    await expect(harness.storage.saveData(makeData([]), { allowEmpty: true })).resolves.toBe(true);
    expect((await harness.storage.loadData({ force: true })).drives).toEqual([]);
  });

  test('never converts a locked encrypted read into first-run defaults', async () => {
    const harness = await createHarness({
      [LOCAL_MAIN]: JSON.stringify({ format: 'drively-encrypted', version: 1 }),
      [LOCAL_BACKUP]: JSON.stringify({ format: 'drively-encrypted', version: 1 }),
    });
    await harness.AsyncStorage.setItem('drively.dataEncryption.v1', JSON.stringify({
      configured: true,
      enabled: true,
      biometricEnabled: true,
    }));

    await expect(harness.storage.loadData({ force: true })).rejects.toThrow('Drively data is locked');
    expect(harness.writes).toEqual([]);
  });

  test('validates imports, deduplicates records, and merges only consented categories', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { storage } = await createHarness();
    const imported = makeData(['same', 'same']);
    imported.drives[1].updatedAt = '2026-08-08T12:00:00Z';
    await expect(storage.importDataFromJSON(JSON.stringify(imported))).resolves.toMatchObject({ drives: [{ id: 'same' }] });
    await expect(storage.importDataFromJSON('{bad')).resolves.toBeNull();
    await expect(storage.importDataFromJSON(JSON.stringify({ ...imported, streaks: { current: -1 } }))).resolves.toBeNull();
    await expect(storage.importDataFromJSON(JSON.stringify({ ...imported, user: [] }))).resolves.toBeNull();

    const current = makeData(['current']);
    current.settings.cloudBackupEnabled = true;
    const incoming = makeData(['incoming']);
    incoming.user.driverName = 'Imported';
    const merged = storage.mergeImportedData(current, incoming, { driver: true, logbook: false, settings: true, supervisors: false });
    expect(merged.user.driverName).toBe('Imported');
    expect(merged.drives[0].id).toBe('current');
    expect(merged.settings.cloudBackupEnabled).toBe(true);
  });

  test('exports JSON and formula-safe CSV and switches cloud-backup locations', async () => {
    const harness = await createHarness({ [LOCAL_MAIN]: JSON.stringify(makeData(['one'])) });
    await harness.storage.loadData({ force: true });
    await expect(harness.storage.exportDataAsJSON()).resolves.toContain('"one"');
    const csv = await harness.storage.exportDrivesAsCSV();
    expect(csv).toContain('Duration (minutes)');
    expect(csv).toContain("'=DANGEROUS()");
    await expect(harness.storage.setCloudBackupEnabled(makeData(['one']), true)).resolves.toBe(true);
    expect(harness.writes.some((uri) => uri.startsWith(CLOUD_DIRECTORY))).toBe(true);
    expect(await harness.AsyncStorage.getItem('drively.cloudBackupEnabled.v1')).toBe('true');
  });

  test('preloads once and clears all local storage roots', async () => {
    const harness = await createHarness({ [LOCAL_MAIN]: JSON.stringify(makeData(['one'])) });
    const first = await harness.storage.preloadData();
    const second = await harness.storage.preloadData();
    expect(second).toBe(first);
    await expect(harness.storage.clearAllData()).resolves.toBe(true);
    expect([...harness.files.keys()].some((uri) => uri.includes('/drively/'))).toBe(false);
  });
});

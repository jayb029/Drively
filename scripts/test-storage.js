const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');

const DOCUMENT_DIRECTORY = 'file:///documents/';
const LOCAL_DIRECTORY = `${DOCUMENT_DIRECTORY}drively/local/`;
const LEGACY_MAIN = `${DOCUMENT_DIRECTORY}drively/data.json`;
const LEGACY_BACKUP = `${DOCUMENT_DIRECTORY}drively/backup.json`;
const LOCAL_MAIN = `${LOCAL_DIRECTORY}data.json`;
const LOCAL_BACKUP = `${LOCAL_DIRECTORY}backup.json`;
const RECOVERY_FILE = `${LOCAL_DIRECTORY}encryption-recovery.json`;

function makeData(driveIds) {
  return {
    user: { onboardingComplete: true, driverName: 'Driver' },
    supervisorProfiles: [],
    drives: driveIds.map((id) => ({ id, date: '2026-08-07', duration: 30, isNightDrive: false })),
    detectedEvents: [],
    streaks: { current: 0, longest: 0 },
    settings: { cloudBackupEnabled: false },
    version: '2.2.1',
  };
}

function createStorageHarness(initialFiles = {}, encryptionEnabled = false) {
  const files = new Map(Object.entries(initialFiles));
  const writes = [];
  const reads = [];
  const asyncValues = new Map([['drively.cloudBackupEnabled.v1', 'false']]);

  const fileSystem = {
    cacheDirectory: 'file:///cache/',
    documentDirectory: DOCUMENT_DIRECTORY,
    async deleteAsync(uri) {
      for (const key of [...files.keys()]) {
        if (key === uri || key.startsWith(uri)) files.delete(key);
      }
    },
    async getInfoAsync(uri) {
      return { exists: files.has(uri) || [...files.keys()].some((key) => key.startsWith(uri)) };
    },
    async makeDirectoryAsync() {},
    async readAsStringAsync(uri) {
      reads.push(uri);
      if (!files.has(uri)) throw new Error(`Missing test file: ${uri}`);
      return files.get(uri);
    },
    async writeAsStringAsync(uri, value) {
      writes.push(uri);
      files.set(uri, value);
    },
  };
  const asyncStorage = {
    async getItem(key) { return asyncValues.get(key) ?? null; },
    async removeItem(key) { asyncValues.delete(key); },
    async setItem(key, value) { asyncValues.set(key, value); },
  };

  const sourcePath = path.join(__dirname, '..', 'src/utils/storage.js');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const transformed = babel.transformSync(source, {
    filename: sourcePath,
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  });
  const loadedModule = { exports: {} };
  const localRequire = (request) => {
    if (request === 'expo-file-system/legacy') return fileSystem;
    if (request === '@react-native-async-storage/async-storage') return asyncStorage;
    if (request === 'react-native') return { Platform: { OS: 'android' } };
    if (request === './appInfo') return { getAppVersion: () => '2.2.1' };
    if (request === './dataEncryption') {
      return {
        createEncryptionRecoveryMetadata: (metadata) => metadata.enabled ? '{"recovery":true}' : null,
        decryptDataString: (value) => value,
        encryptDataString: (value) => value,
        ENCRYPTION_RECOVERY_FILE_NAME: 'encryption-recovery.json',
        getEncryptionMetadata: async () => ({
          enabled: encryptionEnabled,
          salt: 'salt',
          wrappedKey: { nonce: 'nonce', ciphertext: 'ciphertext' },
          kdf: { name: 'PBKDF2-SHA256', iterations: 100000 },
        }),
      };
    }
    if (request === './units') return { getDistanceUnitLabel: () => 'km', getSpeedUnitLabel: () => 'km/h' };
    if (request === './nightDriving') {
      return {
        getDriveDayMinutes: () => 0,
        getDriveNightMinutes: () => 0,
        getNightCalculationLabel: () => '',
        normalizeDriveNightFields: (drive) => drive,
        sumDriveMinutes: (drives) => ({
          dayMinutes: drives.reduce((total, drive) => total + (drive.dayMinutes || 0), 0),
          nightMinutes: drives.reduce((total, drive) => total + (drive.nightMinutes || 0), 0),
        }),
      };
    }
    return require(request);
  };
  Function('require', 'module', 'exports', transformed.code)(localRequire, loadedModule, loadedModule.exports);

  return { files, reads, storage: loadedModule.exports, writes };
}

async function run() {
  const legacy = createStorageHarness({ [LEGACY_MAIN]: JSON.stringify(makeData(['legacy-drive'])) });
  const migrated = await legacy.storage.loadData({ force: true });
  assert.deepEqual(migrated.drives.map(({ id }) => id), ['legacy-drive']);
  assert.equal(JSON.parse(legacy.files.get(LOCAL_MAIN)).storageMigration.localLayoutVersion, 2);
  assert.equal(JSON.parse(legacy.files.get(LEGACY_MAIN)).storageMigration.localLayoutVersion, 2);
  assert(legacy.files.has(LOCAL_BACKUP));
  const migrationWriteCount = legacy.writes.length;
  await legacy.storage.loadData({ force: true });
  assert.equal(legacy.writes.length, migrationWriteCount, 'legacy migration must run only once');

  const deletion = createStorageHarness({
    [LOCAL_MAIN]: JSON.stringify(makeData(['keep', 'delete'])),
    [LOCAL_BACKUP]: JSON.stringify(makeData(['older-1', 'older-2', 'older-3'])),
  });
  const active = await deletion.storage.loadData({ force: true });
  assert.deepEqual(active.drives.map(({ id }) => id), ['keep', 'delete'], 'active main must beat a richer backup');
  await deletion.storage.saveData(makeData(['keep']));
  const afterDeletion = await deletion.storage.loadData({ force: true });
  assert.deepEqual(afterDeletion.drives.map(({ id }) => id), ['keep'], 'deleted drives must not return from backup');
  await deletion.storage.saveData(makeData([]));
  const afterDeleteAll = await deletion.storage.loadData({ force: true });
  assert.deepEqual(afterDeleteAll.drives, [], 'deleting the final drive must persist');

  const pickerFile = 'file:///cache/DocumentPicker/import.json';
  const importConsent = createStorageHarness({
    [LOCAL_MAIN]: JSON.stringify(makeData(['current'])),
    [pickerFile]: JSON.stringify(makeData(['unconfirmed-1', 'unconfirmed-2'])),
  });
  const consentResult = await importConsent.storage.loadData({ force: true });
  assert.deepEqual(consentResult.drives.map(({ id }) => id), ['current']);
  assert(!importConsent.reads.includes(pickerFile), 'unconfirmed picker files must never be read by startup recovery');

  const backupRecovery = createStorageHarness({ [LOCAL_BACKUP]: JSON.stringify(makeData(['recovered'])) });
  const recovered = await backupRecovery.storage.loadData({ force: true });
  assert.deepEqual(recovered.drives.map(({ id }) => id), ['recovered']);
  assert(backupRecovery.files.has(LOCAL_MAIN), 'valid backup must restore a missing main file');

  const encryptedHarness = createStorageHarness({}, true);
  await encryptedHarness.storage.saveData(makeData(['encrypted']), { allowEmpty: true });
  assert.equal(encryptedHarness.files.get(RECOVERY_FILE), '{"recovery":true}', 'encrypted storage must write recovery metadata');

  const unencryptedHarness = createStorageHarness({ [RECOVERY_FILE]: '{"recovery":true}' });
  await unencryptedHarness.storage.setCloudBackupEnabled(makeData(['plain']), false);
  assert(!unencryptedHarness.files.has(RECOVERY_FILE), 'unencrypted storage must remove stale recovery metadata');

  console.log('Storage migration and recovery tests passed.');
}

run().catch((error) => {
  process.exitCode = 1;
  console.error(error);
});

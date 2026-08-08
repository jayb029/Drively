import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Notifications from 'expo-notifications/build/NotificationPermissions';
import * as Updates from 'expo-updates';
import { downloadOtaUpdateInBackground } from '../src/services/otaUpdater';
import {
  compareVersions,
  evaluateApkRelease,
  fetchLatestApkRelease,
  fetchReleaseChangelog,
  formatApkSize,
  parseGithubRelease,
} from '../src/services/apkUpdater';
import { requestNotificationPermission, requestStoragePermission } from '../src/utils/permissions';

jest.mock('expo-notifications/build/NotificationPermissions', () => ({
  requestPermissionsAsync: jest.fn(),
}));

jest.mock('expo-updates', () => ({
  channel: 'production',
  runtimeVersion: '2.2.1',
  updateId: 'test-update',
  isEmbeddedLaunch: true,
  isEnabled: true,
  checkForUpdateAsync: jest.fn(),
  fetchUpdateAsync: jest.fn(),
}));

const releasePayload = (overrides = {}) => ({
  assets: [{
    browser_download_url: 'https://github.com/jayb029/Drively/releases/download/v2.2.2/Drively-v2.2.2-16.apk',
    name: 'Drively-v2.2.2-16.apk',
    size: 10485760,
  }, {
    browser_download_url: 'https://github.com/jayb029/Drively/releases/download/v2.2.2/Drively-v2.2.2-changelog.json',
    name: 'Drively-v2.2.2-changelog.json',
  }],
  body: '# Safer updates\n\nDetails',
  draft: false,
  prerelease: false,
  tag_name: 'v2.2.2',
  ...overrides,
});

describe('APK updater', () => {
  test('parses, compares, evaluates, and formats valid releases', () => {
    const release = parseGithubRelease(releasePayload());
    expect(release).toMatchObject({ version: '2.2.2', versionCode: 16, notes: 'Safer updates' });
    expect(compareVersions('2.10.0', '2.9.9')).toBe(1);
    expect(compareVersions('v2.2', '2.2.0')).toBe(0);
    expect(evaluateApkRelease(release, { version: '2.2.1', versionCode: 15 }).isAvailable).toBe(true);
    expect(formatApkSize(10485760)).toBe('10.0 MB');
    expect(formatApkSize(0)).toBeNull();
  });

  test('rejects malformed, untrusted, draft, and non-monotonic releases', () => {
    expect(() => parseGithubRelease(releasePayload({ draft: true }))).toThrow(/stable/);
    expect(() => parseGithubRelease(releasePayload({ tag_name: 'latest' }))).toThrow(/valid version/);
    expect(() => parseGithubRelease(releasePayload({
      assets: [{ name: 'Drively-v2.2.2-16.apk', browser_download_url: 'https://example.com/app.apk' }],
    }))).toThrow(/correctly named APK/);
    const release = parseGithubRelease(releasePayload());
    expect(() => evaluateApkRelease({ ...release, version: '2.3.0', versionCode: 15 }, { version: '2.2.1', versionCode: 15 })).toThrow(/must be higher/);
    expect(() => evaluateApkRelease(release, { version: '2.2.1', versionCode: 'bad' })).toThrow(/build number/);
  });

  test('downloads and validates changelogs and HTTP responses', async () => {
    const release = parseGithubRelease(releasePayload());
    const changed = await fetchReleaseChangelog(release, jest.fn(async () => ({
      ok: true,
      json: async () => ({ version: '2.2.2', changes: [' First ', '', 4, 'Second'] }),
    })));
    expect(changed.changes).toEqual(['First', 'Second']);

    await expect(fetchReleaseChangelog(release, jest.fn(async () => ({ ok: false, status: 503 })))).rejects.toThrow(/503/);
    await expect(fetchReleaseChangelog(release, jest.fn(async () => ({
      ok: true, json: async () => ({ version: 'wrong', changes: [] }),
    })))).rejects.toThrow(/does not match/);

    const responses = [
      { ok: true, json: async () => releasePayload() },
      { ok: true, json: async () => ({ version: '2.2.2', changes: ['Ready'] }) },
    ];
    await expect(fetchLatestApkRelease(jest.fn(async () => responses.shift()))).resolves.toMatchObject({ changes: ['Ready'] });
    await expect(fetchLatestApkRelease(jest.fn(async () => ({ ok: false, status: 500 })))).rejects.toThrow(/500/);
  });
});

describe('permissions and native PiP facade', () => {
  test('normalizes notification and Android storage permission outcomes', async () => {
    Notifications.requestPermissionsAsync.mockResolvedValueOnce({ status: 'granted' });
    await expect(requestNotificationPermission()).resolves.toBe('granted');
    Notifications.requestPermissionsAsync.mockRejectedValueOnce(new Error('blocked'));
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    await expect(requestNotificationPermission()).resolves.toBe('error');

    const requestSpy = jest.spyOn(PermissionsAndroid, 'requestMultiple').mockResolvedValue({
      read: PermissionsAndroid.RESULTS.GRANTED,
      write: PermissionsAndroid.RESULTS.GRANTED,
    });
    await expect(requestStoragePermission()).resolves.toMatchObject({ status: 'granted', directoryUri: null });
    await expect(requestStoragePermission({ requestDirectory: true })).resolves.toMatchObject({ status: 'granted', directoryUri: 'content://test/' });
    expect(requestSpy).toHaveBeenCalled();
    expect(FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync).toHaveBeenCalled();
  });

  test('forwards supported PiP operations and safely no-ops without the module', async () => {
    const originalOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    NativeModules.DrivePip = {
      addListener: jest.fn(),
      removeListeners: jest.fn(),
      enterPictureInPicture: jest.fn(async () => true),
      isInPictureInPictureMode: jest.fn(async () => false),
      isPictureInPictureSupported: jest.fn(async () => true),
      setTrackingActive: jest.fn(),
      updateStats: jest.fn(),
    };
    let pip;
    jest.isolateModules(() => { pip = require('../src/services/drivePip'); });
    expect(pip.isDrivePipAvailable()).toBe(true);
    await expect(pip.isPictureInPictureSupported()).resolves.toBe(true);
    pip.setDrivePipTrackingActive(true);
    pip.updateDrivePipStats({ title: 'Drive', subtitle: 'Now', startTimestamp: 1, distanceText: '1 km', speedText: '20 km/h' });
    await expect(pip.enterDrivePictureInPicture()).resolves.toBe(true);
    await expect(pip.isInDrivePictureInPictureMode()).resolves.toBe(false);
    expect(pip.addDrivePipModeListener(jest.fn())).toHaveProperty('remove');

    delete NativeModules.DrivePip;
    jest.resetModules();
    jest.isolateModules(() => { pip = require('../src/services/drivePip'); });
    expect(pip.isDrivePipAvailable()).toBe(false);
    await expect(pip.enterDrivePictureInPicture()).resolves.toBe(false);
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS });
  });
});

describe('OTA updater', () => {
  let originalDev;

  beforeEach(() => {
    originalDev = global.__DEV__;
    global.__DEV__ = false;
    Updates.checkForUpdateAsync.mockReset();
    Updates.fetchUpdateAsync.mockReset();
  });

  afterEach(() => { global.__DEV__ = originalDev; });

  test('downloads available updates and leaves current installs untouched', async () => {
    Updates.checkForUpdateAsync.mockResolvedValueOnce({ isAvailable: false, isRollBackToEmbedded: false });
    await expect(downloadOtaUpdateInBackground()).resolves.toEqual({ downloaded: false });
    Updates.checkForUpdateAsync.mockResolvedValueOnce({ isAvailable: true });
    Updates.fetchUpdateAsync.mockResolvedValueOnce({ isNew: true });
    await expect(downloadOtaUpdateInBackground()).resolves.toEqual({ downloaded: true });
  });

  test('attaches diagnostics to update failures', async () => {
    Updates.checkForUpdateAsync.mockRejectedValueOnce(new Error('network'));
    await expect(downloadOtaUpdateInBackground()).rejects.toMatchObject({
      message: 'network', diagnostics: { channel: 'production', runtimeVersion: '2.2.1' },
    });
  });
});

const mockSecureValues = new Map();
const mockFiles = new Map();

jest.mock('expo-crypto', () => ({
  getRandomBytes: jest.fn((length) => Uint8Array.from({ length }, (_, index) => (index * 17 + length) % 256)),
}));

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(async () => true),
  isEnrolledAsync: jest.fn(async () => true),
}));

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///documents/',
  getInfoAsync: jest.fn(async (path) => ({ exists: mockFiles.has(path) })),
  readAsStringAsync: jest.fn(async (path) => mockFiles.get(path)),
}));

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only',
  deleteItemAsync: jest.fn(async (key) => mockSecureValues.delete(key)),
  getItemAsync: jest.fn(async (key) => mockSecureValues.get(key) ?? null),
  setItemAsync: jest.fn(async (key, value) => mockSecureValues.set(key, value)),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  canUseBiometrics,
  acknowledgeEncryptionRecoveryKey,
  changeEncryptionPasscode,
  chooseUnencryptedStorage,
  configureEncryption,
  createEncryptionRecoveryMetadata,
  decryptDataString,
  encryptDataString,
  formatPasscodeLockoutTime,
  generateEncryptionRecoveryKey,
  getEncryptionMetadata,
  getPasscodeLockoutStatus,
  hasEncryptionKey,
  isEncryptedDataString,
  lockEncryption,
  migrateTransientDataFromEncryption,
  setAutomaticPasscodeEntryEnabled,
  setBiometricUnlockEnabled,
  unlockWithBiometrics,
  unlockWithPasscode,
  unlockWithRecoveryKey,
} from '../src/utils/dataEncryption';

describe('data encryption', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockSecureValues.clear();
    mockFiles.clear();
    lockEncryption();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('requires a numeric passcode of at least four digits', async () => {
    await expect(configureEncryption('123', false)).rejects.toThrow('at least 4 digits');
    await expect(configureEncryption('abcd', false)).rejects.toThrow('at least 4 digits');
  });

  it('formats passcode lockout countdowns', () => {
    expect(formatPasscodeLockoutTime(30_000)).toBe('0:30');
    expect(formatPasscodeLockoutTime(60_000)).toBe('1:00');
    expect(formatPasscodeLockoutTime(5 * 60_000 - 1)).toBe('5:00');
  });

  it('encrypts authenticated data and only unwraps it with the correct passcode', async () => {
    await configureEncryption('4826', false);
    const encrypted = encryptDataString(JSON.stringify({ driverName: 'Private driver' }));
    expect(isEncryptedDataString(encrypted)).toBe(true);
    expect(encrypted).not.toContain('Private driver');
    expect(JSON.parse(decryptDataString(encrypted))).toEqual({ driverName: 'Private driver' });

    lockEncryption();
    expect(hasEncryptionKey()).toBe(false);
    await expect(unlockWithPasscode('0000')).resolves.toBe(false);
    await expect(unlockWithPasscode('4826')).resolves.toBe(true);
    expect(JSON.parse(decryptDataString(encrypted))).toEqual({ driverName: 'Private driver' });
  });

  it('escalates persistent passcode lockouts after five incorrect attempts and caps them at 30 minutes', async () => {
    let now = 1_800_000_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    await configureEncryption('4826', false);
    lockEncryption();

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await expect(unlockWithPasscode('0000')).resolves.toBe(false);
      expect(await getPasscodeLockoutStatus()).toEqual({ failedAttempts: attempt, lockedUntil: 0 });
    }

    await expect(unlockWithPasscode('0000')).resolves.toBe(false);
    expect(await getPasscodeLockoutStatus()).toEqual({ failedAttempts: 5, lockedUntil: now + 60_000 });

    // Attempts made during the delay do not advance the escalation level.
    await expect(unlockWithPasscode('0000')).resolves.toBe(false);
    expect((await getPasscodeLockoutStatus()).failedAttempts).toBe(5);

    for (const expectedMinutes of [5, 15, 30, 30]) {
      now = (await getPasscodeLockoutStatus()).lockedUntil + 1;
      await expect(unlockWithPasscode('0000')).resolves.toBe(false);
      const lockout = await getPasscodeLockoutStatus();
      expect(lockout.lockedUntil).toBe(now + expectedMinutes * 60_000);
    }

    now = (await getPasscodeLockoutStatus()).lockedUntil + 1;
    await expect(unlockWithPasscode('4826')).resolves.toBe(true);
    expect(await getPasscodeLockoutStatus()).toEqual({ failedAttempts: 0, lockedUntil: 0 });
  });

  it('stores and uses the mobile-friendly passcode work factor', async () => {
    const configured = await configureEncryption('4826', false);
    expect(configured.kdf.iterations).toBe(100000);
    expect(configured.automaticPasscodeEntry).toBe(true);
    expect(configured.passcodeLength).toBe(4);
    lockEncryption();
    await expect(unlockWithPasscode('4826')).resolves.toBe(true);
  });

  it('persists the automatic passcode entry preference', async () => {
    await configureEncryption('4826', false);
    await setAutomaticPasscodeEntryEnabled(false);
    expect((await getEncryptionMetadata()).automaticPasscodeEntry).toBe(false);
    await setAutomaticPasscodeEntryEnabled(true);
    expect((await getEncryptionMetadata()).automaticPasscodeEntry).toBe(true);
  });

  it('changes the passcode without changing the encrypted data key', async () => {
    await configureEncryption('4826', false);
    const encrypted = encryptDataString(JSON.stringify({ driverName: 'Private driver' }));

    await changeEncryptionPasscode('7391');
    lockEncryption();
    await expect(unlockWithPasscode('4826')).resolves.toBe(false);
    await expect(unlockWithPasscode('7391')).resolves.toBe(true);
    expect(JSON.parse(decryptDataString(encrypted))).toEqual({ driverName: 'Private driver' });
  });

  it('recovers encrypted data and allows a forgotten passcode to be replaced', async () => {
    await configureEncryption('4826', false);
    const encrypted = encryptDataString(JSON.stringify({ driverName: 'Private driver' }));
    const generated = await generateEncryptionRecoveryKey();
    expect(generated.recoveryKey).toMatch(/^DRIVELY(?:-[A-HJ-NP-Z2-9]{4}){6}$/);
    expect(JSON.stringify(generated.metadata)).not.toContain(generated.recoveryKey);

    lockEncryption();
    await expect(unlockWithRecoveryKey('DRIVELY-WRONG-KEY')).resolves.toBe(false);
    await expect(unlockWithRecoveryKey(generated.recoveryKey.toLowerCase().replaceAll('-', ' '))).resolves.toBe(true);
    await changeEncryptionPasscode('7391');
    jest.requireMock('expo-crypto').getRandomBytes.mockImplementationOnce((length) => Uint8Array.from({ length }, (_, index) => (index * 13 + 5) % 256));
    const replacement = await generateEncryptionRecoveryKey();
    lockEncryption();
    await expect(unlockWithRecoveryKey(generated.recoveryKey)).resolves.toBe(false);
    await expect(unlockWithRecoveryKey(replacement.recoveryKey)).resolves.toBe(true);
    lockEncryption();
    await expect(unlockWithPasscode('4826')).resolves.toBe(false);
    await expect(unlockWithPasscode('7391')).resolves.toBe(true);
    expect(JSON.parse(decryptDataString(encrypted))).toEqual({ driverName: 'Private driver' });
  });

  it('acknowledges recovery-key storage and invalidates a regenerated key', async () => {
    await configureEncryption('4826', false);
    const first = await generateEncryptionRecoveryKey();
    expect(first.metadata.recoveryKeyAcknowledged).toBe(false);
    expect((await acknowledgeEncryptionRecoveryKey()).recoveryKeyAcknowledged).toBe(true);

    jest.requireMock('expo-crypto').getRandomBytes.mockImplementationOnce((length) => Uint8Array.from({ length }, (_, index) => (index * 11 + 7) % 256));
    const second = await generateEncryptionRecoveryKey();
    expect(second.recoveryKey).not.toBe(first.recoveryKey);
    lockEncryption();
    await expect(unlockWithRecoveryKey(first.recoveryKey)).resolves.toBe(false);
    await expect(unlockWithRecoveryKey(second.recoveryKey)).resolves.toBe(true);
  });

  it('rewrites encrypted transient drive state as plaintext before opting out', async () => {
    await configureEncryption('4826', false);
    const transient = JSON.stringify({ active: true, destination: 'Private destination' });
    await AsyncStorage.setItem('drively.activeDrive.state.v1', encryptDataString(transient));

    await migrateTransientDataFromEncryption();

    expect(await AsyncStorage.getItem('drively.activeDrive.state.v1')).toBe(transient);
  });

  it('supports an authenticated device-bound biometric key and opting out', async () => {
    expect(await canUseBiometrics()).toBe(true);
    await configureEncryption('1234', true);
    expect((await getEncryptionMetadata()).biometricEnabled).toBe(true);
    lockEncryption();
    expect(await unlockWithBiometrics()).toBe(true);
    expect((await setBiometricUnlockEnabled(false)).biometricEnabled).toBe(false);

    await chooseUnencryptedStorage();
    expect(await getEncryptionMetadata()).toEqual({ configured: true, enabled: false, biometricEnabled: false });
  });

  it('restores only passcode recovery metadata from an Android cloud backup', async () => {
    const configured = await configureEncryption('4826', true);
    const recovery = createEncryptionRecoveryMetadata(configured);
    expect(recovery).not.toContain('biometricKey');
    expect(JSON.parse(recovery).biometricEnabled).toBeUndefined();

    await AsyncStorage.clear();
    mockSecureValues.clear();
    lockEncryption();
    mockFiles.set('file:///documents/drively/cloud/encryption-recovery.json', recovery);

    const restored = await getEncryptionMetadata();
    expect(restored).toEqual({
      configured: true,
      enabled: true,
      biometricEnabled: false,
      salt: configured.salt,
      wrappedKey: configured.wrappedKey,
      kdf: configured.kdf,
    });
    await expect(unlockWithBiometrics()).resolves.toBe(false);
    await expect(unlockWithPasscode('0000')).resolves.toBe(false);
    await expect(unlockWithPasscode('4826')).resolves.toBe(true);
    expect((await getEncryptionMetadata()).passcodeLength).toBe(4);
  });
});

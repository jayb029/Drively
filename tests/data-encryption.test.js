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
  changeEncryptionPasscode,
  chooseUnencryptedStorage,
  configureEncryption,
  createEncryptionRecoveryMetadata,
  decryptDataString,
  encryptDataString,
  getEncryptionMetadata,
  hasEncryptionKey,
  isEncryptedDataString,
  lockEncryption,
  migrateTransientDataFromEncryption,
  setAutomaticPasscodeEntryEnabled,
  setBiometricUnlockEnabled,
  unlockWithBiometrics,
  unlockWithPasscode,
} from '../src/utils/dataEncryption';

describe('data encryption', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockSecureValues.clear();
    mockFiles.clear();
    lockEncryption();
  });

  it('requires a numeric passcode of at least four digits', async () => {
    await expect(configureEncryption('123', false)).rejects.toThrow('at least 4 digits');
    await expect(configureEncryption('abcd', false)).rejects.toThrow('at least 4 digits');
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

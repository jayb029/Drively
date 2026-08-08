import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { NativeModules, Platform } from 'react-native';
import { gcm } from '@noble/ciphers/aes.js';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { logger } from './logger';

const SECURITY_METADATA_KEY = 'drively.dataEncryption.v1';
const BIOMETRIC_KEY_NAME = 'drively.dataEncryption.biometricKey.v1';
export const ENCRYPTION_RECOVERY_FILE_NAME = 'encryption-recovery.json';
const RECOVERY_METADATA_PATHS = [
  `${FileSystem.documentDirectory}drively/cloud/${ENCRYPTION_RECOVERY_FILE_NAME}`,
  `${FileSystem.documentDirectory}drively/local/${ENCRYPTION_RECOVERY_FILE_NAME}`,
];
// Noble's PBKDF2 implementation runs in JavaScript. 210k rounds made a normal
// unlock take several seconds on mid-range Android phones, so new passcodes use
// a still deliberately expensive but mobile-friendly work factor. Existing
// wrappers are upgraded after their first successful unlock.
const KDF_ITERATIONS = 100000;
const AAD = new TextEncoder().encode('drively-data-encryption-v1');

let sessionKey = null;

function normalizeRecoveryMetadata(value) {
  const iterations = Number(value?.kdf?.iterations);
  if (
    value?.format !== 'drively-encryption-recovery'
    || value?.version !== 1
    || typeof value.salt !== 'string'
    || typeof value.wrappedKey?.nonce !== 'string'
    || typeof value.wrappedKey?.ciphertext !== 'string'
    || value?.kdf?.name !== 'PBKDF2-SHA256'
    || !Number.isSafeInteger(iterations)
    || iterations < 1
  ) return null;

  return {
    configured: true,
    enabled: true,
    biometricEnabled: false,
    salt: value.salt,
    wrappedKey: value.wrappedKey,
    kdf: { name: 'PBKDF2-SHA256', iterations },
  };
}

async function restoreEncryptionMetadata() {
  if (Platform.OS === 'web') return null;
  for (const path of RECOVERY_METADATA_PATHS) {
    try {
      const info = await FileSystem.getInfoAsync(path);
      if (!info.exists) continue;
      const recovered = normalizeRecoveryMetadata(JSON.parse(await FileSystem.readAsStringAsync(path)));
      if (!recovered) continue;
      await AsyncStorage.setItem(SECURITY_METADATA_KEY, JSON.stringify(recovered));
      return recovered;
    } catch {
      // Try the other eligible data directory before treating this as first launch.
    }
  }
  return null;
}

const bytesToBase64 = (bytes) => {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return global.btoa(binary);
};

const base64ToBytes = (value) => {
  const binary = global.atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

async function derivePasscodeKey(passcode, salt, iterations = KDF_ITERATIONS) {
  if (Platform.OS === 'android' && NativeModules.DataEncryption?.derivePbkdf2Sha256) {
    const encodedKey = await NativeModules.DataEncryption.derivePbkdf2Sha256(
      passcode,
      bytesToBase64(salt),
      iterations
    );
    return base64ToBytes(encodedKey);
  }

  return pbkdf2Async(sha256, passcode, salt, {
    c: iterations,
    dkLen: 32,
    asyncTick: 10,
  });
}

function encryptBytes(plaintext, key) {
  const nonce = Crypto.getRandomBytes(12);
  const ciphertext = gcm(key, nonce, AAD).encrypt(plaintext);
  return { nonce: bytesToBase64(nonce), ciphertext: bytesToBase64(ciphertext) };
}

function decryptBytes(payload, key) {
  return gcm(key, base64ToBytes(payload.nonce), AAD).decrypt(base64ToBytes(payload.ciphertext));
}

export async function getEncryptionMetadata() {
  const raw = await AsyncStorage.getItem(SECURITY_METADATA_KEY);
  if (!raw) {
    return await restoreEncryptionMetadata()
      || { configured: false, enabled: null, biometricEnabled: false };
  }
  try {
    return JSON.parse(raw);
  } catch {
    return { configured: false, enabled: null, biometricEnabled: false };
  }
}

export function createEncryptionRecoveryMetadata(metadata) {
  if (!metadata?.enabled) return null;
  return JSON.stringify({
    format: 'drively-encryption-recovery',
    version: 1,
    salt: metadata.salt,
    wrappedKey: metadata.wrappedKey,
    kdf: metadata.kdf,
  });
}

export async function canUseBiometrics() {
  try {
    return await LocalAuthentication.hasHardwareAsync() && await LocalAuthentication.isEnrolledAsync();
  } catch {
    return false;
  }
}

export async function configureEncryption(passcode, useBiometrics) {
  if (!/^\d{4,}$/.test(passcode)) throw new Error('Passcode must contain at least 4 digits.');
  const salt = Crypto.getRandomBytes(16);
  const passcodeKey = await derivePasscodeKey(passcode, salt);
  const dataKey = Crypto.getRandomBytes(32);
  const wrappedKey = encryptBytes(dataKey, passcodeKey);
  let biometricEnabled = false;

  if (useBiometrics) {
    await SecureStore.setItemAsync(BIOMETRIC_KEY_NAME, bytesToBase64(dataKey), {
      requireAuthentication: true,
      authenticationPrompt: 'Enable biometric unlock for Drively',
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    biometricEnabled = true;
  } else {
    await SecureStore.deleteItemAsync(BIOMETRIC_KEY_NAME);
  }

  const metadata = {
    configured: true,
    enabled: true,
    biometricEnabled,
    salt: bytesToBase64(salt),
    wrappedKey,
    kdf: { name: 'PBKDF2-SHA256', iterations: KDF_ITERATIONS },
  };
  await AsyncStorage.setItem(SECURITY_METADATA_KEY, JSON.stringify(metadata));
  sessionKey = dataKey;
  return metadata;
}

export async function chooseUnencryptedStorage() {
  await SecureStore.deleteItemAsync(BIOMETRIC_KEY_NAME);
  const metadata = { configured: true, enabled: false, biometricEnabled: false };
  await AsyncStorage.setItem(SECURITY_METADATA_KEY, JSON.stringify(metadata));
  sessionKey = null;
  return metadata;
}

export async function requestEncryptionSetup() {
  const metadata = { configured: false, enabled: null, biometricEnabled: false };
  await AsyncStorage.setItem(SECURITY_METADATA_KEY, JSON.stringify(metadata));
  return metadata;
}

export async function unlockWithPasscode(passcode) {
  const metadata = await getEncryptionMetadata();
  if (!metadata.enabled) return true;
  try {
    const storedIterations = Number(metadata.kdf?.iterations);
    const iterations = Number.isSafeInteger(storedIterations) && storedIterations > 0
      ? storedIterations
      : 210000;
    const passcodeKey = await derivePasscodeKey(passcode, base64ToBytes(metadata.salt), iterations);
    const key = decryptBytes(metadata.wrappedKey, passcodeKey);
    if (key.length !== 32) return false;
    sessionKey = key;

    if (iterations !== KDF_ITERATIONS) {
      // Do not hold the unlock screen open for a second derivation. Upgrade the
      // wrapper in the background so following unlocks use the faster factor.
      void (async () => {
        try {
          const salt = Crypto.getRandomBytes(16);
          const nextPasscodeKey = await derivePasscodeKey(passcode, salt);
          await AsyncStorage.setItem(SECURITY_METADATA_KEY, JSON.stringify({
            ...metadata,
            salt: bytesToBase64(salt),
            wrappedKey: encryptBytes(key, nextPasscodeKey),
            kdf: { name: 'PBKDF2-SHA256', iterations: KDF_ITERATIONS },
          }));
          await logger.info('Passcode encryption migration completed', 'DATA_SECURITY', {
            previousIterations: iterations,
            currentIterations: KDF_ITERATIONS,
          });
        } catch {
          // The data key is already valid. A failed work-factor upgrade should
          // not keep the owner locked out; it can be retried on the next unlock.
          await logger.warn('Passcode encryption migration did not complete; it will retry after the next passcode unlock', 'DATA_SECURITY');
        }
      })();
    }
    return true;
  } catch {
    return false;
  }
}

export async function unlockWithBiometrics() {
  try {
    const encodedKey = await SecureStore.getItemAsync(BIOMETRIC_KEY_NAME, {
      requireAuthentication: true,
      authenticationPrompt: 'Unlock Drively',
    });
    if (!encodedKey) return false;
    sessionKey = base64ToBytes(encodedKey);
    return sessionKey.length === 32;
  } catch {
    return false;
  }
}

export function lockEncryption() {
  sessionKey = null;
}

export function hasEncryptionKey() {
  return sessionKey?.length === 32;
}

export function encryptDataString(plaintext) {
  if (!hasEncryptionKey()) throw new Error('Drively data is locked.');
  return JSON.stringify({ format: 'drively-encrypted', version: 1, ...encryptBytes(new TextEncoder().encode(plaintext), sessionKey) });
}

export function decryptDataString(serialized) {
  const payload = JSON.parse(serialized);
  if (payload?.format !== 'drively-encrypted') return serialized;
  if (!hasEncryptionKey()) throw new Error('Drively data is locked.');
  return new TextDecoder().decode(decryptBytes(payload, sessionKey));
}

export function isEncryptedDataString(serialized) {
  try {
    return JSON.parse(serialized)?.format === 'drively-encrypted';
  } catch {
    return false;
  }
}

export async function migrateTransientDataToEncryption() {
  const keys = ['drively.activeDrive.state.v1', 'drively.detector.state.v1'];
  await Promise.all(keys.map(async (key) => {
    const raw = await AsyncStorage.getItem(key);
    if (!raw || isEncryptedDataString(raw)) return;
    await AsyncStorage.setItem(key, encryptDataString(raw));
  }));
}

export async function setBiometricUnlockEnabled(enabled) {
  const metadata = await getEncryptionMetadata();
  if (!metadata.enabled || !hasEncryptionKey()) throw new Error('Unlock Drively first.');
  if (enabled) {
    await SecureStore.setItemAsync(BIOMETRIC_KEY_NAME, bytesToBase64(sessionKey), {
      requireAuthentication: true,
      authenticationPrompt: 'Enable biometric unlock for Drively',
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } else {
    await SecureStore.deleteItemAsync(BIOMETRIC_KEY_NAME);
  }
  const next = { ...metadata, biometricEnabled: enabled === true };
  await AsyncStorage.setItem(SECURITY_METADATA_KEY, JSON.stringify(next));
  return next;
}

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  canUseBiometrics,
  acknowledgeEncryptionRecoveryKey,
  changeEncryptionPasscode,
  chooseUnencryptedStorage,
  configureEncryption,
  getEncryptionMetadata,
  getPasscodeLockoutStatus,
  generateEncryptionRecoveryKey,
  lockEncryption,
  migrateTransientDataToEncryption,
  migrateTransientDataFromEncryption,
  requestEncryptionSetup,
  setAutomaticPasscodeEntryEnabled,
  setBiometricUnlockEnabled,
  unlockWithBiometrics,
  unlockWithPasscode,
  unlockWithRecoveryKey,
} from '../utils/dataEncryption';
import {
  rewriteCurrentDataForEncryption,
  rewriteCurrentDataWithoutEncryption,
  syncCurrentEncryptionRecoveryMetadata,
} from '../utils/storage';

const DataSecurityContext = createContext(null);

export function DataSecurityProvider({ children }) {
  const [metadata, setMetadata] = useState(null);
  const [unlocked, setUnlocked] = useState(false);
  const [biometricsAvailable, setBiometricsAvailable] = useState(false);
  const [passcodeLockoutUntil, setPasscodeLockoutUntil] = useState(0);
  const [pendingRecoveryKey, setPendingRecoveryKey] = useState(null);
  const leftForegroundRef = useRef(false);

  useEffect(() => {
    Promise.all([getEncryptionMetadata(), canUseBiometrics(), getPasscodeLockoutStatus()]).then(([saved, available, lockout]) => {
      setMetadata(saved);
      setBiometricsAvailable(available);
      setUnlocked(saved.configured && !saved.enabled);
      setPasscodeLockoutUntil(lockout.lockedUntil);
    });
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      // `inactive` is also emitted while the OS biometric prompt is on top.
      // Lock only after the app genuinely enters the background, otherwise a
      // successful fingerprint/Face ID check can immediately lock itself.
      if (state === 'background') {
        leftForegroundRef.current = true;
      } else if (leftForegroundRef.current && metadata?.enabled) {
        leftForegroundRef.current = false;
        lockEncryption();
        setUnlocked(false);
      }
    });
    return () => subscription.remove();
  }, [metadata?.enabled]);

  useEffect(() => {
    if (!passcodeLockoutUntil) return undefined;
    const remaining = passcodeLockoutUntil - Date.now();
    if (remaining <= 0) {
      setPasscodeLockoutUntil(0);
      return undefined;
    }
    const timer = setTimeout(() => setPasscodeLockoutUntil(0), remaining);
    return () => clearTimeout(timer);
  }, [passcodeLockoutUntil]);

  const value = useMemo(() => ({
    metadata,
    unlocked,
    biometricsAvailable,
    passcodeLockoutUntil,
    pendingRecoveryKey,
    setupEncryption: async (passcode, useBiometrics) => {
      await configureEncryption(passcode, useBiometrics);
      await rewriteCurrentDataForEncryption();
      await migrateTransientDataToEncryption();
      const generated = await generateEncryptionRecoveryKey();
      await syncCurrentEncryptionRecoveryMetadata(generated.metadata);
      setMetadata(generated.metadata);
      setPendingRecoveryKey(generated.recoveryKey);
      setUnlocked(true);
    },
    skipEncryption: async () => {
      const next = await chooseUnencryptedStorage();
      setMetadata(next);
      setUnlocked(true);
    },
    beginEncryptionSetup: async () => {
      const next = await requestEncryptionSetup();
      setMetadata(next);
      setUnlocked(false);
    },
    unlockPasscode: async (passcode) => {
      const success = await unlockWithPasscode(passcode);
      const lockout = await getPasscodeLockoutStatus();
      setPasscodeLockoutUntil(lockout.lockedUntil);
      if (lockout.lockedUntil) {
        lockEncryption();
        setUnlocked(false);
      }
      if (success) {
        let next = await getEncryptionMetadata();
        if (!next.recovery || next.recoveryKeyAcknowledged !== true) {
          const generated = await generateEncryptionRecoveryKey();
          next = generated.metadata;
          await syncCurrentEncryptionRecoveryMetadata(next);
          setPendingRecoveryKey(generated.recoveryKey);
        }
        setMetadata(next);
        setUnlocked(true);
      }
      return success;
    },
    unlockBiometric: async () => {
      const success = await unlockWithBiometrics();
      const lockout = await getPasscodeLockoutStatus();
      setPasscodeLockoutUntil(lockout.lockedUntil);
      if (success) {
        let next = await getEncryptionMetadata();
        if (!next.recovery || next.recoveryKeyAcknowledged !== true) {
          const generated = await generateEncryptionRecoveryKey();
          next = generated.metadata;
          await syncCurrentEncryptionRecoveryMetadata(next);
          setPendingRecoveryKey(generated.recoveryKey);
        }
        setMetadata(next);
        setUnlocked(true);
      }
      return success;
    },
    verifyRecoveryKey: async (recoveryKey) => {
      const success = await unlockWithRecoveryKey(recoveryKey);
      const lockout = await getPasscodeLockoutStatus();
      setPasscodeLockoutUntil(lockout.lockedUntil);
      return success;
    },
    completePasscodeRecovery: async (passcode) => {
      const next = await changeEncryptionPasscode(passcode);
      const generated = await generateEncryptionRecoveryKey();
      await syncCurrentEncryptionRecoveryMetadata(generated.metadata);
      setMetadata(generated.metadata);
      setPendingRecoveryKey(generated.recoveryKey);
      setUnlocked(true);
    },
    requireReauthentication: async (passcode, biometric = false) => {
      const success = biometric ? await unlockWithBiometrics() : await unlockWithPasscode(passcode);
      const lockout = await getPasscodeLockoutStatus();
      setPasscodeLockoutUntil(lockout.lockedUntil);
      if (lockout.lockedUntil) {
        lockEncryption();
        setUnlocked(false);
      }
      return success;
    },
    setBiometricsEnabled: async (enabled) => {
      const next = await setBiometricUnlockEnabled(enabled);
      setMetadata(next);
    },
    setAutomaticPasscodeEntry: async (enabled) => {
      const next = await setAutomaticPasscodeEntryEnabled(enabled);
      setMetadata(next);
    },
    changePasscode: async (passcode) => {
      const next = await changeEncryptionPasscode(passcode);
      await syncCurrentEncryptionRecoveryMetadata(next);
      setMetadata(next);
    },
    regenerateRecoveryKey: async () => {
      const generated = await generateEncryptionRecoveryKey();
      await syncCurrentEncryptionRecoveryMetadata(generated.metadata);
      setMetadata(generated.metadata);
      setPendingRecoveryKey(generated.recoveryKey);
      return generated.recoveryKey;
    },
    acknowledgeRecoveryKey: async () => {
      const next = await acknowledgeEncryptionRecoveryKey();
      await syncCurrentEncryptionRecoveryMetadata(next);
      setMetadata(next);
      setPendingRecoveryKey(null);
    },
    disableEncryption: async () => {
      await rewriteCurrentDataWithoutEncryption();
      await migrateTransientDataFromEncryption();
      const next = await chooseUnencryptedStorage();
      setMetadata(next);
      setUnlocked(true);
    },
  }), [biometricsAvailable, metadata, passcodeLockoutUntil, pendingRecoveryKey, unlocked]);

  return <DataSecurityContext.Provider value={value}>{children}</DataSecurityContext.Provider>;
}

export function useDataSecurity() {
  const context = useContext(DataSecurityContext);
  // Standalone screen renderers (Storybook/tests) can safely present the
  // unencrypted state; the real app always installs DataSecurityProvider.
  return context || {
    metadata: { configured: true, enabled: false, biometricEnabled: false },
    passcodeLockoutUntil: 0,
    pendingRecoveryKey: null,
    unlocked: true,
    biometricsAvailable: false,
    beginEncryptionSetup: async () => undefined,
    changePasscode: async () => undefined,
    disableEncryption: async () => undefined,
    requireReauthentication: async () => true,
    verifyRecoveryKey: async () => false,
    completePasscodeRecovery: async () => undefined,
    regenerateRecoveryKey: async () => undefined,
    acknowledgeRecoveryKey: async () => undefined,
    setBiometricsEnabled: async () => undefined,
    setAutomaticPasscodeEntry: async () => undefined,
  };
}

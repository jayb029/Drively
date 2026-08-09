import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  canUseBiometrics,
  changeEncryptionPasscode,
  chooseUnencryptedStorage,
  configureEncryption,
  getEncryptionMetadata,
  getPasscodeLockoutStatus,
  lockEncryption,
  migrateTransientDataToEncryption,
  migrateTransientDataFromEncryption,
  requestEncryptionSetup,
  setAutomaticPasscodeEntryEnabled,
  setBiometricUnlockEnabled,
  unlockWithBiometrics,
  unlockWithPasscode,
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
    setupEncryption: async (passcode, useBiometrics) => {
      const next = await configureEncryption(passcode, useBiometrics);
      await rewriteCurrentDataForEncryption();
      await migrateTransientDataToEncryption();
      setMetadata(next);
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
        setMetadata((current) => ({ ...current, passcodeLength: passcode.length }));
        setUnlocked(true);
      }
      return success;
    },
    unlockBiometric: async () => {
      const success = await unlockWithBiometrics();
      const lockout = await getPasscodeLockoutStatus();
      setPasscodeLockoutUntil(lockout.lockedUntil);
      if (success) setUnlocked(true);
      return success;
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
    disableEncryption: async () => {
      await rewriteCurrentDataWithoutEncryption();
      await migrateTransientDataFromEncryption();
      const next = await chooseUnencryptedStorage();
      setMetadata(next);
      setUnlocked(true);
    },
  }), [biometricsAvailable, metadata, passcodeLockoutUntil, unlocked]);

  return <DataSecurityContext.Provider value={value}>{children}</DataSecurityContext.Provider>;
}

export function useDataSecurity() {
  const context = useContext(DataSecurityContext);
  // Standalone screen renderers (Storybook/tests) can safely present the
  // unencrypted state; the real app always installs DataSecurityProvider.
  return context || {
    metadata: { configured: true, enabled: false, biometricEnabled: false },
    passcodeLockoutUntil: 0,
    unlocked: true,
    biometricsAvailable: false,
    beginEncryptionSetup: async () => undefined,
    changePasscode: async () => undefined,
    disableEncryption: async () => undefined,
    requireReauthentication: async () => true,
    setBiometricsEnabled: async () => undefined,
    setAutomaticPasscodeEntry: async () => undefined,
  };
}

import React from 'react';
import { Alert, Share } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockSecurity = {
  acknowledgeRecoveryKey: jest.fn(async () => undefined),
  automaticPasscodeEntry: false,
  biometricsAvailable: false,
  metadata: {
    automaticPasscodeEntry: false,
    biometricEnabled: false,
    configured: true,
    enabled: true,
    passcodeLength: 4,
    recovery: { version: 1 },
    recoveryKeyAcknowledged: true,
  },
  passcodeLockoutUntil: 0,
  pendingRecoveryKey: null,
  verifyRecoveryKey: jest.fn(async () => true),
  completePasscodeRecovery: jest.fn(async () => undefined),
  regenerateRecoveryKey: jest.fn(async () => 'DRIVELY-TEST'),
  requireReauthentication: jest.fn(async () => true),
  setAutomaticPasscodeEntry: jest.fn(async () => undefined),
  unlockBiometric: jest.fn(async () => false),
  unlockPasscode: jest.fn(async () => true),
};

jest.mock('../src/contexts/DataSecurityContext', () => ({
  useDataSecurity: () => mockSecurity,
}));
jest.mock('../src/contexts/ThemeContext', () => {
  const { lightTheme } = jest.requireActual('../src/utils/theme');
  return { useTheme: () => ({ theme: lightTheme }) };
});
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
jest.mock('../src/components/ReauthenticationModal', () => {
  const ReactModule = require('react');
  const { Text: NativeText, TouchableOpacity: NativeTouchableOpacity } = require('react-native');
  return ({ visible, onSuccess }) => visible
    ? ReactModule.createElement(NativeTouchableOpacity, { onPress: onSuccess }, ReactModule.createElement(NativeText, null, 'Complete reauthentication'))
    : null;
});

import RecoveryKeyModal from '../src/components/RecoveryKeyModal';
import DataSecurityGate from '../src/screens/DataSecurityGate';
import EncryptionSettingsScreen from '../src/screens/EncryptionSettingsScreen';

describe('recovery-key interactions', () => {
  beforeEach(() => {
    mockSecurity.pendingRecoveryKey = null;
    mockSecurity.acknowledgeRecoveryKey.mockClear();
    mockSecurity.verifyRecoveryKey.mockClear().mockResolvedValue(true);
    mockSecurity.completePasscodeRecovery.mockClear().mockResolvedValue(undefined);
    mockSecurity.regenerateRecoveryKey.mockClear().mockResolvedValue('DRIVELY-TEST');
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  test('requires confirmation before dismissing a newly generated recovery key', async () => {
    mockSecurity.pendingRecoveryKey = 'DRIVELY-ABCD-EFGH-JKLM-NPQR-STUV-WXYZ';
    jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
    const screen = await render(<RecoveryKeyModal />);

    expect(screen.getByText(mockSecurity.pendingRecoveryKey)).toBeTruthy();
    expect(screen.getByText('Done').parent.props.accessibilityState?.disabled ?? screen.getByText('Done').parent.props.disabled).toBeTruthy();
    await fireEvent.press(screen.getByText('Save or share securely'));
    expect(Share.share).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining(mockSecurity.pendingRecoveryKey) }));
    await fireEvent.press(screen.getByText('I saved this recovery key somewhere safe'));
    await fireEvent.press(screen.getByText('Done'));
    await waitFor(() => expect(mockSecurity.acknowledgeRecoveryKey).toHaveBeenCalledTimes(1));
  });

  test('verifies a segmented recovery key before changing the passcode', async () => {
    const screen = await render(<DataSecurityGate />);
    await fireEvent.press(screen.getByText('Forgot passcode?'));
    expect(screen.getByLabelText('Recovery key').props.value).toBe('DRIVELY-');
    await fireEvent.changeText(screen.getByLabelText('Recovery key'), 'abcdefghijklmnopqrstuvwx');
    expect(screen.getByLabelText('Recovery key').props.value).toBe('DRIVELY-ABCD-EFGH-IJKL-MNOP-QRST-UVWX');
    await fireEvent.changeText(screen.getByLabelText('Recovery key'), 'ABCD EFGH JKLM NPQR STUV WXYZ');
    await fireEvent.press(screen.getByText('Verify key'));
    await waitFor(() => expect(mockSecurity.verifyRecoveryKey).toHaveBeenCalledWith('DRIVELY-ABCD-EFGH-JKLM-NPQR-STUV-WXYZ'));
    expect(screen.getByText('Change passcode with recovery')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('New passcode'), '7391');
    await fireEvent.press(screen.getByText('Continue'));
    await fireEvent.changeText(screen.getByLabelText('Confirm new passcode'), '7391');
    await fireEvent.press(screen.getByText('Change passcode'));
    await waitFor(() => expect(mockSecurity.completePasscodeRecovery).toHaveBeenCalledWith('7391'));
  });

  test('reauthenticates before replacing the current recovery key', async () => {
    const screen = await render(<EncryptionSettingsScreen navigation={{ goBack: jest.fn() }} />);
    await fireEvent.press(screen.getByText('Generate a new recovery key'));
    const replacementAlert = Alert.alert.mock.calls.find(([title]) => title === 'Replace recovery key?');
    await act(async () => replacementAlert[2].find(({ text }) => text === 'Continue').onPress());
    await fireEvent.press(screen.getByText('Complete reauthentication'));
    await waitFor(() => expect(mockSecurity.regenerateRecoveryKey).toHaveBeenCalledTimes(1));
  });
});

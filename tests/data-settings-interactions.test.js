import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(),
}));

const mockReplaceData = jest.fn();
const mockSetCloudBackupEnabled = jest.fn();
const mockUpdateSettings = jest.fn();
const mockDriving = {
  detectedEvents: [{ id: 'current-detection', status: 'new' }],
  drives: [{ id: 'current-drive', date: '2026-08-08', duration: 30, dayMinutes: 30, nightMinutes: 0 }],
  replaceData: mockReplaceData,
  resetData: jest.fn(),
  setCloudBackupEnabled: mockSetCloudBackupEnabled,
  settings: {
    backupReminder: true,
    cloudBackupEnabled: false,
    distanceUnit: 'metric',
    weatherEnabled: false,
  },
  streaks: { current: 1, longest: 1, freezeDaysUsed: 0, freezeDaysThisMonth: 0 },
  supervisorProfiles: [{ id: 'current-supervisor', name: 'Current Supervisor' }],
  updateSettings: mockUpdateSettings,
  user: {
    driverName: 'Current Driver',
    goalDayHours: 50,
    goalNightHours: 10,
    completedDayHours: 0.5,
    completedNightHours: 0,
    onboardingComplete: true,
  },
};

jest.mock('../src/contexts/DrivingContext', () => ({
  useDriving: () => mockDriving,
}));
jest.mock('../src/contexts/ThemeContext', () => {
  const { lightTheme } = jest.requireActual('../src/utils/theme');
  return { useTheme: () => ({ theme: lightTheme }) };
});
jest.mock('../src/utils/haptics', () => ({
  haptics: {
    action: jest.fn(),
    selection: jest.fn(),
    warning: jest.fn(),
  },
  withHaptic: (callback) => callback,
}));
jest.mock('../src/utils/logger', () => ({
  logUserAction: jest.fn(),
}));

import DataSettingsScreen from '../src/screens/DataSettingsScreen';

const navigation = { goBack: jest.fn(), navigate: jest.fn() };

const importedData = {
  user: {
    driverName: 'Imported Driver',
    goalDayHours: 60,
    goalNightHours: 15,
    completedDayHours: 2,
    completedNightHours: 1,
    onboardingComplete: true,
  },
  supervisorProfiles: [{ id: 'imported-supervisor', name: 'Imported Supervisor' }],
  drives: [{ id: 'imported-drive', date: '2026-08-01', duration: 60, dayMinutes: 30, nightMinutes: 30 }],
  detectedEvents: [{ id: 'imported-detection', status: 'new' }],
  streaks: { current: 4, longest: 5, freezeDaysUsed: 0, freezeDaysThisMonth: 0 },
  settings: { backupReminder: false, cloudBackupEnabled: false, distanceUnit: 'imperial', weatherEnabled: true },
  version: '2.2.1',
};

async function pressText(screen, text) {
  await fireEvent.press(screen.getByText(text));
}

describe('data import and cloud-backup interactions', () => {
  beforeEach(() => {
    mockReplaceData.mockClear();
    mockSetCloudBackupEnabled.mockReset().mockResolvedValue(true);
    mockUpdateSettings.mockClear();
    DocumentPicker.getDocumentAsync.mockReset().mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cache/import.json' }],
    });
    FileSystem.readAsStringAsync.mockReset().mockResolvedValue(JSON.stringify(importedData));
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  test('imports selected categories without overwriting excluded logbook, supervisor, or settings data', async () => {
    const screen = await render(<DataSettingsScreen navigation={navigation} />);

    await pressText(screen, 'Import backup');
    await screen.findByText('Choose what to replace');
    await fireEvent(screen.getByLabelText('Drive log, detections, and streaks'), 'valueChange', false);
    await fireEvent(screen.getByLabelText('Supervisor profiles'), 'valueChange', false);
    await fireEvent(screen.getByLabelText('App settings'), 'valueChange', false);
    await pressText(screen, 'Import selected data');

    expect(mockReplaceData).toHaveBeenCalledWith(expect.objectContaining({
      user: expect.objectContaining({ driverName: 'Imported Driver', goalDayHours: 60 }),
      drives: [expect.objectContaining({ id: 'current-drive', dayMinutes: 30, nightMinutes: 0 })],
      detectedEvents: [expect.objectContaining({ id: 'current-detection' })],
      streaks: expect.objectContaining({ current: 1, longest: 1 }),
      supervisorProfiles: [expect.objectContaining({ id: 'current-supervisor', name: 'Current Supervisor' })],
      settings: expect.objectContaining({ backupReminder: true, distanceUnit: 'metric', weatherEnabled: false }),
    }));
    expect(Alert.alert).toHaveBeenCalledWith(
      'Backup imported',
      'The selected categories were replaced from your backup.'
    );
    expect(screen.queryByText('Choose what to replace')).toBeNull();
    await screen.unmount();
  });

  test('requires explicit confirmation before opting the full logbook into Android cloud backup', async () => {
    const screen = await render(<DataSettingsScreen navigation={navigation} />);

    await fireEvent(screen.getByLabelText('Android cloud backup'), 'valueChange', true);
    const confirmation = Alert.alert.mock.calls.find(([title]) => title === 'Enable Android cloud backup?');
    expect(confirmation?.[1]).toContain('full Drively logbook');
    expect(mockSetCloudBackupEnabled).not.toHaveBeenCalled();

    await act(async () => confirmation[2].find(({ text }) => text === 'Enable').onPress());
    await waitFor(() => expect(mockSetCloudBackupEnabled).toHaveBeenCalledWith(true));
    await screen.unmount();
  });

  test('shows a visible error when switching storage locations fails', async () => {
    mockSetCloudBackupEnabled.mockResolvedValueOnce(false);
    const screen = await render(<DataSettingsScreen navigation={navigation} />);

    await fireEvent(screen.getByLabelText('Android cloud backup'), 'valueChange', true);
    const confirmation = Alert.alert.mock.calls.find(([title]) => title === 'Enable Android cloud backup?');
    await act(async () => confirmation[2].find(({ text }) => text === 'Enable').onPress());

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith(
      'Setting not changed',
      'Drively could not move your logbook to the requested storage location.'
    ));
    await screen.unmount();
  });
});

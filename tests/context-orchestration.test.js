import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

const mockLoadData = jest.fn();
const mockPreloadData = jest.fn();
const mockSaveData = jest.fn();
const mockPersistCloudBackupSetting = jest.fn();

jest.mock('../src/utils/storage', () => ({
  loadData: (...args) => mockLoadData(...args),
  preloadData: (...args) => mockPreloadData(...args),
  saveData: (...args) => mockSaveData(...args),
  setCloudBackupEnabled: (...args) => mockPersistCloudBackupSetting(...args),
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(async () => undefined) },
  logError: jest.fn(async () => undefined),
}));

import { DrivingProvider, useDriving } from '../src/contexts/DrivingContext';

const baseData = () => ({
  user: {
    licenseType: 'restricted',
    licenseDate: '2026-08-01',
    driverName: 'Current Driver',
    dateOfBirth: '01/02/2010',
    permitNumber: 'CURRENT-1',
    goalDayHours: 50,
    goalNightHours: 10,
    completedDayHours: 0,
    completedNightHours: 0,
    onboardingComplete: false,
  },
  supervisorProfiles: [],
  drives: [],
  detectedEvents: [],
  streaks: {
    current: 0,
    longest: 0,
    lastDriveDate: null,
    freezeDaysUsed: 0,
    freezeDaysThisMonth: 0,
    lastFreezeReset: '2026-08-01',
  },
  settings: {
    nightDrivingMethod: 'civil_twilight',
    nightTimeStart: '18:00',
    nightTimeEnd: '06:00',
    backupReminder: true,
    cloudBackupEnabled: false,
    temperatureUnit: 'metric',
    weatherEnabled: false,
    distanceUnit: 'metric',
    censorSensitiveInfo: true,
    alwaysOnWhileTracking: true,
    largeBottomNavIcons: true,
    driveDetectionEnabled: false,
  },
  version: '2.2.1',
});

let currentDriving;

function DrivingProbe() {
  currentDriving = useDriving();
  return <Text>{currentDriving.loading ? 'loading' : currentDriving.user.driverName || 'ready'}</Text>;
}

async function renderProvider(data = baseData()) {
  mockPreloadData.mockResolvedValue(structuredClone(data));
  mockLoadData.mockResolvedValue(structuredClone(data));
  const result = await render(
    <DrivingProvider>
      <DrivingProbe />
    </DrivingProvider>
  );
  await waitFor(() => expect(currentDriving.loading).toBe(false));
  return result;
}

describe('DrivingContext orchestration', () => {
  beforeEach(() => {
    currentDriving = null;
    mockLoadData.mockReset();
    mockPreloadData.mockReset();
    mockSaveData.mockReset().mockResolvedValue(true);
    mockPersistCloudBackupSetting.mockReset().mockResolvedValue(true);
  });

  test('completes onboarding only after the complete state is persisted', async () => {
    const view = await renderProvider();

    await act(async () => {
      await expect(currentDriving.completeOnboarding({
        userInfo: {
          driverName: 'New Driver',
          licenseType: 'learners',
          goalDayHours: 60,
          goalNightHours: 10,
        },
        settings: { distanceUnit: 'imperial', weatherEnabled: false },
      })).resolves.toBe(true);
    });

    expect(mockSaveData).toHaveBeenCalledWith(expect.objectContaining({
      user: expect.objectContaining({
        driverName: 'New Driver',
        licenseType: 'learners',
        onboardingComplete: true,
      }),
      settings: expect.objectContaining({ distanceUnit: 'imperial', weatherEnabled: false }),
    }));
    expect(currentDriving.user).toMatchObject({ driverName: 'New Driver', onboardingComplete: true });
    expect(currentDriving.settings.distanceUnit).toBe('imperial');
    await view.unmount();
  });

  test('does not advance onboarding when persistence fails', async () => {
    mockSaveData.mockResolvedValueOnce(false);
    const view = await renderProvider();

    await act(async () => {
      await expect(currentDriving.completeOnboarding({
        userInfo: { driverName: 'Should Not Apply' },
      })).resolves.toBe(false);
    });

    expect(currentDriving.user.driverName).toBe('Current Driver');
    expect(currentDriving.user.onboardingComplete).toBe(false);
    await view.unmount();
  });

  test('adds, edits, and deletes drives while recalculating totals and streaks', async () => {
    const view = await renderProvider({
      ...baseData(),
      user: { ...baseData().user, onboardingComplete: true },
    });

    await act(async () => {
      currentDriving.addDrive({
        id: 'drive-1',
        date: '2026-08-07',
        duration: 60,
        dayMinutes: 60,
        nightMinutes: 0,
      });
      currentDriving.addDrive({
        id: 'drive-2',
        date: '2026-08-08',
        duration: 30,
        dayMinutes: 10,
        nightMinutes: 20,
      });
    });

    await waitFor(() => expect(currentDriving.drives).toHaveLength(2));
    expect(currentDriving.user).toMatchObject({ completedDayHours: 70 / 60, completedNightHours: 20 / 60 });
    expect(currentDriving.streaks).toMatchObject({ current: 2, longest: 2, lastDriveDate: '2026-08-08' });

    await act(async () => {
      currentDriving.updateDrive({
        ...currentDriving.drives.find(({ id }) => id === 'drive-1'),
        dayMinutes: 30,
        nightMinutes: 30,
      });
    });
    expect(currentDriving.user).toMatchObject({ completedDayHours: 40 / 60, completedNightHours: 50 / 60 });

    await act(async () => currentDriving.deleteDrive('drive-2'));
    expect(currentDriving.drives.map(({ id }) => id)).toEqual(['drive-1']);
    expect(currentDriving.user).toMatchObject({ completedDayHours: 0.5, completedNightHours: 0.5 });
    expect(currentDriving.streaks).toMatchObject({ current: 1, longest: 1 });

    await waitFor(() => expect(mockSaveData).toHaveBeenCalledWith(expect.objectContaining({
      drives: [expect.objectContaining({ id: 'drive-1', nightMinutes: 30 })],
      user: expect.objectContaining({ completedDayHours: 0.5, completedNightHours: 0.5 }),
    })));
    await view.unmount();
  });

  test('creates, edits, and deletes supervisor profiles through the provider', async () => {
    const view = await renderProvider();

    await act(async () => currentDriving.addSupervisorProfile({ name: 'Taylor', relationship: 'Parent' }));
    expect(currentDriving.supervisorProfiles).toHaveLength(1);
    const created = currentDriving.supervisorProfiles[0];
    expect(created).toMatchObject({ name: 'Taylor', relationship: 'Parent' });

    await act(async () => currentDriving.updateSupervisorProfile({ id: created.id, name: 'Taylor Smith' }));
    expect(currentDriving.supervisorProfiles[0]).toMatchObject({ id: created.id, name: 'Taylor Smith' });

    await act(async () => currentDriving.deleteSupervisorProfile(created.id));
    expect(currentDriving.supervisorProfiles).toEqual([]);
    await waitFor(() => expect(mockSaveData).toHaveBeenCalled());
    await view.unmount();
  });

  test('switches cloud-backup storage only after the move succeeds', async () => {
    const view = await renderProvider();

    await act(async () => {
      await expect(currentDriving.setCloudBackupEnabled(true)).resolves.toBe(true);
    });
    expect(mockPersistCloudBackupSetting).toHaveBeenCalledWith(
      expect.objectContaining({ settings: expect.objectContaining({ cloudBackupEnabled: true }) }),
      true
    );
    expect(currentDriving.settings.cloudBackupEnabled).toBe(true);

    mockPersistCloudBackupSetting.mockResolvedValueOnce(false);
    await act(async () => {
      await expect(currentDriving.setCloudBackupEnabled(false)).resolves.toBe(false);
    });
    expect(currentDriving.settings.cloudBackupEnabled).toBe(true);
    await view.unmount();
  });

  test('surfaces load failures without overwriting disk with default state', async () => {
    const error = new Error('disk unavailable');
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockPreloadData.mockRejectedValueOnce(error);
    mockLoadData.mockRejectedValueOnce(error);
    const view = await render(
      <DrivingProvider>
        <DrivingProbe />
      </DrivingProvider>
    );

    await waitFor(() => expect(currentDriving.loading).toBe(false));
    expect(currentDriving.error).toBe('disk unavailable');
    expect(mockSaveData).not.toHaveBeenCalled();
    await view.unmount();
  });
});

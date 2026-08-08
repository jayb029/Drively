import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';

const mockDeleteDrive = jest.fn();
const mockUpdateDrive = jest.fn();
const mockDrive = {
  id: 'drive-1',
  date: '2026-08-08',
  startTime: '18:00',
  endTime: '19:00',
  startTimestamp: Date.UTC(2026, 7, 8, 18, 0),
  endTimestamp: Date.UTC(2026, 7, 8, 19, 0),
  duration: 60,
  dayMinutes: 45,
  nightMinutes: 15,
  nightCalculation: {
    method: 'civil_twilight',
    source: 'calculated',
  },
  classificationSegments: [],
  segments: [],
};

jest.mock('../src/contexts/DrivingContext', () => ({
  useDriving: () => ({
    deleteDetectedEvent: jest.fn(),
    deleteDrive: mockDeleteDrive,
    detectedEvents: [],
    drives: [mockDrive],
    settings: { distanceUnit: 'metric' },
    updateDrive: mockUpdateDrive,
  }),
}));
jest.mock('../src/contexts/ThemeContext', () => {
  const { lightTheme } = jest.requireActual('../src/utils/theme');
  return { useTheme: () => ({ theme: lightTheme }) };
});

import DriveHistoryScreen from '../src/screens/DriveHistoryScreen';

const navigation = {
  navigate: jest.fn(),
  setParams: jest.fn(),
};

describe('drive-history interactions', () => {
  beforeEach(() => {
    mockDeleteDrive.mockClear();
    mockUpdateDrive.mockClear();
    navigation.navigate.mockClear();
    navigation.setParams.mockClear();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  test('edits the day/night split through the visible logbook controls', async () => {
    const screen = await render(
      <DriveHistoryScreen navigation={navigation} route={{ params: {} }} />
    );

    await fireEvent.press(screen.getByText('Edit split'));
    await fireEvent.changeText(screen.getByLabelText('Night minutes'), '25');
    await fireEvent.press(screen.getByText('Save'));

    expect(mockUpdateDrive).toHaveBeenCalledWith(expect.objectContaining({
      id: 'drive-1',
      duration: 60,
      dayMinutes: 35,
      nightMinutes: 25,
      nightCalculation: expect.objectContaining({
        automaticNightMinutes: 15,
        manuallyAdjusted: true,
      }),
      classificationSegments: expect.any(Array),
    }));
    expect(screen.queryByLabelText('Night minutes')).toBeNull();
    await screen.unmount();
  });

  test('requires confirmation before deleting the selected drive', async () => {
    const screen = await render(
      <DriveHistoryScreen navigation={navigation} route={{ params: {} }} />
    );

    await fireEvent.press(screen.getByLabelText(/^Delete drive from Aug/));
    const confirmation = Alert.alert.mock.calls.find(([title]) => title === 'Delete drive');
    expect(confirmation?.[1]).toMatch(/^Remove the entry from Aug \d, 2026\?$/);
    expect(mockDeleteDrive).not.toHaveBeenCalled();

    await act(async () => confirmation[2].find(({ text }) => text === 'Delete').onPress());
    expect(mockDeleteDrive).toHaveBeenCalledWith('drive-1');
    await screen.unmount();
  });
});

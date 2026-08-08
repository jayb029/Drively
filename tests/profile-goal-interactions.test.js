import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';

const mockAddSupervisorProfile = jest.fn();
const mockDeleteSupervisorProfile = jest.fn();
const mockSetUserInfo = jest.fn();
const mockUpdateSupervisorProfile = jest.fn();
const mockDriving = {
  addSupervisorProfile: mockAddSupervisorProfile,
  deleteSupervisorProfile: mockDeleteSupervisorProfile,
  drives: [{ id: 'drive', duration: 60, dayMinutes: 45, nightMinutes: 15 }],
  setUserInfo: mockSetUserInfo,
  settings: { censorSensitiveInfo: false },
  supervisorProfiles: [],
  updateSupervisorProfile: mockUpdateSupervisorProfile,
  user: { goalDayHours: 50, goalNightHours: 10 },
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
    success: jest.fn(),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logUserAction: jest.fn(),
}));

import GoalSettingsScreen from '../src/screens/GoalSettingsScreen';
import SupervisorProfilesScreen from '../src/screens/SupervisorProfilesScreen';

const navigation = { goBack: jest.fn() };

async function pressText(screen, text, index = 0) {
  await fireEvent.press(screen.getAllByText(text)[index]);
}

function signatureEvent(locationX, locationY, timestamp) {
  return {
    nativeEvent: { locationX, locationY, touches: [{ pageX: locationX, pageY: locationY }] },
    touchHistory: {
      indexOfSingleActiveTouch: 0,
      mostRecentTimeStamp: timestamp,
      numberActiveTouches: 1,
      touchBank: [{
        touchActive: true,
        currentPageX: locationX,
        currentPageY: locationY,
        currentTimeStamp: timestamp,
        previousPageX: locationX,
        previousPageY: locationY,
        previousTimeStamp: timestamp - 1,
      }],
    },
  };
}

describe('supervisor and goal interactions', () => {
  beforeEach(() => {
    mockDriving.supervisorProfiles = [];
    mockAddSupervisorProfile.mockClear();
    mockDeleteSupervisorProfile.mockClear();
    mockSetUserInfo.mockClear();
    mockUpdateSupervisorProfile.mockClear();
    navigation.goBack.mockClear();
    DateTimePickerAndroid.open.mockClear();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  test('creates a supervisor only after a real signature stroke is captured', async () => {
    const screen = await render(<SupervisorProfilesScreen navigation={navigation} />);
    await pressText(screen, 'Save Profile');
    await fireEvent.changeText(screen.getByPlaceholderText('Full name'), 'Taylor Parent');
    await fireEvent.changeText(screen.getByPlaceholderText('Relationship'), 'Parent');
    await pressText(screen, 'Save Profile', screen.getAllByText('Save Profile').length - 1);

    const signaturePad = screen.getByLabelText('Supervisor signature pad');
    await fireEvent(signaturePad, 'responderGrant', signatureEvent(10, 20, 1));
    await fireEvent(signaturePad, 'responderMove', signatureEvent(70, 50, 2));
    await fireEvent(signaturePad, 'responderRelease', signatureEvent(70, 50, 3));
    await pressText(screen, 'Save Profile', screen.getAllByText('Save Profile').length - 1);

    await waitFor(() => expect(mockAddSupervisorProfile).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Taylor Parent',
      relationship: 'Parent',
      signature: expect.objectContaining({
        height: 160,
        paths: [expect.stringMatching(/^M 10\.0 20\.0 L 70\.0 50\.0$/)],
      }),
    })));
    await screen.unmount();
  });

  test('rejects an underage supervisor and edits an existing signed profile', async () => {
    const underage = await render(<SupervisorProfilesScreen navigation={navigation} />);
    await pressText(underage, 'Save Profile');
    await fireEvent.changeText(underage.getByPlaceholderText('Full name'), 'Too Young');
    await fireEvent.press(underage.getAllByText('Date of birth').at(-1));
    const picker = DateTimePickerAndroid.open.mock.calls.at(-1)[0];
    await act(async () => picker.onValueChange({}, new Date(2010, 0, 1)));
    await pressText(underage, 'Save Profile', underage.getAllByText('Save Profile').length - 1);
    expect(Alert.alert).toHaveBeenCalledWith('Invalid age', 'Supervisors must be at least 21.');
    expect(mockAddSupervisorProfile).not.toHaveBeenCalled();
    await underage.unmount();

    mockDriving.supervisorProfiles = [{
      id: 'supervisor-1',
      name: 'Taylor',
      relationship: 'Parent',
      signature: { paths: ['M 1 1 L 2 2'], width: 320, height: 160 },
    }];
    const edit = await render(<SupervisorProfilesScreen navigation={navigation} />);
    await fireEvent.press(edit.getByLabelText('Edit Taylor'));
    await fireEvent.changeText(edit.getByPlaceholderText('Full name'), 'Taylor Smith');
    await pressText(edit, 'Save Changes');

    expect(mockUpdateSupervisorProfile).toHaveBeenCalledWith(expect.objectContaining({
      id: 'supervisor-1',
      name: 'Taylor Smith',
      signature: expect.objectContaining({ paths: ['M 1 1 L 2 2'] }),
    }));
    await edit.unmount();
  });

  test('blocks an invalid night goal and saves a corrected goal through the UI', async () => {
    const screen = await render(<GoalSettingsScreen navigation={navigation} />);

    await fireEvent.press(screen.getByLabelText('Night minimum, 10 hours'));
    await fireEvent.changeText(screen.getByLabelText('Night minimum, manual value'), '60');
    expect(screen.getByText('Night hours cannot be greater than total hours.')).toBeTruthy();
    expect(screen.getByText('Save goal').parent.props.accessibilityState).toMatchObject({ disabled: true });
    expect(mockSetUserInfo).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Night minimum, manual value'), '5');
    await fireEvent.press(screen.getByText('Save goal'));
    expect(mockSetUserInfo).toHaveBeenCalledWith({ goalDayHours: 50, goalNightHours: 5 });
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    await screen.unmount();
  });
});

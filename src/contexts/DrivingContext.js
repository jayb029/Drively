import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { AppState } from 'react-native';
import { loadData, saveData } from '../utils/storage';
import { logger, logUserAction, logError } from '../utils/logger';
import { getAppVersion } from '../utils/appInfo';
import { 
  calculateCurrentStreak, 
  calculateLongestStreak,
  shouldResetMonthlyFreezeCounter,
  formatDateForStorage 
} from '../utils/streaks';

const DrivingContext = createContext();

// Action types
const ACTIONS = {
  LOAD_DATA: 'LOAD_DATA',
  SET_USER_INFO: 'SET_USER_INFO',
  ADD_DRIVE: 'ADD_DRIVE',
  UPDATE_DRIVE: 'UPDATE_DRIVE',
  DELETE_DRIVE: 'DELETE_DRIVE',
  UPDATE_STREAKS: 'UPDATE_STREAKS',
  USE_FREEZE_DAY: 'USE_FREEZE_DAY',
  UPDATE_SETTINGS: 'UPDATE_SETTINGS',
  ADD_SUPERVISOR_PROFILE: 'ADD_SUPERVISOR_PROFILE',
  UPDATE_SUPERVISOR_PROFILE: 'UPDATE_SUPERVISOR_PROFILE',
  DELETE_SUPERVISOR_PROFILE: 'DELETE_SUPERVISOR_PROFILE',
  UPDATE_DETECTED_EVENT: 'UPDATE_DETECTED_EVENT',
  COMPLETE_ONBOARDING: 'COMPLETE_ONBOARDING',
  RESET_DATA: 'RESET_DATA',
};

// Initial state
const initialState = {
  user: {
    licenseType: null,
    licenseDate: null,
    driverName: '',
    dateOfBirth: '',
    permitNumber: '',
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
    lastFreezeReset: null,
  },
  settings: {
    nightTimeStart: '18:00',
    nightTimeEnd: '06:00',
    backupReminder: true,
    lastBackupDate: null,
    temperatureUnit: 'metric', // 'metric' or 'imperial'
    distanceUnit: 'metric',
    driveDetectionEnabled: false,
    driveDetectionSensitivity: 'balanced',
    notificationPermissionStatus: null,
    backgroundLocationStatus: null,
    storagePermissionStatus: null,
    exportDirectoryUri: null,
  },
  loading: true,
  error: null,
};

// Reducer function
function drivingReducer(state, action) {
  // Log all actions for debugging
  logger.debug(`Action dispatched: ${action.type}`, 'DRIVING_CONTEXT', { 
    actionType: action.type, 
    payload: action.payload 
  });

  switch (action.type) {
    case ACTIONS.LOAD_DATA:
      logger.info('Data loaded successfully', 'DRIVING_CONTEXT', {
        drivesCount: action.payload.drives?.length || 0,
        onboardingComplete: action.payload.user?.onboardingComplete || false
      });
      return {
        ...state,
        ...action.payload,
        loading: false,
        error: null,
      };

    case ACTIONS.SET_USER_INFO:
      logger.info('User info updated', 'DRIVING_CONTEXT', action.payload);
      return {
        ...state,
        user: {
          ...state.user,
          ...action.payload,
        },
      };

    case ACTIONS.ADD_DRIVE:
      const newDrives = [...state.drives, action.payload];
      const updatedStreaks = {
        ...state.streaks,
        current: calculateCurrentStreak(newDrives),
        longest: Math.max(
          state.streaks.longest,
          calculateLongestStreak(newDrives)
        ),
        lastDriveDate: action.payload.date,
      };
      
      logger.info('Drive added', 'DRIVING_CONTEXT', {
        driveId: action.payload.id,
        duration: action.payload.duration,
        isNightDrive: action.payload.isNightDrive,
        newStreakCount: updatedStreaks.current
      });
      
      return {
        ...state,
        drives: newDrives,
        streaks: updatedStreaks,
        user: {
          ...state.user,
          completedDayHours: state.user.completedDayHours + 
            (action.payload.isNightDrive ? 0 : action.payload.duration / 60),
          completedNightHours: state.user.completedNightHours + 
            (action.payload.isNightDrive ? action.payload.duration / 60 : 0),
        },
      };

    case ACTIONS.UPDATE_DRIVE:
      const updatedDrives = state.drives.map(drive =>
        drive.id === action.payload.id ? action.payload : drive
      );
      
      logger.info('Drive updated', 'DRIVING_CONTEXT', {
        driveId: action.payload.id,
        duration: action.payload.duration
      });
      
      // Recalculate totals
      const dayHours = updatedDrives
        .filter(d => !d.isNightDrive)
        .reduce((sum, d) => sum + d.duration / 60, 0);
      const nightHours = updatedDrives
        .filter(d => d.isNightDrive)
        .reduce((sum, d) => sum + d.duration / 60, 0);
      
      return {
        ...state,
        drives: updatedDrives,
        streaks: {
          ...state.streaks,
          current: calculateCurrentStreak(updatedDrives),
          longest: calculateLongestStreak(updatedDrives),
        },
        user: {
          ...state.user,
          completedDayHours: dayHours,
          completedNightHours: nightHours,
        },
      };

    case ACTIONS.DELETE_DRIVE:
      const filteredDrives = state.drives.filter(drive => drive.id !== action.payload);
      
      logger.info('Drive deleted', 'DRIVING_CONTEXT', {
        driveId: action.payload,
        remainingDrives: filteredDrives.length
      });
      
      // Recalculate totals
      const remainingDayHours = filteredDrives
        .filter(d => !d.isNightDrive)
        .reduce((sum, d) => sum + d.duration / 60, 0);
      const remainingNightHours = filteredDrives
        .filter(d => d.isNightDrive)
        .reduce((sum, d) => sum + d.duration / 60, 0);
      
      return {
        ...state,
        drives: filteredDrives,
        streaks: {
          ...state.streaks,
          current: calculateCurrentStreak(filteredDrives),
          longest: calculateLongestStreak(filteredDrives),
        },
        user: {
          ...state.user,
          completedDayHours: remainingDayHours,
          completedNightHours: remainingNightHours,
        },
      };

    case ACTIONS.UPDATE_STREAKS:
      return {
        ...state,
        streaks: {
          ...state.streaks,
          ...action.payload,
        },
      };

    case ACTIONS.USE_FREEZE_DAY:
      return {
        ...state,
        streaks: {
          ...state.streaks,
          freezeDaysUsed: state.streaks.freezeDaysUsed + 1,
          freezeDaysThisMonth: state.streaks.freezeDaysThisMonth + 1,
        },
      };

    case ACTIONS.UPDATE_SETTINGS:
      return {
        ...state,
        settings: {
          ...state.settings,
          ...action.payload,
        },
      };

    case ACTIONS.ADD_SUPERVISOR_PROFILE:
      return {
        ...state,
        supervisorProfiles: [
          ...state.supervisorProfiles,
          {
            id: Date.now().toString(),
            createdAt: new Date().toISOString(),
            ...action.payload,
          },
        ],
      };

    case ACTIONS.UPDATE_SUPERVISOR_PROFILE:
      return {
        ...state,
        supervisorProfiles: state.supervisorProfiles.map((profile) =>
          profile.id === action.payload.id
            ? { ...profile, ...action.payload, updatedAt: new Date().toISOString() }
            : profile
        ),
      };

    case ACTIONS.DELETE_SUPERVISOR_PROFILE:
      return {
        ...state,
        supervisorProfiles: state.supervisorProfiles.filter((profile) => profile.id !== action.payload),
      };

    case ACTIONS.UPDATE_DETECTED_EVENT:
      return {
        ...state,
        detectedEvents: state.detectedEvents.map((event) =>
          event.id === action.payload.id ? { ...event, ...action.payload } : event
        ),
      };

    case ACTIONS.COMPLETE_ONBOARDING:
      return {
        ...state,
        user: {
          ...state.user,
          ...(action.payload?.user || {}),
          onboardingComplete: true,
        },
        settings: {
          ...state.settings,
          ...(action.payload?.settings || {}),
        },
      };

    case ACTIONS.RESET_DATA:
      return {
        ...initialState,
        loading: false,
      };

    default:
      return state;
  }
}

// Context Provider Component
export function DrivingProvider({ children }) {
  const [state, dispatch] = useReducer(drivingReducer, initialState);

  // Load data on mount
  useEffect(() => {
    async function initializeData() {
      try {
        // Add safety check for logger
        if (logger && logger.info) {
          await logger.info('Loading app data', 'DRIVING_CONTEXT');
        } else {
          console.log('Loading app data (logger not ready)');
        }
        
        const data = await loadData();
        
        // Check if we need to reset monthly freeze counter
        if (shouldResetMonthlyFreezeCounter(data.streaks?.lastFreezeReset)) {
          if (logger && logger.info) {
            await logger.info('Resetting monthly freeze counter', 'DRIVING_CONTEXT');
          } else {
            console.log('Resetting monthly freeze counter');
          }
          
          data.streaks = {
            ...data.streaks,
            freezeDaysThisMonth: 0,
            lastFreezeReset: formatDateForStorage(),
          };
        }
        
        dispatch({ type: ACTIONS.LOAD_DATA, payload: data });
      } catch (error) {
        // Safe error logging
        if (logError) {
          try {
            await logError(error, 'DRIVING_CONTEXT', 'Failed to load data on app startup');
          } catch (logErr) {
            console.error('Failed to log error:', logErr);
          }
        }
        
        console.error('Failed to load data:', error);
        dispatch({ 
          type: ACTIONS.LOAD_DATA, 
          payload: { ...initialState, loading: false, error: error.message } 
        });
      }
    }

    initializeData();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextState) => {
      if (nextState !== 'active' || state.loading) return;

      try {
        const data = await loadData();
        dispatch({ type: ACTIONS.LOAD_DATA, payload: data });
      } catch (error) {
        console.error('Failed to refresh data on app foreground:', error);
      }
    });

    return () => subscription.remove();
  }, [state.loading]);

  // Save data whenever state changes (except loading)
  useEffect(() => {
    if (!state.loading) {
      const saveDataAsync = async () => {
        try {
          const dataToSave = {
            user: state.user,
            supervisorProfiles: state.supervisorProfiles,
            drives: state.drives,
            detectedEvents: state.detectedEvents,
            streaks: state.streaks,
            settings: state.settings,
            version: getAppVersion(),
          };
          await saveData(dataToSave);
          
          // Safe logger usage
          if (logger && logger.debug) {
            await logger.debug('Data saved successfully', 'DRIVING_CONTEXT');
          }
        } catch (error) {
          // Safe error logging
          if (logError) {
            try {
              await logError(error, 'DRIVING_CONTEXT', 'Failed to save data automatically');
            } catch (logErr) {
              console.error('Failed to log save error:', logErr);
            }
          }
          console.error('Failed to save data:', error);
        }
      };
      
      saveDataAsync();
    }
  }, [state.user, state.supervisorProfiles, state.drives, state.detectedEvents, state.streaks, state.settings, state.loading]);

  // Context value with actions
  const buildPersistedData = (overrides = {}) => ({
    user: overrides.user || state.user,
    supervisorProfiles: overrides.supervisorProfiles || state.supervisorProfiles,
    drives: overrides.drives || state.drives,
    detectedEvents: overrides.detectedEvents || state.detectedEvents,
    streaks: overrides.streaks || state.streaks,
    settings: overrides.settings || state.settings,
    version: getAppVersion(),
  });

  const value = {
    ...state,
    
    // Actions
    setUserInfo: (userInfo) => 
      dispatch({ type: ACTIONS.SET_USER_INFO, payload: userInfo }),
    
    addDrive: (drive) => 
      dispatch({ type: ACTIONS.ADD_DRIVE, payload: drive }),
    
    updateDrive: (drive) => 
      dispatch({ type: ACTIONS.UPDATE_DRIVE, payload: drive }),
    
    deleteDrive: (driveId) => 
      dispatch({ type: ACTIONS.DELETE_DRIVE, payload: driveId }),
    
    updateStreaks: (streakData) => 
      dispatch({ type: ACTIONS.UPDATE_STREAKS, payload: streakData }),
    
    useFreezeDay: () => 
      dispatch({ type: ACTIONS.USE_FREEZE_DAY }),
    
    updateSettings: (settings) => 
      dispatch({ type: ACTIONS.UPDATE_SETTINGS, payload: settings }),

    addSupervisorProfile: (profile) =>
      dispatch({ type: ACTIONS.ADD_SUPERVISOR_PROFILE, payload: profile }),

    updateSupervisorProfile: (profile) =>
      dispatch({ type: ACTIONS.UPDATE_SUPERVISOR_PROFILE, payload: profile }),

    deleteSupervisorProfile: (profileId) =>
      dispatch({ type: ACTIONS.DELETE_SUPERVISOR_PROFILE, payload: profileId }),

    updateDetectedEvent: (event) =>
      dispatch({ type: ACTIONS.UPDATE_DETECTED_EVENT, payload: event }),
    
    completeOnboarding: async ({ userInfo, settings } = {}) => {
      const nextUser = {
        ...state.user,
        ...(userInfo || {}),
        onboardingComplete: true,
      };
      const nextSettings = {
        ...state.settings,
        ...(settings || {}),
      };
      const didSave = await saveData(buildPersistedData({
        user: nextUser,
        settings: nextSettings,
      }));

      if (!didSave) {
        return false;
      }

      dispatch({
        type: ACTIONS.COMPLETE_ONBOARDING,
        payload: {
          user: userInfo,
          settings,
        },
      });
      return true;
    },

    replaceData: (data) =>
      dispatch({ type: ACTIONS.LOAD_DATA, payload: data }),
    
    resetData: () => 
      dispatch({ type: ACTIONS.RESET_DATA }),
  };

  return (
    <DrivingContext.Provider value={value}>
      {children}
    </DrivingContext.Provider>
  );
}

// Custom hook to use the context
export function useDriving() {
  const context = useContext(DrivingContext);
  if (!context) {
    throw new Error('useDriving must be used within a DrivingProvider');
  }
  return context;
}

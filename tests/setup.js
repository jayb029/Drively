process.env.TZ = 'UTC';

jest.mock('@react-native-async-storage/async-storage', () => {
  let values = new Map();
  return {
    __esModule: true,
    default: {
      clear: jest.fn(async () => { values = new Map(); }),
      getAllKeys: jest.fn(async () => [...values.keys()]),
      getItem: jest.fn(async (key) => values.get(key) ?? null),
      multiGet: jest.fn(async (keys) => keys.map((key) => [key, values.get(key) ?? null])),
      multiRemove: jest.fn(async (keys) => keys.forEach((key) => values.delete(key))),
      multiSet: jest.fn(async (entries) => entries.forEach(([key, value]) => values.set(key, value))),
      removeItem: jest.fn(async (key) => { values.delete(key); }),
      setItem: jest.fn(async (key, value) => { values.set(key, value); }),
    },
  };
});

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  documentDirectory: 'file:///documents/',
  EncodingType: { UTF8: 'utf8' },
  StorageAccessFramework: {
    createFileAsync: jest.fn(async (_directory, name) => `content://test/${name}`),
    requestDirectoryPermissionsAsync: jest.fn(async () => ({ granted: true, directoryUri: 'content://test/' })),
  },
  copyAsync: jest.fn(async () => undefined),
  deleteAsync: jest.fn(async () => undefined),
  getInfoAsync: jest.fn(async () => ({ exists: false, size: 0 })),
  makeDirectoryAsync: jest.fn(async () => undefined),
  moveAsync: jest.fn(async () => undefined),
  readAsStringAsync: jest.fn(async () => { throw new Error('Test file not found'); }),
  writeAsStringAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation((uri) => ({
    uri,
    exists: false,
    create: jest.fn(),
    text: jest.fn(async () => ''),
    write: jest.fn(),
  })),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-print', () => ({
  printToFileAsync: jest.fn(async () => ({ uri: 'file:///cache/report.pdf' })),
}));

jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Error: 'error', Success: 'success', Warning: 'warning' },
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(async () => undefined),
  deactivateKeepAwake: jest.fn(),
}));

jest.mock('@react-native-community/datetimepicker', () => ({
  DateTimePickerAndroid: { open: jest.fn() },
}));

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'MaterialCommunityIcons');

global.fetch = jest.fn();

// Drively's shipped native runtime is Android; exercise Android branches by default.
Object.defineProperty(require('react-native').Platform, 'OS', {
  configurable: true,
  value: 'android',
});

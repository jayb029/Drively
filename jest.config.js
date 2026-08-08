module.exports = {
  preset: 'jest-expo',
  setupFiles: [
    '<rootDir>/tests/setup.js',
  ],
  moduleNameMapper: {
    '^expo-modules-core$': '<rootDir>/node_modules/expo/node_modules/expo-modules-core',
    '^expo-modules-core/(.*)$': '<rootDir>/node_modules/expo/node_modules/expo-modules-core/$1',
  },
  testMatch: [
    '<rootDir>/tests/**/*.test.js',
  ],
  transformIgnorePatterns: [
    '/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|standard-navigation|@noble))',
    '/node_modules/react-native-reanimated/plugin/',
    '/node_modules/@react-native/babel-preset/',
  ],
  collectCoverageFrom: [
    'App.js',
    'src/**/*.js',
    '!src/components/ThemeDebugger.js',
  ],
  coverageDirectory: '<rootDir>/.test-results/coverage',
  coverageReporters: ['text', 'json-summary', 'html'],
  coverageThreshold: {
    global: {
      statements: 60,
      branches: 50,
      functions: 58,
      lines: 62,
    },
  },
  clearMocks: true,
  restoreMocks: true,
  testTimeout: 15000,
  watchman: false,
};

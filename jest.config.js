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

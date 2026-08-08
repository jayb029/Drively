import * as FileSystem from 'expo-file-system/legacy';
import {
  LOG_LEVELS,
  cleanupOldLogs,
  clearLogs,
  exportLogs,
  getAllLogs,
  getLogStats,
  getRecentLogs,
  initializeLogger,
  log,
  logError,
  logPerformance,
  logUserAction,
  logger,
  redactLogData,
  scheduleLogCleanup,
} from '../src/utils/logger';

describe('diagnostic logger simulated filesystem runtime', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    FileSystem.getInfoAsync.mockResolvedValue({ exists: false, size: 0 });
    FileSystem.readAsStringAsync.mockResolvedValue('');
  });

  afterEach(() => jest.useRealTimers());

  test('recursively redacts sensitive diagnostic values', () => {
    expect(redactLogData({
      ok: 'visible',
      profile: { phone: '555', latitude: 41, nested: [{ token: 'secret' }] },
    })).toEqual({
      ok: 'visible',
      profile: { phone: '[REDACTED]', latitude: '[REDACTED]', nested: [{ token: '[REDACTED]' }] },
    });
    expect(redactLogData(null)).toBeNull();
  });

  test('initializes, queues every log facade, and safely reports an empty store', async () => {
    await initializeLogger();
    await log('direct', LOG_LEVELS.INFO, 'TEST', { permitNumber: 'hidden' });
    await logger.debug('debug');
    await logger.info('info');
    await logger.warn('warn');
    await logger.error('error');
    logUserAction('tap', 'TEST', { longitude: -87 });
    await logPerformance('render', 12);
    await logError(new Error('expected'), 'TEST', 'error-path test');
    expect(await getRecentLogs()).toEqual([]);
    expect(await getAllLogs()).toEqual([]);
    await expect(getLogStats()).resolves.toMatchObject({ exists: false, lineCount: 0, sizeFormatted: '0 Bytes' });
    await cleanupOldLogs();
    await clearLogs();
  });

  test('exports existing logs and schedules periodic cleanup', async () => {
    FileSystem.getInfoAsync.mockResolvedValue({ exists: true, modificationTime: 1_786_166_400, size: 2048 });
    FileSystem.readAsStringAsync.mockResolvedValue('2026-08-08T12:00:00.000Z [INFO] [TEST] ready\n');
    await expect(exportLogs()).resolves.toMatchObject({ size: 2048, sizeFormatted: '2 KB' });
    await expect(getLogStats()).resolves.toMatchObject({ exists: true, lineCount: 1 });
    await scheduleLogCleanup();
    expect(jest.getTimerCount()).toBeGreaterThan(0);
  });
});

import * as FileSystem from 'expo-file-system/legacy';
import { File } from 'expo-file-system';

const LOGS_DIR = `${FileSystem.documentDirectory}drively/logs/`;
const LOG_FILE = `${LOGS_DIR}debug.log`;
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB max log file size
const LOG_RETENTION_DAYS = 2;
const LOG_FLUSH_DELAY_MS = 300;
const REDACTED_VALUE = '[REDACTED]';
const SENSITIVE_KEY_PATTERN = /(birth|dob|license|permit|phone|signature|password|token|secret|lat|latitude|lon|lng|longitude|coordinate|url)/i;

let logWriteQueue = Promise.resolve();
let pendingLogLines = [];
let logFlushTimer = null;

function queueLogLine(logLine) {
  pendingLogLines.push(logLine);
  if (logFlushTimer) return;

  logFlushTimer = setTimeout(() => {
    logFlushTimer = null;
    flushPendingLogs().catch((error) => {
      console.warn('Failed to flush debug logs:', error);
    });
  }, LOG_FLUSH_DELAY_MS);
}

async function appendLogLines(logLines) {
  if (!logLines.length) return logWriteQueue;

  logWriteQueue = logWriteQueue
    .catch(() => undefined)
    .then(async () => {
      await ensureLogsDirectoryExists();
      const logFile = new File(LOG_FILE);
      if (logFile.exists && logFile.size > MAX_LOG_SIZE) {
        await rotateLogs();
      }
      if (!logFile.exists) {
        logFile.create({ intermediates: true });
      }
      logFile.write(logLines.join(''), { append: true });
    });

  return logWriteQueue;
}

async function flushPendingLogs() {
  if (logFlushTimer) {
    clearTimeout(logFlushTimer);
    logFlushTimer = null;
  }

  const lines = pendingLogLines;
  pendingLogLines = [];
  return appendLogLines(lines);
}

function getModifiedDate(modificationTime) {
  if (!modificationTime) return null;
  const timestampMs = modificationTime < 10000000000 ? modificationTime * 1000 : modificationTime;
  return new Date(timestampMs);
}

export function redactLogData(data) {
  if (data == null) return data;
  if (Array.isArray(data)) {
    return data.map(redactLogData);
  }
  if (typeof data === 'object') {
    return Object.fromEntries(
      Object.entries(data).map(([key, value]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key) ? REDACTED_VALUE : redactLogData(value),
      ])
    );
  }
  return data;
}

/**
 * Log levels for filtering and formatting
 */
export const LOG_LEVELS = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
};

/**
 * Initialize the logging system
 * This should be called when the app starts
 */
export async function initializeLogger() {
  try {
    // Add extra safety checks for file system operations
    if (!FileSystem.documentDirectory) {
      console.warn('FileSystem.documentDirectory not available, logging disabled');
      return;
    }

    // Add timeout to prevent hanging on file operations
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Logger initialization timeout')), 3000)
    );

    await Promise.race([
      (async () => {
        await ensureLogsDirectoryExists();
        // Log app startup
        await log('Logger initialized', LOG_LEVELS.INFO, 'SYSTEM');
      })(),
      timeoutPromise
    ]);
  } catch (error) {
    console.error('Failed to initialize logger:', error);
    // Don't throw - let the app continue without logging
  }
}

/**
 * Ensure the logs directory exists
 */
async function ensureLogsDirectoryExists() {
  try {
    const dirInfo = await FileSystem.getInfoAsync(LOGS_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(LOGS_DIR, { intermediates: true });
    }
  } catch (error) {
    console.warn('Failed to create logs directory:', error);
    throw error; // Re-throw to handle in caller
  }
}

/**
 * Main logging function
 * @param {string} message - The message to log
 * @param {string} level - Log level (DEBUG, INFO, WARN, ERROR)
 * @param {string} component - Component or module name
 * @param {object} data - Additional data to log (optional)
 */
export async function log(message, level = LOG_LEVELS.INFO, component = 'APP', data = null) {
  try {
    const safeData = redactLogData(data);
    // If FileSystem is not available, just console log
    if (!FileSystem.documentDirectory) {
      if (__DEV__) {
        const consoleMethod = {
          [LOG_LEVELS.DEBUG]: console.debug,
          [LOG_LEVELS.INFO]: console.info,
          [LOG_LEVELS.WARN]: console.warn,
          [LOG_LEVELS.ERROR]: console.error,
        }[level] || console.log;

        consoleMethod(`[${component}] ${message}`, safeData || '');
      }
      return;
    }

    const timestamp = new Date().toISOString();
    const logLine = `${timestamp} [${level}] [${component}] ${message}${safeData ? ` | Data: ${JSON.stringify(safeData)}` : ''}\n`;
    queueLogLine(logLine);

    // Routine console traffic can noticeably stall Metro-connected debug builds.
    if (__DEV__ && (level === LOG_LEVELS.WARN || level === LOG_LEVELS.ERROR)) {
      const consoleMethod = {
        [LOG_LEVELS.DEBUG]: console.debug,
        [LOG_LEVELS.INFO]: console.info,
        [LOG_LEVELS.WARN]: console.warn,
        [LOG_LEVELS.ERROR]: console.error,
      }[level] || console.log;

      consoleMethod(`[${component}] ${message}`, safeData || '');
    }
  } catch (error) {
    console.error('Failed to write log:', error);
  }
}

/**
 * Convenience methods for different log levels
 */
export const logger = {
  debug: (message, component = 'APP', data = null) => 
    log(message, LOG_LEVELS.DEBUG, component, data),
  
  info: (message, component = 'APP', data = null) => 
    log(message, LOG_LEVELS.INFO, component, data),
  
  warn: (message, component = 'APP', data = null) => 
    log(message, LOG_LEVELS.WARN, component, data),
  
  error: (message, component = 'APP', data = null) => 
    log(message, LOG_LEVELS.ERROR, component, data),
};

/**
 * Log user actions for debugging user flows
 */
export function logUserAction(action, screen, data = null) {
  log(`User action: ${action}`, LOG_LEVELS.INFO, `SCREEN_${screen}`, data).catch(() => undefined);
}

/**
 * Log performance metrics
 */
export async function logPerformance(metric, value, component = 'PERF') {
  await log(`Performance: ${metric} = ${value}ms`, LOG_LEVELS.DEBUG, component, { metric, value });
}

/**
 * Log errors with stack trace
 */
export async function logError(error, component = 'ERROR', context = null) {
  const errorData = {
    name: error.name,
    message: error.message,
    stack: error.stack,
    context,
  };
  
  await log(`Error: ${error.message}`, LOG_LEVELS.ERROR, component, errorData);
}

/**
 * Clean up logs older than retention period
 */
export async function cleanupOldLogs() {
  try {
    await flushPendingLogs();
    const fileInfo = await FileSystem.getInfoAsync(LOG_FILE);
    if (!fileInfo.exists) {
      return;
    }

    const now = new Date();
    const retentionMs = LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const cutoffTime = new Date(now.getTime() - retentionMs);

    // Read current log file
    const logContent = await FileSystem.readAsStringAsync(LOG_FILE);
    const lines = logContent.split('\n');
    
    // Filter out old logs
    const filteredLines = lines.filter(line => {
      if (!line.trim()) return false;
      
      try {
        // Extract timestamp from log line
        const timestampMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/);
        if (timestampMatch) {
          const logTime = new Date(timestampMatch[1]);
          return logTime > cutoffTime;
        }
      } catch (error) {
        // Keep line if we can't parse timestamp
        return true;
      }
      return true;
    });

    // Write filtered logs back
    if (filteredLines.length !== lines.length) {
      const filteredContent = filteredLines.join('\n');
      await FileSystem.writeAsStringAsync(LOG_FILE, filteredContent);
      
      const removedCount = lines.length - filteredLines.length;
      await log(`Cleaned up ${removedCount} old log entries`, LOG_LEVELS.INFO, 'LOGGER');
    }
  } catch (error) {
    console.error('Failed to cleanup old logs:', error);
  }
}

/**
 * Rotate logs when file gets too large
 */
async function rotateLogs() {
  try {
    const backupFile = `${LOGS_DIR}debug.log.old`;
    const backupInfo = await FileSystem.getInfoAsync(backupFile);
    if (backupInfo.exists) {
      await FileSystem.deleteAsync(backupFile);
    }

    // Move current log to backup
    await FileSystem.moveAsync({
      from: LOG_FILE,
      to: backupFile,
    });
  } catch (error) {
    console.error('Failed to rotate logs:', error);
  }
}

/**
 * Get recent logs for debugging
 * @param {number} lines - Number of recent lines to return
 * @param {string} level - Filter by log level (optional)
 */
export async function getRecentLogs(lines = 100, level = null) {
  try {
    await flushPendingLogs();
    await ensureLogsDirectoryExists();

    const fileInfo = await FileSystem.getInfoAsync(LOG_FILE);
    if (!fileInfo.exists) {
      return [];
    }

    const logContent = await FileSystem.readAsStringAsync(LOG_FILE);
    const allLines = logContent.split('\n').filter(line => line.trim());
    
    let filteredLines = allLines;
    
    // Filter by level if specified
    if (level) {
      filteredLines = allLines.filter(line => line.includes(`[${level}]`));
    }
    
    // A null limit is used by the advanced diagnostics screen to show the
    // complete retained log. Normal callers remain limited to recent entries.
    return lines === null ? filteredLines : filteredLines.slice(-lines);
  } catch (error) {
    console.error('Failed to get recent logs:', error);
    return [];
  }
}

/**
 * Get the complete retained debug log for advanced troubleshooting.
 */
export async function getAllLogs(level = null) {
  return getRecentLogs(null, level);
}

/**
 * Export logs for debugging
 */
export async function exportLogs() {
  try {
    await flushPendingLogs();
    const fileInfo = await FileSystem.getInfoAsync(LOG_FILE);
    if (!fileInfo.exists || fileInfo.size === 0) {
      throw new Error('No log file found');
    }

    return {
      uri: LOG_FILE,
      size: fileInfo.size,
      modifiedTime: fileInfo.modificationTime,
      sizeFormatted: formatFileSize(fileInfo.size),
    };
  } catch (error) {
    console.error('Failed to export logs:', error);
    throw error;
  }
}

/**
 * Clear all logs manually
 */
export async function clearLogs() {
  try {
    if (logFlushTimer) {
      clearTimeout(logFlushTimer);
      logFlushTimer = null;
    }
    pendingLogLines = [];
    await logWriteQueue.catch(() => undefined);
    const fileInfo = await FileSystem.getInfoAsync(LOG_FILE);
    if (fileInfo.exists) {
      await FileSystem.deleteAsync(LOG_FILE);
    }
  } catch (error) {
    console.error('Failed to clear logs:', error);
    throw error;
  }
}

/**
 * Get log statistics
 */
export async function getLogStats() {
  try {
    await flushPendingLogs();
    await ensureLogsDirectoryExists();

    const fileInfo = await FileSystem.getInfoAsync(LOG_FILE);
    if (!fileInfo.exists || fileInfo.size === 0) {
      return {
        exists: false,
        size: 0,
        lineCount: 0,
        lastModified: null,
        sizeFormatted: formatFileSize(0),
      };
    }

    const logContent = await FileSystem.readAsStringAsync(LOG_FILE);
    const lines = logContent.split('\n').filter(line => line.trim());
    const levelCounts = lines.reduce((counts, line) => {
      const match = line.match(/^\S+ \[(DEBUG|INFO|WARN|ERROR)\]/);
      if (match) counts[match[1]] += 1;
      return counts;
    }, { DEBUG: 0, INFO: 0, WARN: 0, ERROR: 0 });
    
    return {
      exists: true,
      size: fileInfo.size,
      lineCount: lines.length,
      warningCount: levelCounts.WARN,
      errorCount: levelCounts.ERROR,
      lastModified: getModifiedDate(fileInfo.modificationTime),
      sizeFormatted: formatFileSize(fileInfo.size),
    };
  } catch (error) {
    console.error('Failed to get log stats:', error);
    return {
      exists: false,
      size: 0,
      lineCount: 0,
      lastModified: null,
      error: error.message,
    };
  }
}

/**
 * Format file size for display
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Schedule automatic log cleanup every 2 days
 */
export async function scheduleLogCleanup() {
  try {
    const CLEANUP_INTERVAL = 2 * 24 * 60 * 60 * 1000; // 2 days in milliseconds
    
    setInterval(async () => {
      try {
        await cleanupOldLogs();
        await logger.info('Automatic log cleanup completed', 'SYSTEM');
      } catch (error) {
        console.error('Failed to cleanup logs automatically:', error);
      }
    }, CLEANUP_INTERVAL);
  } catch (error) {
    console.error('Failed to schedule log cleanup:', error);
    // Don't throw - let the app continue
  }
}

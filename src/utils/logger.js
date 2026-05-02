import * as FileSystem from 'expo-file-system/legacy';

const LOGS_DIR = `${FileSystem.documentDirectory}drively/logs/`;
const LOG_FILE = `${LOGS_DIR}debug.log`;
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB max log file size
const LOG_RETENTION_DAYS = 2;

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
        await cleanupOldLogs();
        
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
    // If FileSystem is not available, just console log
    if (!FileSystem.documentDirectory) {
      if (__DEV__) {
        const consoleMethod = {
          [LOG_LEVELS.DEBUG]: console.debug,
          [LOG_LEVELS.INFO]: console.info,
          [LOG_LEVELS.WARN]: console.warn,
          [LOG_LEVELS.ERROR]: console.error,
        }[level] || console.log;

        consoleMethod(`[${component}] ${message}`, data || '');
      }
      return;
    }

    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      component,
      message,
      data,
    };

    const logLine = `${timestamp} [${level}] [${component}] ${message}${data ? ` | Data: ${JSON.stringify(data)}` : ''}\n`;

    // Check if log file is getting too large (with timeout)
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('File operation timeout')), 1000)
    );

    try {
      const fileInfo = await Promise.race([
        FileSystem.getInfoAsync(LOG_FILE),
        timeoutPromise
      ]);
      
      if (fileInfo.exists && fileInfo.size > MAX_LOG_SIZE) {
        await Promise.race([
          rotateLogs(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Log rotation timeout')), 2000)
          )
        ]);
      }

      // Append to log file (with timeout)
      await Promise.race([
        FileSystem.writeAsStringAsync(LOG_FILE, logLine, { append: true }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Write timeout')), 1000)
        )
      ]);
    } catch (fileError) {
      console.warn('File logging failed, using console only:', fileError);
    }

    // Also log to console in development
    if (__DEV__) {
      const consoleMethod = {
        [LOG_LEVELS.DEBUG]: console.debug,
        [LOG_LEVELS.INFO]: console.info,
        [LOG_LEVELS.WARN]: console.warn,
        [LOG_LEVELS.ERROR]: console.error,
      }[level] || console.log;

      consoleMethod(`[${component}] ${message}`, data || '');
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
export async function logUserAction(action, screen, data = null) {
  await log(`User action: ${action}`, LOG_LEVELS.INFO, `SCREEN_${screen}`, data);
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
    
    // Move current log to backup
    await FileSystem.moveAsync({
      from: LOG_FILE,
      to: backupFile,
    });
    
    await log('Log file rotated due to size limit', LOG_LEVELS.INFO, 'LOGGER');
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
    
    // Return most recent lines
    return filteredLines.slice(-lines);
  } catch (error) {
    console.error('Failed to get recent logs:', error);
    return [];
  }
}

/**
 * Export logs for debugging
 */
export async function exportLogs() {
  try {
    const fileInfo = await FileSystem.getInfoAsync(LOG_FILE);
    if (!fileInfo.exists) {
      throw new Error('No log file found');
    }

    return {
      uri: LOG_FILE,
      size: fileInfo.size,
      modifiedTime: fileInfo.modificationTime,
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
    const fileInfo = await FileSystem.getInfoAsync(LOG_FILE);
    if (fileInfo.exists) {
      await FileSystem.deleteAsync(LOG_FILE);
    }
    
    await log('All logs cleared manually', LOG_LEVELS.INFO, 'LOGGER');
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
    const fileInfo = await FileSystem.getInfoAsync(LOG_FILE);
    if (!fileInfo.exists) {
      return {
        exists: false,
        size: 0,
        lineCount: 0,
        lastModified: null,
      };
    }

    const logContent = await FileSystem.readAsStringAsync(LOG_FILE);
    const lines = logContent.split('\n').filter(line => line.trim());
    
    return {
      exists: true,
      size: fileInfo.size,
      lineCount: lines.length,
      lastModified: new Date(fileInfo.modificationTime),
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

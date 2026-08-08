/**
 * Utility functions for calculating and managing streaks
 */

function parseDriveDate(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date(value);
}

/**
 * Calculate the current streak based on drive dates
 * @param {Array} drives - Array of drive objects with date property
 * @param {string} lastDriveDate - Last recorded drive date
 * @returns {number} Current streak count
 */
export function calculateCurrentStreak(drives) {
  if (!drives || drives.length === 0) {
    return 0;
  }

  // Sort drives by date (most recent first)
  const sortedDrives = drives
    .filter(drive => drive.date)
    .sort((a, b) => parseDriveDate(b.date) - parseDriveDate(a.date));

  if (sortedDrives.length === 0) {
    return 0;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  // Get unique drive dates (remove duplicates from same day)
  const uniqueDates = [...new Set(sortedDrives.map(drive => drive.date))];
  
  let streak = 0;
  let checkDate = new Date(today);

  for (const dateStr of uniqueDates) {
    const driveDate = parseDriveDate(dateStr);
    driveDate.setHours(0, 0, 0, 0);

    // Check if this drive date matches our current check date or yesterday
    if (driveDate.getTime() === checkDate.getTime() || 
        driveDate.getTime() === yesterday.getTime()) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else if (driveDate.getTime() < checkDate.getTime()) {
      // Gap found, streak broken
      break;
    }
  }

  return streak;
}

/**
 * Calculate the longest streak from all drives
 * @param {Array} drives - Array of drive objects
 * @returns {number} Longest streak count
 */
export function calculateLongestStreak(drives) {
  if (!drives || drives.length === 0) {
    return 0;
  }

  // Get unique drive dates and sort them
  const uniqueDates = [...new Set(drives.map(drive => drive.date))]
    .filter(date => date)
    .sort((a, b) => parseDriveDate(a) - parseDriveDate(b))
    .map(parseDriveDate);

  if (uniqueDates.length === 0) {
    return 0;
  }

  let longestStreak = 1;
  let currentStreak = 1;

  for (let i = 1; i < uniqueDates.length; i++) {
    const prevDate = uniqueDates[i - 1];
    const currentDate = uniqueDates[i];
    
    // Calculate difference in days
    const diffTime = currentDate - prevDate;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      // Consecutive day
      currentStreak++;
      longestStreak = Math.max(longestStreak, currentStreak);
    } else {
      // Gap found, reset current streak
      currentStreak = 1;
    }
  }

  return longestStreak;
}

/**
 * Check if user can use a freeze day
 * @param {number} freezeDaysUsedThisMonth - Number of freeze days used this month
 * @param {number} maxFreezeDaysPerMonth - Maximum freeze days allowed per month
 * @returns {boolean} Whether user can use a freeze day
 */
export function canUseFreezeDay(freezeDaysUsedThisMonth, maxFreezeDaysPerMonth = 10) {
  return freezeDaysUsedThisMonth < maxFreezeDaysPerMonth;
}

/**
 * Check if we need to reset monthly freeze day counter
 * @param {string} lastResetDate - Last date when freeze days were reset
 * @returns {boolean} Whether to reset the counter
 */
export function shouldResetMonthlyFreezeCounter(lastResetDate) {
  if (!lastResetDate) {
    return true;
  }

  const lastReset = parseDriveDate(lastResetDate);
  const now = new Date();
  
  return lastReset.getMonth() !== now.getMonth() || 
         lastReset.getFullYear() !== now.getFullYear();
}

/**
 * Format date as YYYY-MM-DD
 * @param {Date} date - Date to format
 * @returns {string} Formatted date string
 */
export function formatDateForStorage(date = new Date()) {
  return date.toISOString().split('T')[0];
}

/**
 * Get days since last drive
 * @param {string} lastDriveDate - Last drive date string
 * @returns {number} Number of days since last drive
 */
export function getDaysSinceLastDrive(lastDriveDate) {
  if (!lastDriveDate) {
    return 0;
  }

  const lastDrive = parseDriveDate(lastDriveDate);
  const today = new Date();
  
  lastDrive.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  
  const diffTime = today - lastDrive;
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Check if it's time to suggest a freeze day
 * @param {string} lastDriveDate - Last drive date
 * @param {number} freezeDaysUsedThisMonth - Freeze days used this month
 * @returns {boolean} Whether to suggest a freeze day
 */
export function shouldSuggestFreezeDay(lastDriveDate, freezeDaysUsedThisMonth) {
  const daysSince = getDaysSinceLastDrive(lastDriveDate);
  return daysSince >= 2 && canUseFreezeDay(freezeDaysUsedThisMonth);
}

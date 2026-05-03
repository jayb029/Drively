/**
 * Utility functions for time calculations and formatting
 */

/**
 * Check if a given time falls within night hours
 * @param {string} time - Time in HH:MM format
 * @param {string} nightStart - Night start time (default: 18:00)
 * @param {string} nightEnd - Night end time (default: 06:00)
 * @returns {boolean} Whether the time is during night hours
 */
export function isNightTime(time, nightStart = '18:00', nightEnd = '06:00') {
  const timeMinutes = timeToMinutes(time);
  const startMinutes = timeToMinutes(nightStart);
  const endMinutes = timeToMinutes(nightEnd);

  // Handle case where night hours span midnight
  if (startMinutes > endMinutes) {
    // Night period is from start time until midnight and from 00:00 until end time
    return timeMinutes >= startMinutes || timeMinutes < endMinutes;
  } else {
    // Night period does not span midnight
    return timeMinutes >= startMinutes && timeMinutes < endMinutes;
  }
}

/**
 * Convert time string to minutes since midnight
 * @param {string} time - Time in HH:MM format
 * @returns {number} Minutes since midnight
 */
function timeToMinutes(time) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Calculate duration between two times in minutes
 * @param {string} startTime - Start time in HH:MM format
 * @param {string} endTime - End time in HH:MM format
 * @returns {number} Duration in minutes
 */
export function calculateDuration(startTime, endTime) {
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);
  
  // Handle case where drive spans midnight
  if (endMinutes < startMinutes) {
    return (24 * 60) - startMinutes + endMinutes;
  }
  
  return endMinutes - startMinutes;
}

/**
 * Format minutes to hours and minutes display
 * @param {number} minutes - Total minutes
 * @returns {string} Formatted string like "2h 30m"
 */
export function formatDuration(minutes) {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  if (remainingMinutes === 0) {
    return `${hours}h`;
  }
  
  return `${hours}h ${remainingMinutes}m`;
}

/**
 * Convert minutes to decimal hours
 * @param {number} minutes - Total minutes
 * @returns {number} Decimal hours
 */
export function minutesToHours(minutes) {
  return Math.round((minutes / 60) * 100) / 100;
}

/**
 * Get current time in HH:MM format
 * @returns {string} Current time
 */
export function getCurrentTime() {
  const now = new Date();
  return now.toTimeString().slice(0, 5);
}

/**
 * Get HH:MM time from a timestamp or Date
 * @param {number|string|Date} value - Timestamp, ISO string, or Date
 * @returns {string} Local time
 */
export function getTimeFromDate(value) {
  const date = new Date(value);
  return date.toTimeString().slice(0, 5);
}

/**
 * Get current date in YYYY-MM-DD format
 * @returns {string} Current date
 */
export function getCurrentDate() {
  return getDateFromDate(new Date());
}

/**
 * Get YYYY-MM-DD date from a timestamp or Date using local time
 * @param {number|string|Date} value - Timestamp, ISO string, or Date
 * @returns {string} Local date
 */
export function getDateFromDate(value) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format date for display
 * @param {string} dateString - Date in YYYY-MM-DD format
 * @returns {string} Formatted date like "Dec 15, 2024"
 */
export function formatDateForDisplay(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Format time for display (12-hour format)
 * @param {string} timeString - Time in HH:MM format
 * @returns {string} Formatted time like "6:30 PM"
 */
export function formatTimeForDisplay(timeString) {
  const [hours, minutes] = timeString.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes);
  
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

/**
 * Validate time format
 * @param {string} time - Time string to validate
 * @returns {boolean} Whether time is valid HH:MM format
 */
export function isValidTime(time) {
  const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
  return timeRegex.test(time);
}

/**
 * Validate date format
 * @param {string} date - Date string to validate
 * @returns {boolean} Whether date is valid YYYY-MM-DD format
 */
export function isValidDate(date) {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) return false;
  
  const parsedDate = new Date(date);
  return !isNaN(parsedDate.getTime());
}

/**
 * Get age from date of birth
 * @param {string} birthDate - Birth date in YYYY-MM-DD format
 * @returns {number} Age in years
 */
export function calculateAge(birthDate) {
  const birth = new Date(birthDate);
  const today = new Date();
  
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  
  return age;
}

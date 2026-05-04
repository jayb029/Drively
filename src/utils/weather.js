/**
 * Weather API Utilities for Drively
 * 
 * This module provides utilities for fetching weather data using the custom API.
 */

import { logger, logError } from './logger';

const WEATHER_API_BASE_URL = 'https://api.jaysapps.com/api/weather';

/**
 * Fetch weather data from the custom API
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {string} units - Temperature units ('metric' or 'imperial')
 * @returns {Promise<Object>} Weather data object
 */
export async function fetchWeatherData(lat, lon, units = 'metric') {
  try {
    const coarseLat = Number(lat).toFixed(2);
    const coarseLon = Number(lon).toFixed(2);
    const url = `${WEATHER_API_BASE_URL}?lat=${encodeURIComponent(coarseLat)}&lon=${encodeURIComponent(coarseLon)}&units=${encodeURIComponent(units)}`;
    
    logger.debug('Fetching weather data', 'WEATHER_API', { units });
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Weather API responded with status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.error) {
      throw new Error(`Weather API error: ${data.error}`);
    }
    
    logger.info('Weather data fetched successfully', 'WEATHER_API', {
      location: data.location,
      weather: data.weather,
      temperature: data.temperature,
      isNight: data.isNight
    });
    
    return {
      location: data.location,
      description: data.weather,
      temperature: data.temperature,
      visibility: data.visibility,
      isNight: data.isNight,
      precipitationNextHour: data.precipitationNextHour,
      units: units
    };
    
  } catch (error) {
    logError(error, 'WEATHER_API', 'Failed to fetch weather data');
    
    // Return fallback data
    const tempUnit = units === 'imperial' ? '°F' : '°C';
    const visibilityUnit = units === 'imperial' ? 'mi' : 'km';
    const fallbackTemp = units === 'imperial' ? '68' : '20';
    const fallbackVisibility = units === 'imperial' ? '10.0' : '16.0';
    
    return {
      location: 'Unknown Location',
      description: 'weather data unavailable',
      temperature: `${fallbackTemp} ${tempUnit}`,
      visibility: `${fallbackVisibility} ${visibilityUnit}`,
      isNight: false,
      precipitationNextHour: null,
      units: units,
      isFallback: true
    };
  }
}

/**
 * Auto-select weather option based on description
 * @param {string} description - Weather description from API
 * @param {boolean} isNight - Whether it's currently night time
 * @returns {string} Selected weather option
 */
export function autoSelectWeatherOption(description, isNight = false) {
  const desc = description.toLowerCase();
  
  if (desc.includes('clear') || desc.includes('sunny')) {
    return isNight ? '🌙 Clear Night' : '☀️ Clear';
  } else if (desc.includes('partly cloudy') || desc.includes('partly')) {
    return '⛅ Partly Cloudy';
  } else if (desc.includes('cloudy') || desc.includes('overcast')) {
    return '☁️ Cloudy';
  } else if (desc.includes('rain') || desc.includes('drizzle')) {
    return '🌧️ Rain';
  } else if (desc.includes('snow') || desc.includes('blizzard')) {
    return '🌨️ Snow';
  } else if (desc.includes('fog') || desc.includes('mist')) {
    return '🌫️ Fog';
  } else if (desc.includes('wind')) {
    return '💨 Windy';
  }
  
  // Default fallback
  return isNight ? '🌙 Clear Night' : '☀️ Clear';
}

/**
 * Format temperature display with unit preference
 * @param {number} tempValue - Temperature value
 * @param {string} units - Unit system ('metric' or 'imperial')
 * @returns {string} Formatted temperature string
 */
export function formatTemperature(tempValue, units = 'metric') {
  const tempUnit = units === 'imperial' ? '°F' : '°C';
  return `${Math.round(tempValue)} ${tempUnit}`;
}

/**
 * Convert temperature between units
 * @param {number} temp - Temperature value
 * @param {string} fromUnit - Source unit ('metric' or 'imperial')
 * @param {string} toUnit - Target unit ('metric' or 'imperial')
 * @returns {number} Converted temperature
 */
export function convertTemperature(temp, fromUnit, toUnit) {
  if (fromUnit === toUnit) return temp;
  
  if (fromUnit === 'metric' && toUnit === 'imperial') {
    // Celsius to Fahrenheit
    return (temp * 9/5) + 32;
  } else if (fromUnit === 'imperial' && toUnit === 'metric') {
    // Fahrenheit to Celsius
    return (temp - 32) * 5/9;
  }
  
  return temp;
}

/**
 * Weather helpers backed by Open-Meteo's public, keyless forecast API.
 */
import { logger, logError } from './logger';

const WEATHER_API_BASE_URL = 'https://api.open-meteo.com/v1/forecast';

const WEATHER_CODES = {
  0: 'clear sky',
  1: 'mainly clear',
  2: 'partly cloudy',
  3: 'overcast',
  45: 'fog',
  48: 'freezing fog',
  51: 'light drizzle',
  53: 'drizzle',
  55: 'heavy drizzle',
  56: 'freezing drizzle',
  57: 'heavy freezing drizzle',
  61: 'light rain',
  63: 'rain',
  65: 'heavy rain',
  66: 'freezing rain',
  67: 'heavy freezing rain',
  71: 'light snow',
  73: 'snow',
  75: 'heavy snow',
  77: 'snow grains',
  80: 'light rain showers',
  81: 'rain showers',
  82: 'heavy rain showers',
  85: 'light snow showers',
  86: 'heavy snow showers',
  95: 'thunderstorm',
  96: 'thunderstorm with hail',
  99: 'severe thunderstorm with hail',
};

export async function fetchWeatherData(lat, lon, units = 'metric') {
  try {
    const coarseLat = Number(lat).toFixed(2);
    const coarseLon = Number(lon).toFixed(2);
    const params = new URLSearchParams({
      latitude: coarseLat,
      longitude: coarseLon,
      current: 'temperature_2m,weather_code,is_day,visibility,precipitation',
      temperature_unit: units === 'imperial' ? 'fahrenheit' : 'celsius',
      precipitation_unit: units === 'imperial' ? 'inch' : 'mm',
      timezone: 'auto',
      forecast_days: '1',
    });

    logger.debug('Fetching weather data', 'WEATHER_API', { provider: 'Open-Meteo', units });
    const response = await fetch(`${WEATHER_API_BASE_URL}?${params.toString()}`);
    if (!response.ok) throw new Error(`Open-Meteo responded with status ${response.status}`);

    const data = await response.json();
    if (data.error || !data.current) throw new Error(data.reason || 'Open-Meteo returned no current conditions');

    const current = data.current;
    const temperatureUnit = data.current_units?.temperature_2m || (units === 'imperial' ? '°F' : '°C');
    const visibilityValue = Number(current.visibility);
    const visibilityUnit = data.current_units?.visibility;
    const visibility = Number.isFinite(visibilityValue)
      ? units === 'imperial'
        ? `${(visibilityValue / (visibilityUnit === 'ft' ? 5280 : 1609.344)).toFixed(1)} mi`
        : `${(visibilityValue / 1000).toFixed(1)} km`
      : null;
    const description = WEATHER_CODES[current.weather_code] || 'unknown conditions';

    logger.info('Weather data fetched successfully', 'WEATHER_API', {
      provider: 'Open-Meteo',
      weatherCode: current.weather_code,
      units,
    });

    return {
      location: 'Current area',
      description,
      temperature: `${Math.round(current.temperature_2m)} ${temperatureUnit}`,
      visibility,
      isNight: current.is_day === 0,
      precipitationNextHour: current.precipitation ?? null,
      units,
      provider: 'Open-Meteo',
    };
  } catch (error) {
    logError(error, 'WEATHER_API', 'Failed to fetch weather data');
    return {
      location: 'Current area',
      description: 'weather data unavailable',
      temperature: 'Unavailable',
      visibility: null,
      isNight: false,
      precipitationNextHour: null,
      units,
      provider: 'Open-Meteo',
      isFallback: true,
    };
  }
}

export function autoSelectWeatherOption(description, isNight = false) {
  const desc = description.toLowerCase();
  if (desc.includes('clear') || desc.includes('sunny')) return isNight ? '🌙 Clear Night' : '☀️ Clear';
  if (desc.includes('partly') || desc.includes('mainly clear')) return '⛅ Partly Cloudy';
  if (desc.includes('cloud') || desc.includes('overcast')) return '☁️ Cloudy';
  if (desc.includes('rain') || desc.includes('drizzle') || desc.includes('thunderstorm')) return '🌧️ Rain';
  if (desc.includes('snow') || desc.includes('blizzard')) return '🌨️ Snow';
  if (desc.includes('fog') || desc.includes('mist')) return '🌫️ Fog';
  if (desc.includes('wind')) return '💨 Windy';
  return '';
}

export function formatTemperature(tempValue, units = 'metric') {
  const tempUnit = units === 'imperial' ? '°F' : '°C';
  return `${Math.round(tempValue)} ${tempUnit}`;
}

export function convertTemperature(temp, fromUnit, toUnit) {
  if (fromUnit === toUnit) return temp;
  if (fromUnit === 'metric' && toUnit === 'imperial') return (temp * 9 / 5) + 32;
  if (fromUnit === 'imperial' && toUnit === 'metric') return (temp - 32) * 5 / 9;
  return temp;
}

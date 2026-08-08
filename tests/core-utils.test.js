import * as Haptics from 'expo-haptics';
import {
  calculateAge,
  calculateDuration,
  formatDateForDisplay,
  formatDateOfBirthFromDate,
  formatDateOfBirthInput,
  formatDuration,
  formatTimeForDisplay,
  getDateFromDate,
  getDateOfBirthDate,
  getTimeFromDate,
  isNightTime,
  isValidDate,
  isValidDateOfBirth,
  isValidTime,
  minutesToHours,
} from '../src/utils/time';
import {
  formatDistanceFromKm,
  formatSpeedFromKmh,
  getDistanceUnitLabel,
  getSpeedUnitLabel,
} from '../src/utils/units';
import {
  calculateCurrentStreak,
  calculateLongestStreak,
  canUseFreezeDay,
  formatDateForStorage,
  getDaysSinceLastDrive,
  shouldResetMonthlyFreezeCounter,
  shouldSuggestFreezeDay,
} from '../src/utils/streaks';
import {
  NIGHT_DEBUG_OVERRIDES,
  NIGHT_DRIVING_METHODS,
  applyNightMinuteAdjustment,
  buildAdjustedClassificationSegments,
  calculateNightDrivingSegments,
  calculateNightDrivingSplit,
  getDriveDayMinutes,
  getDriveNightMinutes,
  getDriveTypeLabel,
  getNightCalculationLabel,
  getSunAltitudeDegrees,
  normalizeDriveNightFields,
  sumDriveMinutes,
} from '../src/utils/nightDriving';
import {
  autoSelectWeatherOption,
  convertTemperature,
  fetchWeatherData,
  formatTemperature,
} from '../src/utils/weather';
import { createDevDrivingData } from '../src/utils/devData';
import { getAppName, getAppVersion } from '../src/utils/appInfo';
import { haptics, withHaptic } from '../src/utils/haptics';
import {
  generateDrivingReportHTML,
  generatePDFReport,
  generateProgressSummaryHTML,
} from '../src/utils/pdf';
import * as Print from 'expo-print';

describe('time, units, and streak calculations', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-08T12:00:00Z'));
  });

  afterEach(() => jest.useRealTimers());

  test('handles clock windows, durations, formatting, and validation boundaries', () => {
    expect(isNightTime('23:30')).toBe(true);
    expect(isNightTime('12:00')).toBe(false);
    expect(isNightTime('10:30', '09:00', '11:00')).toBe(true);
    expect(calculateDuration('23:30', '00:30')).toBe(60);
    expect(calculateDuration('bad', '10:00')).toBeNaN();
    expect(formatDuration(125)).toBe('2h 5m');
    expect(formatDuration(0)).toBe('0m');
    expect(minutesToHours(90)).toBe(1.5);
    expect(getTimeFromDate(new Date('2026-08-08T14:05:00'))).toBe('14:05');
    expect(getDateFromDate(new Date('2026-08-08T14:05:00'))).toBe('2026-08-08');
    expect(formatDateForDisplay('2026-08-08')).toMatch(/Aug/);
    expect(formatTimeForDisplay('18:05')).toMatch(/6:05/);
    expect(isValidTime('23:59')).toBe(true);
    expect(isValidTime('24:00')).toBe(false);
    expect(isValidDate('2026-08-08')).toBe(true);
    expect(isValidDate('2026-02-30')).toBe(false);
    expect(formatDateOfBirthInput('01022010')).toBe('01/02/2010');
    expect(formatDateOfBirthFromDate(new Date(2010, 0, 2))).toBe('01/02/2010');
    expect(getDateOfBirthDate('01/02/2010')).toEqual(new Date(2010, 0, 2));
    expect(isValidDateOfBirth('01/02/2010')).toBe(true);
    expect(isValidDateOfBirth('01/02/2030')).toBe(false);
    expect(calculateAge('01/02/2010')).toBe(16);
    expect(calculateAge('not-a-date')).toBeNull();
  });

  test('formats metric and imperial distances and speeds', () => {
    expect(getDistanceUnitLabel('metric')).toBe('km');
    expect(getDistanceUnitLabel('imperial')).toBe('mi');
    expect(getSpeedUnitLabel('metric')).toBe('km/h');
    expect(getSpeedUnitLabel('imperial')).toBe('mph');
    expect(formatDistanceFromKm(10, 'metric')).toBe('10.00 km');
    expect(formatDistanceFromKm(10, 'imperial')).toBe('6.21 mi');
    expect(formatSpeedFromKmh(100, 'metric')).toBe('100 km/h');
    expect(formatSpeedFromKmh(100, 'imperial')).toBe('62 mph');
  });

  test('calculates streaks, monthly resets, and freeze suggestions', () => {
    const drives = [{ date: '2026-08-08' }, { date: '2026-08-07' }, { date: '2026-08-05' }];
    expect(calculateCurrentStreak(drives)).toBe(2);
    expect(calculateLongestStreak(drives)).toBe(2);
    expect(calculateCurrentStreak([])).toBe(0);
    expect(calculateLongestStreak([])).toBe(0);
    expect(canUseFreezeDay(9)).toBe(true);
    expect(canUseFreezeDay(10)).toBe(false);
    expect(shouldResetMonthlyFreezeCounter('2026-08-01')).toBe(false);
    expect(shouldResetMonthlyFreezeCounter('2026-07-31')).toBe(true);
    expect(formatDateForStorage(new Date('2026-08-08T12:00:00Z'))).toBe('2026-08-08');
    expect(getDaysSinceLastDrive('2026-08-06')).toBe(2);
    expect(shouldSuggestFreezeDay('2026-08-06', 0)).toBe(true);
  });
});

describe('night-driving engine', () => {
  const start = Date.parse('2026-06-21T17:00:00');
  const end = Date.parse('2026-06-21T19:00:00');
  const chicago = [{ latitude: 41.8781, longitude: -87.6298, timestamp: start }];

  test('covers fixed hours, twilight, overrides, fallback, and adjustments', () => {
    expect(getSunAltitudeDegrees(Date.parse('2026-06-21T18:00:00Z'), 41.8781, -87.6298)).toBeGreaterThan(0);
    expect(getSunAltitudeDegrees(Date.parse('2026-06-21T06:00:00Z'), 41.8781, -87.6298)).toBeLessThan(-6);

    const fixed = calculateNightDrivingSplit({
      durationMinutes: 120,
      method: NIGHT_DRIVING_METHODS.CUSTOM_HOURS,
      nightStart: '18:00',
      nightEnd: '06:00',
      startTimestamp: start,
      endTimestamp: end,
    });
    expect([fixed.dayMinutes, fixed.nightMinutes]).toEqual([60, 60]);

    const day = calculateNightDrivingSplit({
      debugOverride: NIGHT_DEBUG_OVERRIDES.DAY,
      durationMinutes: 60,
      startTimestamp: start,
      endTimestamp: start + 3600000,
      routePoints: chicago,
    });
    expect([day.dayMinutes, day.nightMinutes]).toEqual([60, 0]);
    expect(calculateNightDrivingSplit({
      debugOverride: NIGHT_DEBUG_OVERRIDES.NIGHT,
      durationMinutes: 60,
      startTimestamp: start,
      endTimestamp: start + 3600000,
      routePoints: chicago,
    }).nightMinutes).toBe(60);

    const twilightSegments = calculateNightDrivingSegments({
      method: NIGHT_DRIVING_METHODS.CIVIL_TWILIGHT,
      startTimestamp: Date.parse('2026-06-22T00:30:00Z'),
      endTimestamp: Date.parse('2026-06-22T03:00:00Z'),
      routePoints: chicago,
    });
    expect(twilightSegments.length).toBeGreaterThanOrEqual(1);

    const fallback = calculateNightDrivingSplit({
      durationMinutes: 60,
      method: NIGHT_DRIVING_METHODS.CIVIL_TWILIGHT,
      startTimestamp: start,
      endTimestamp: start + 3600000,
      routePoints: [],
    });
    expect(fallback.nightCalculation.source).toBe('fixed_hours_fallback');

    const legacy = normalizeDriveNightFields({ duration: 45, isNightDrive: true });
    expect([getDriveDayMinutes(legacy), getDriveNightMinutes(legacy)]).toEqual([0, 45]);
    expect(getDriveTypeLabel(legacy)).toBe('Night');
    expect(getNightCalculationLabel(legacy.nightCalculation)).toBeTruthy();
    const adjusted = applyNightMinuteAdjustment(day, 17);
    expect([adjusted.dayMinutes, adjusted.nightMinutes]).toEqual([43, 17]);
    expect(buildAdjustedClassificationSegments({
      duration: 60,
      startedAt: new Date(start).toISOString(),
      endedAt: new Date(start + 3600000).toISOString(),
      nightCalculation: day.nightCalculation,
    }, 17)).toHaveLength(2);
    expect(sumDriveMinutes([legacy, { ...adjusted, duration: 60 }])).toEqual({ totalMinutes: 105, dayMinutes: 43, nightMinutes: 62 });
  });
});

describe('weather, developer data, app info, haptics, and reports', () => {
  afterEach(() => {
    jest.useRealTimers();
    global.fetch.mockReset();
  });

  test('maps weather data and returns a safe fallback on provider errors', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        current: { temperature_2m: 22.6, weather_code: 2, is_day: 1, visibility: 10000, precipitation: 0 },
        current_units: { temperature_2m: '°C', visibility: 'm' },
      }),
    });
    await expect(fetchWeatherData(41.8781, -87.6298)).resolves.toMatchObject({
      description: 'partly cloudy', temperature: '23 °C', visibility: '10.0 km',
    });
    expect(global.fetch.mock.calls[0][0]).toContain('latitude=41.88');

    global.fetch.mockRejectedValueOnce(new Error('offline'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(fetchWeatherData(0, 0, 'imperial')).resolves.toMatchObject({ isFallback: true, units: 'imperial' });
    expect(autoSelectWeatherOption('clear sky', true)).toContain('Clear Night');
    expect(autoSelectWeatherOption('heavy snow')).toContain('Snow');
    expect(autoSelectWeatherOption('unknown')).toBe('');
    expect(formatTemperature(21.7)).toBe('22 °C');
    expect(convertTemperature(0, 'metric', 'imperial')).toBe(32);
    expect(convertTemperature(32, 'imperial', 'metric')).toBe(0);
  });

  test('creates coherent simulated driving data without deleting existing records', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-08T12:00:00Z'));
    const seeded = createDevDrivingData({
      user: { goalDayHours: 2, goalNightHours: 1 },
      drives: [{ id: 'keep', date: '2026-08-08', duration: 60, dayMinutes: 60, nightMinutes: 0 }],
    });
    expect(seeded.drives.some(({ id }) => id === 'keep')).toBe(true);
    expect(seeded.supervisorProfiles.length).toBeGreaterThan(0);
    expect(seeded.user.completedDayHours + seeded.user.completedNightHours).toBeGreaterThanOrEqual(2);
  });

  test('reads app metadata and makes haptic wrappers failure-safe', async () => {
    expect(getAppName()).toBe('Drively');
    expect(getAppVersion()).toBe('1.0.0');

    await haptics.action();
    expect(Haptics.impactAsync).toHaveBeenCalled();
    const action = jest.fn();
    const wrapped = withHaptic(action);
    wrapped('value');
    expect(action).toHaveBeenCalledWith('value');
  });

  test('escapes report content and creates PDF and progress artifacts', async () => {
    const data = {
      drives: [{ id: '1', date: '2026-08-08', duration: 60, dayMinutes: 60, nightMinutes: 0, destination: '<script>x</script>' }],
      supervisorProfiles: [],
      user: { driverName: '<Jay>', goalDayHours: 50, goalNightHours: 10, completedDayHours: 1, completedNightHours: 0 },
      streaks: { current: 1, longest: 2, freezeDaysThisMonth: 0 },
    };
    const report = generateDrivingReportHTML(data, true);
    expect(report).toContain('&lt;Jay&gt;');
    expect(report).not.toContain('<script>x</script>');
    expect(generateProgressSummaryHTML(data)).toContain('My Driving Progress');
    await expect(generatePDFReport(data, 'report.pdf')).resolves.toBe('file:///documents/report.pdf');
    expect(Print.printToFileAsync).toHaveBeenCalled();
  });
});

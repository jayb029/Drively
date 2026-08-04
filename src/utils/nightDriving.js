import { isNightTime } from './time';

export const NIGHT_DRIVING_METHODS = {
  CIVIL_TWILIGHT: 'civil_twilight',
  SUNSET_TO_SUNRISE: 'sunset_to_sunrise',
  CUSTOM_HOURS: 'custom_hours',
};

export const NIGHT_DEBUG_OVERRIDES = { AUTO: 'auto', DAY: 'day', NIGHT: 'night' };
export const NIGHT_CALCULATION_VERSION = 1;

const RAD = Math.PI / 180;
const SAMPLE_MS = 30000;
const THRESHOLDS = {
  [NIGHT_DRIVING_METHODS.CIVIL_TWILIGHT]: -6,
  [NIGHT_DRIVING_METHODS.SUNSET_TO_SUNRISE]: -0.833,
};

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const finite = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));

function normalizePoints(routePoints) {
  if (!Array.isArray(routePoints)) return [];
  return routePoints
    .filter((point) => finite(point?.latitude) && finite(point?.longitude) && finite(point?.timestamp))
    .map((point) => ({
      latitude: Number(point.latitude),
      longitude: Number(point.longitude),
      timestamp: Number(point.timestamp),
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
}

function locationAt(points, timestamp) {
  if (!points.length) return null;
  if (timestamp <= points[0].timestamp) return points[0];
  if (timestamp >= points[points.length - 1].timestamp) return points[points.length - 1];

  for (let index = 1; index < points.length; index += 1) {
    const next = points[index];
    if (next.timestamp < timestamp) continue;
    const previous = points[index - 1];
    const progress = clamp((timestamp - previous.timestamp) / Math.max(1, next.timestamp - previous.timestamp), 0, 1);
    return {
      latitude: previous.latitude + ((next.latitude - previous.latitude) * progress),
      longitude: previous.longitude + ((next.longitude - previous.longitude) * progress),
    };
  }
  return points[points.length - 1];
}

export function getSunAltitudeDegrees(timestamp, latitude, longitude) {
  const days = (Number(timestamp) / 86400000) + 2440587.5 - 2451545;
  const anomaly = RAD * (357.5291 + (0.98560028 * days));
  const center = RAD * (
    (1.9148 * Math.sin(anomaly)) +
    (0.02 * Math.sin(2 * anomaly)) +
    (0.0003 * Math.sin(3 * anomaly))
  );
  const longitudeEcliptic = anomaly + center + (102.9372 * RAD) + Math.PI;
  const obliquity = 23.4397 * RAD;
  const declination = Math.asin(Math.sin(longitudeEcliptic) * Math.sin(obliquity));
  const rightAscension = Math.atan2(
    Math.sin(longitudeEcliptic) * Math.cos(obliquity),
    Math.cos(longitudeEcliptic)
  );
  const sidereal = (RAD * (280.16 + (360.9856235 * days))) + (Number(longitude) * RAD);
  const latitudeRadians = Number(latitude) * RAD;
  return Math.asin(
    (Math.sin(latitudeRadians) * Math.sin(declination)) +
    (Math.cos(latitudeRadians) * Math.cos(declination) * Math.cos(sidereal - rightAscension))
  ) / RAD;
}

function fixedWindowNight(timestamp, nightStart, nightEnd) {
  const date = new Date(timestamp);
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return isNightTime(time, nightStart, nightEnd);
}

function sampledNightMs(startTimestamp, endTimestamp, isNightAt) {
  let total = 0;
  for (let start = startTimestamp; start < endTimestamp; start += SAMPLE_MS) {
    const end = Math.min(start + SAMPLE_MS, endTimestamp);
    if (isNightAt(start + ((end - start) / 2))) total += end - start;
  }
  return total;
}

function getClassificationContext({
  debugOverride,
  method,
  nightEnd,
  nightStart,
  routePoints,
}) {
  const requestedMethod = Object.values(NIGHT_DRIVING_METHODS).includes(method)
    ? method
    : NIGHT_DRIVING_METHODS.CIVIL_TWILIGHT;

  if (debugOverride === NIGHT_DEBUG_OVERRIDES.DAY || debugOverride === NIGHT_DEBUG_OVERRIDES.NIGHT) {
    return {
      isNightAt: () => debugOverride === NIGHT_DEBUG_OVERRIDES.NIGHT,
      metadata: {
        requestedMethod,
        methodUsed: 'debug_override',
        source: 'debug',
        debugOverride,
      },
    };
  }

  const points = normalizePoints(routePoints);
  const solar = requestedMethod !== NIGHT_DRIVING_METHODS.CUSTOM_HOURS && points.length > 0;
  const methodUsed = solar ? requestedMethod : NIGHT_DRIVING_METHODS.CUSTOM_HOURS;
  const source = solar
    ? (points.length > 1 ? 'route' : 'single_location')
    : (requestedMethod === NIGHT_DRIVING_METHODS.CUSTOM_HOURS ? 'custom_hours' : 'fixed_hours_fallback');

  return {
    isNightAt: solar
      ? (timestamp) => {
        const point = locationAt(points, timestamp);
        return getSunAltitudeDegrees(timestamp, point.latitude, point.longitude) <= THRESHOLDS[requestedMethod];
      }
      : (timestamp) => fixedWindowNight(timestamp, nightStart, nightEnd),
    metadata: {
      requestedMethod,
      methodUsed,
      source,
      thresholdDegrees: THRESHOLDS[methodUsed] ?? null,
      fallbackNightStart: methodUsed === NIGHT_DRIVING_METHODS.CUSTOM_HOURS ? nightStart : null,
      fallbackNightEnd: methodUsed === NIGHT_DRIVING_METHODS.CUSTOM_HOURS ? nightEnd : null,
    },
  };
}

export function calculateNightDrivingSegments({
  debugOverride = NIGHT_DEBUG_OVERRIDES.AUTO,
  endTimestamp,
  method = NIGHT_DRIVING_METHODS.CIVIL_TWILIGHT,
  nightEnd = '06:00',
  nightStart = '18:00',
  routePoints = [],
  startTimestamp,
}) {
  const start = Number(startTimestamp);
  const end = Number(endTimestamp);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];

  const { isNightAt, metadata } = getClassificationContext({
    debugOverride,
    method,
    nightEnd,
    nightStart,
    routePoints,
  });
  const segments = [];

  for (let sampleStart = start; sampleStart < end; sampleStart += SAMPLE_MS) {
    const sampleEnd = Math.min(sampleStart + SAMPLE_MS, end);
    const isNightDrive = isNightAt(sampleStart + ((sampleEnd - sampleStart) / 2));
    const previous = segments[segments.length - 1];

    if (previous?.isNightDrive === isNightDrive) {
      previous.endTimestamp = sampleEnd;
      previous.durationMinutes = Number(((previous.endTimestamp - previous.startTimestamp) / 60000).toFixed(2));
      continue;
    }

    segments.push({
      startTimestamp: sampleStart,
      endTimestamp: sampleEnd,
      durationMinutes: Number(((sampleEnd - sampleStart) / 60000).toFixed(2)),
      dayMinutes: isNightDrive ? 0 : Number(((sampleEnd - sampleStart) / 60000).toFixed(2)),
      nightMinutes: isNightDrive ? Number(((sampleEnd - sampleStart) / 60000).toFixed(2)) : 0,
      isNightDrive,
      classification: isNightDrive ? 'night' : 'day',
      nightCalculation: {
        version: NIGHT_CALCULATION_VERSION,
        automaticNightMinutes: null,
        manuallyAdjusted: false,
        ...metadata,
      },
    });
  }

  return segments.map((segment) => ({
    ...segment,
    dayMinutes: segment.isNightDrive ? 0 : segment.durationMinutes,
    nightMinutes: segment.isNightDrive ? segment.durationMinutes : 0,
  }));
}

export function calculateNightDrivingSplit({
  debugOverride = NIGHT_DEBUG_OVERRIDES.AUTO,
  durationMinutes,
  endTimestamp,
  method = NIGHT_DRIVING_METHODS.CIVIL_TWILIGHT,
  nightEnd = '06:00',
  nightStart = '18:00',
  routePoints = [],
  startTimestamp,
}) {
  const start = Number(startTimestamp);
  const end = Number(endTimestamp);
  const validTimestamps = Number.isFinite(start) && Number.isFinite(end) && end > start;
  const duration = Math.max(1, Math.round(Number(durationMinutes) || ((end - start) / 60000) || 1));
  const { isNightAt, metadata } = getClassificationContext({
    debugOverride,
    method,
    nightEnd,
    nightStart,
    routePoints,
  });

  let nightMilliseconds;
  if (!validTimestamps) {
    nightMilliseconds = fixedWindowNight(start || Date.now(), nightStart, nightEnd) ? duration * 60000 : 0;
  } else {
    nightMilliseconds = sampledNightMs(start, end, isNightAt);
  }

  const totalMilliseconds = validTimestamps ? end - start : duration * 60000;
  const nightMinutes = clamp(Math.round(duration * (nightMilliseconds / totalMilliseconds)), 0, duration);
  return makeSplit(duration, nightMinutes, metadata);
}

function makeSplit(duration, nightMinutes, metadata) {
  return {
    dayMinutes: duration - nightMinutes,
    nightMinutes,
    isNightDrive: nightMinutes > 0,
    nightCalculation: {
      version: NIGHT_CALCULATION_VERSION,
      automaticNightMinutes: nightMinutes,
      manuallyAdjusted: false,
      ...metadata,
    },
  };
}

export function normalizeDriveNightFields(drive = {}) {
  const duration = Math.max(0, Math.round(Number(drive.duration ?? drive.durationMinutes) || 0));
  if (finite(drive.dayMinutes) || finite(drive.nightMinutes)) {
    const nightMinutes = clamp(Math.round(Number(drive.nightMinutes) || 0), 0, duration);
    return {
      ...drive,
      duration,
      dayMinutes: duration - nightMinutes,
      nightMinutes,
      isNightDrive: nightMinutes > 0,
      nightCalculation: drive.nightCalculation || {
        version: NIGHT_CALCULATION_VERSION,
        methodUsed: 'stored_split',
        source: 'stored',
        automaticNightMinutes: nightMinutes,
        manuallyAdjusted: false,
      },
    };
  }

  const nightMinutes = drive.isNightDrive === true ? duration : 0;
  return {
    ...drive,
    duration,
    dayMinutes: duration - nightMinutes,
    nightMinutes,
    isNightDrive: nightMinutes > 0,
    nightCalculation: {
      version: NIGHT_CALCULATION_VERSION,
      requestedMethod: 'legacy_fixed_window',
      methodUsed: 'legacy_fixed_window',
      source: 'legacy',
      automaticNightMinutes: nightMinutes,
      manuallyAdjusted: false,
    },
  };
}

export function applyNightMinuteAdjustment(split, requestedNightMinutes) {
  const duration = Math.max(0, Math.round(Number(split.dayMinutes || 0) + Number(split.nightMinutes || 0)));
  const nightMinutes = clamp(Math.round(Number(requestedNightMinutes) || 0), 0, duration);
  const automatic = Number(split.nightCalculation?.automaticNightMinutes ?? split.nightMinutes ?? 0);
  return {
    ...split,
    dayMinutes: duration - nightMinutes,
    nightMinutes,
    isNightDrive: nightMinutes > 0,
    nightCalculation: {
      ...(split.nightCalculation || {}),
      automaticNightMinutes: automatic,
      manuallyAdjusted: nightMinutes !== automatic,
    },
  };
}

export function buildAdjustedClassificationSegments(drive, requestedNightMinutes) {
  const duration = Math.max(0, Math.round(Number(drive?.duration) || 0));
  const nightMinutes = clamp(Math.round(Number(requestedNightMinutes) || 0), 0, duration);
  const tracked = Array.isArray(drive?.segments) && drive.segments.length
    ? drive.segments
    : [{
      startTimestamp: Date.parse(drive?.startedAt),
      endTimestamp: Date.parse(drive?.endedAt),
    }];
  const intervals = tracked
    .map((segment, index) => ({
      startTimestamp: Number(segment.startTimestamp),
      endTimestamp: Number(segment.endTimestamp),
      trackingSegmentIndex: index + 1,
    }))
    .filter((segment) => Number.isFinite(segment.startTimestamp) && Number.isFinite(segment.endTimestamp) && segment.endTimestamp > segment.startTimestamp);

  if (!intervals.length) return drive?.classificationSegments || [];

  const existing = Array.isArray(drive?.classificationSegments) ? drive.classificationSegments : [];
  const nightAtStart = existing[0]?.isNightDrive === true;
  const nightAtEnd = existing[existing.length - 1]?.isNightDrive === true;
  const allocateFromStart = nightAtStart && !nightAtEnd;
  let remainingNightMs = nightMinutes * 60000;
  const ordered = allocateFromStart ? intervals : [...intervals].reverse();
  const adjusted = [];

  ordered.forEach((interval) => {
    const intervalMs = interval.endTimestamp - interval.startTimestamp;
    const intervalNightMs = Math.min(intervalMs, remainingNightMs);
    remainingNightMs -= intervalNightMs;

    const pieces = [];
    if (allocateFromStart) {
      if (intervalNightMs > 0) {
        pieces.push({ startTimestamp: interval.startTimestamp, endTimestamp: interval.startTimestamp + intervalNightMs, isNightDrive: true });
      }
      if (intervalNightMs < intervalMs) {
        pieces.push({ startTimestamp: interval.startTimestamp + intervalNightMs, endTimestamp: interval.endTimestamp, isNightDrive: false });
      }
    } else {
      if (intervalNightMs < intervalMs) {
        pieces.push({ startTimestamp: interval.startTimestamp, endTimestamp: interval.endTimestamp - intervalNightMs, isNightDrive: false });
      }
      if (intervalNightMs > 0) {
        pieces.push({ startTimestamp: interval.endTimestamp - intervalNightMs, endTimestamp: interval.endTimestamp, isNightDrive: true });
      }
    }

    adjusted.push(...pieces.map((piece) => {
      const durationMinutes = Number(((piece.endTimestamp - piece.startTimestamp) / 60000).toFixed(2));
      return {
        ...piece,
        trackingSegmentIndex: interval.trackingSegmentIndex,
        durationMinutes,
        dayMinutes: piece.isNightDrive ? 0 : durationMinutes,
        nightMinutes: piece.isNightDrive ? durationMinutes : 0,
        classification: piece.isNightDrive ? 'night' : 'day',
        nightCalculation: {
          ...(drive?.nightCalculation || {}),
          manuallyAdjusted: true,
        },
      };
    }));
  });

  return adjusted.sort((a, b) => a.startTimestamp - b.startTimestamp);
}

export const getDriveDayMinutes = (drive) => normalizeDriveNightFields(drive).dayMinutes;
export const getDriveNightMinutes = (drive) => normalizeDriveNightFields(drive).nightMinutes;

export function getDriveTypeLabel(drive) {
  const { dayMinutes, nightMinutes } = normalizeDriveNightFields(drive);
  if (dayMinutes > 0 && nightMinutes > 0) return 'Day + night';
  return nightMinutes > 0 ? 'Night' : 'Day';
}

export function getNightCalculationLabel(calculation = {}) {
  if (calculation.manuallyAdjusted) return 'Manually adjusted';
  if (calculation.methodUsed === 'debug_override') return `Debug ${calculation.debugOverride}`;
  if (calculation.methodUsed === NIGHT_DRIVING_METHODS.CIVIL_TWILIGHT) return 'Civil twilight';
  if (calculation.methodUsed === NIGHT_DRIVING_METHODS.SUNSET_TO_SUNRISE) return 'Sunset to sunrise';
  if (calculation.methodUsed === 'legacy_fixed_window') return 'Legacy classification';
  if (calculation.source === 'fixed_hours_fallback') return 'Custom hours fallback';
  return 'Custom hours';
}

export function sumDriveMinutes(drives = []) {
  return drives.reduce((totals, drive) => {
    const normalized = normalizeDriveNightFields(drive);
    return {
      totalMinutes: totals.totalMinutes + normalized.duration,
      dayMinutes: totals.dayMinutes + normalized.dayMinutes,
      nightMinutes: totals.nightMinutes + normalized.nightMinutes,
    };
  }, { totalMinutes: 0, dayMinutes: 0, nightMinutes: 0 });
}

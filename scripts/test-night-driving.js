const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');

function loadSourceModule(relativePath, mockedModules = {}) {
  const absolutePath = path.join(__dirname, '..', relativePath);
  const source = fs.readFileSync(absolutePath, 'utf8');
  const transformed = babel.transformSync(source, {
    filename: absolutePath,
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  });
  const module = { exports: {} };
  const localRequire = (request) => {
    if (mockedModules[request]) return mockedModules[request];
    return require(request);
  };
  Function('require', 'module', 'exports', transformed.code)(localRequire, module, module.exports);
  return module.exports;
}

process.env.TZ = 'UTC';
const time = loadSourceModule('src/utils/time.js');
const night = loadSourceModule('src/utils/nightDriving.js', { './time': time });
const pdf = loadSourceModule('src/utils/pdf.js', {
  './time': time,
  './nightDriving': night,
  'expo-print': {},
  'expo-file-system/legacy': {},
});

const chicago = [{ latitude: 41.8781, longitude: -87.6298, timestamp: Date.parse('2026-06-21T18:00:00Z') }];
assert(night.getSunAltitudeDegrees(Date.parse('2026-06-21T18:00:00Z'), 41.8781, -87.6298) > 0);
assert(night.getSunAltitudeDegrees(Date.parse('2026-06-21T06:00:00Z'), 41.8781, -87.6298) < -6);

const forcedDay = night.calculateNightDrivingSplit({
  debugOverride: night.NIGHT_DEBUG_OVERRIDES.DAY,
  durationMinutes: 60,
  startTimestamp: Date.parse('2026-06-21T06:00:00Z'),
  endTimestamp: Date.parse('2026-06-21T07:00:00Z'),
  routePoints: chicago,
});
assert.deepEqual([forcedDay.dayMinutes, forcedDay.nightMinutes], [60, 0]);

const forcedNight = night.calculateNightDrivingSplit({
  debugOverride: night.NIGHT_DEBUG_OVERRIDES.NIGHT,
  durationMinutes: 60,
  startTimestamp: Date.parse('2026-06-21T18:00:00Z'),
  endTimestamp: Date.parse('2026-06-21T19:00:00Z'),
  routePoints: chicago,
});
assert.deepEqual([forcedNight.dayMinutes, forcedNight.nightMinutes], [0, 60]);

const fixedCrossMidnight = night.calculateNightDrivingSplit({
  durationMinutes: 120,
  method: night.NIGHT_DRIVING_METHODS.CUSTOM_HOURS,
  nightStart: '18:00',
  nightEnd: '06:00',
  startTimestamp: Date.parse('2026-06-21T17:00:00Z'),
  endTimestamp: Date.parse('2026-06-21T19:00:00Z'),
});
assert.deepEqual([fixedCrossMidnight.dayMinutes, fixedCrossMidnight.nightMinutes], [60, 60]);

const twilightCrossing = night.calculateNightDrivingSplit({
  durationMinutes: 150,
  method: night.NIGHT_DRIVING_METHODS.CIVIL_TWILIGHT,
  startTimestamp: Date.parse('2026-06-22T00:30:00Z'),
  endTimestamp: Date.parse('2026-06-22T03:00:00Z'),
  routePoints: [{ latitude: 41.8781, longitude: -87.6298, timestamp: Date.parse('2026-06-22T00:30:00Z') }],
});
assert(twilightCrossing.dayMinutes > 0 && twilightCrossing.nightMinutes > 0);
assert.equal(twilightCrossing.dayMinutes + twilightCrossing.nightMinutes, 150);
const twilightSegments = night.calculateNightDrivingSegments({
  method: night.NIGHT_DRIVING_METHODS.CIVIL_TWILIGHT,
  startTimestamp: Date.parse('2026-06-22T00:30:00Z'),
  endTimestamp: Date.parse('2026-06-22T03:00:00Z'),
  routePoints: [{ latitude: 41.8781, longitude: -87.6298, timestamp: Date.parse('2026-06-22T00:30:00Z') }],
});
assert.equal(twilightSegments.length, 2);
assert.deepEqual(twilightSegments.map((segment) => segment.classification), ['day', 'night']);
assert.equal(twilightSegments[0].endTimestamp, twilightSegments[1].startTimestamp);

const locationFallback = night.calculateNightDrivingSplit({
  durationMinutes: 60,
  method: night.NIGHT_DRIVING_METHODS.CIVIL_TWILIGHT,
  startTimestamp: Date.parse('2026-06-21T19:00:00Z'),
  endTimestamp: Date.parse('2026-06-21T20:00:00Z'),
  routePoints: [],
});
assert.equal(locationFallback.nightCalculation.source, 'fixed_hours_fallback');

const legacy = night.normalizeDriveNightFields({ duration: 45, isNightDrive: true });
assert.deepEqual([legacy.dayMinutes, legacy.nightMinutes, legacy.nightCalculation.source], [0, 45, 'legacy']);
const legacyWithNullSplit = night.normalizeDriveNightFields({ duration: 30, isNightDrive: true, dayMinutes: null, nightMinutes: null });
assert.deepEqual([legacyWithNullSplit.dayMinutes, legacyWithNullSplit.nightMinutes], [0, 30]);

const adjusted = night.applyNightMinuteAdjustment(forcedDay, 17);
assert.deepEqual([adjusted.dayMinutes, adjusted.nightMinutes, adjusted.nightCalculation.manuallyAdjusted], [43, 17, true]);
const adjustedSegments = night.buildAdjustedClassificationSegments({
  duration: 60,
  startedAt: '2026-06-21T20:00:00.000Z',
  endedAt: '2026-06-21T21:00:00.000Z',
  classificationSegments: [{ isNightDrive: false }],
  nightCalculation: forcedDay.nightCalculation,
}, 17);
assert.deepEqual(adjustedSegments.map((segment) => segment.classification), ['day', 'night']);
assert.equal(adjustedSegments[1].durationMinutes, 17);

const totals = night.sumDriveMinutes([
  { duration: 60, dayMinutes: 43, nightMinutes: 17 },
  { duration: 45, isNightDrive: true },
]);
assert.deepEqual(totals, { totalMinutes: 105, dayMinutes: 43, nightMinutes: 62 });

const reportHtml = pdf.generateDrivingReportHTML({
  drives: [{
    id: 'mixed-drive',
    date: '2026-06-21',
    startTime: '20:30',
    endTime: '21:30',
    duration: 60,
    dayMinutes: 43,
    nightMinutes: 17,
    nightCalculation: adjusted.nightCalculation,
    classificationSegments: [
      { startTime: '20:30', endTime: '21:13', durationMinutes: 43, isNightDrive: false },
      { startTime: '21:13', endTime: '21:30', durationMinutes: 17, isNightDrive: true },
    ],
  }],
  supervisorProfiles: [],
  user: {
    completedDayHours: 43 / 60,
    completedNightHours: 17 / 60,
    goalDayHours: 50,
    goalNightHours: 10,
    licenseType: 'learners',
  },
  streaks: { current: 0, longest: 0, freezeDaysThisMonth: 0 },
});
assert.match(reportHtml, /43m day \/ 17m night/);
assert.match(reportHtml, /Manually adjusted/);
assert.match(reportHtml, /<strong>DAY<\/strong>/);
assert.match(reportHtml, /<strong>NIGHT<\/strong>/);
assert.doesNotMatch(reportHtml, /Paused Drives/);

console.log('Night driving calculation tests passed.');

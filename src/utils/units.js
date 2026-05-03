export function getDistanceUnitLabel(distanceUnit = 'metric') {
  return distanceUnit === 'imperial' ? 'mi' : 'km';
}

export function getSpeedUnitLabel(distanceUnit = 'metric') {
  return distanceUnit === 'imperial' ? 'mph' : 'km/h';
}

export function formatDistanceFromKm(distanceKm, distanceUnit = 'metric') {
  if (distanceKm === null || distanceKm === undefined || Number.isNaN(Number(distanceKm))) {
    return '';
  }

  const value = distanceUnit === 'imperial'
    ? Number(distanceKm) * 0.621371
    : Number(distanceKm);

  return `${value.toFixed(2)} ${getDistanceUnitLabel(distanceUnit)}`;
}

export function formatSpeedFromKmh(speedKmh, distanceUnit = 'metric') {
  if (speedKmh === null || speedKmh === undefined || Number.isNaN(Number(speedKmh))) {
    return '';
  }

  const value = distanceUnit === 'imperial'
    ? Number(speedKmh) * 0.621371
    : Number(speedKmh);

  return `${Math.round(value)} ${getSpeedUnitLabel(distanceUnit)}`;
}

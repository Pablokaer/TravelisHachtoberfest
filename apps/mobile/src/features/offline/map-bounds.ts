// The map area to keep for a route (D-092): the box around its stops, with a margin so that
// the streets around them are on the map too.
import type { LatLng } from '@wayfarer/shared';

/** About 1 km of latitude: enough to see the street you may have to turn into. */
export const MAP_MARGIN_DEGREES = 0.01;

/**
 * `[west, south, east, north]`.
 * @example routeBounds(stops, MAP_MARGIN_DEGREES) // [-9.21, 38.69, -9.14, 38.73]
 */
export function routeBounds(
  points: readonly LatLng[],
  margin: number = MAP_MARGIN_DEGREES,
): [number, number, number, number] {
  if (points.length === 0) throw new Error('routeBounds needs at least one point, got none');
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  return [
    Math.min(...lngs) - margin,
    Math.min(...lats) - margin,
    Math.max(...lngs) + margin,
    Math.max(...lats) + margin,
  ];
}

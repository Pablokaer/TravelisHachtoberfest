// Guidance while the traveller walks a route with the app open (D-086): which stop is next, how
// far it is, and whether they left the line. Pure functions of a position, so the screen only
// feeds them what the GPS says.
import type { LatLng } from '../schemas/common.ts';
import type { LineString } from '../schemas/route.ts';
import { estimateWalkingMeters, haversineMeters, walkingSeconds } from './geo.ts';
import type { RoutePoint } from './route.ts';

/** Within this many metres of a stop the traveller has arrived (GPS drifts by 10 – 30 m). */
export const ARRIVAL_RADIUS_M = 40;
/** Farther than this from the walking line the traveller is off the route. */
export const OFF_ROUTE_M = 80;

const METRES_PER_DEGREE_LAT = 111_195;

/** Position in metres east / north of `origin`, flat-earth (right to well under 1 % over a city). */
function toLocalMetres(point: LatLng, origin: LatLng): { x: number; y: number } {
  const cosLat = Math.cos((origin.lat * Math.PI) / 180);
  return {
    x: (point.lng - origin.lng) * METRES_PER_DEGREE_LAT * cosLat,
    y: (point.lat - origin.lat) * METRES_PER_DEGREE_LAT,
  };
}

function distanceToSegmentM(p: LatLng, a: LatLng, b: LatLng): number {
  const pa = toLocalMetres(p, a);
  const ab = toLocalMetres(b, a);
  const lengthSquared = ab.x ** 2 + ab.y ** 2;
  if (lengthSquared === 0) return Math.hypot(pa.x, pa.y);
  const along = Math.max(0, Math.min(1, (pa.x * ab.x + pa.y * ab.y) / lengthSquared));
  return Math.hypot(pa.x - along * ab.x, pa.y - along * ab.y);
}

/**
 * Metres from `position` to the nearest point of the line; Infinity for a line without points.
 * @example distanceToLineM(here, trip.geometry) // 12
 */
export function distanceToLineM(position: LatLng, line: LineString): number {
  const points = line.coordinates.map(([lng, lat]) => ({ lat: lat!, lng: lng! }));
  if (points.length === 1) return haversineMeters(position, points[0]!);
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    best = Math.min(best, distanceToSegmentM(position, points[i - 1]!, points[i]!));
  }
  return best;
}

/**
 * True when the traveller is farther than OFF_ROUTE_M from the walking line. A route without a
 * line (the straight-line fallback) has nothing to be off, so it is never off.
 * @example isOffRoute(here, trip.geometry) // false
 */
export function isOffRoute(position: LatLng, line: LineString | null): boolean {
  return line !== null && distanceToLineM(position, line) > OFF_ROUTE_M;
}

/**
 * The index of the stop to go to next: `current`, moved past every consecutive stop the traveller
 * is within ARRIVAL_RADIUS_M of. It never goes back; `stops.length` means the last stop was
 * reached.
 * @example stopAfterArrival(here, stops, 0) // 1 once the first stop is reached
 */
export function stopAfterArrival(
  position: LatLng,
  stops: readonly RoutePoint[],
  current: number,
): number {
  let index = current;
  while (index < stops.length && haversineMeters(position, stops[index]!) <= ARRIVAL_RADIUS_M) {
    index += 1;
  }
  return index;
}

/**
 * Straight-line metres to a stop and an estimate of the street walk to it.
 * @example guidanceTo(here, stop) // { distanceM: 240, walkingSeconds: 330 }
 */
export function guidanceTo(
  position: LatLng,
  stop: LatLng,
): { distanceM: number; walkingSeconds: number } {
  const distanceM = Math.round(haversineMeters(position, stop));
  return { distanceM, walkingSeconds: walkingSeconds(estimateWalkingMeters(distanceM)) };
}

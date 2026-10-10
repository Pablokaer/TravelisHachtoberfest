import { WALKING_DETOUR_FACTOR, WALKING_SPEED_M_PER_S } from '../constants/index.ts';
import type { LatLng } from '../schemas/common.ts';

const EARTH_RADIUS_M = 6_371_008.8;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Estimated walking distance on streets from a straight-line distance. */
export function estimateWalkingMeters(straightLineMeters: number): number {
  return straightLineMeters * WALKING_DETOUR_FACTOR;
}

export function walkingSeconds(meters: number): number {
  return Math.round(meters / WALKING_SPEED_M_PER_S);
}

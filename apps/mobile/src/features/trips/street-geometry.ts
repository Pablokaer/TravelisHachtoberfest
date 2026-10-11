// The rule (D-087): a route is never a straight line between stops. A trip saved before the rule
// may still carry one (`isFallback`); it is not drawn and not navigated along.
import type { LineString } from '@wayfarer/shared';

/**
 * The line to draw and to navigate along: the trip's street path, or null when it has none or
 * is only a straight-line estimate.
 * @example streetGeometryOf({ geometry, isFallback: false }) // geometry
 */
export function streetGeometryOf(trip: {
  geometry: LineString | null;
  isFallback: boolean;
}): LineString | null {
  return trip.isFallback ? null : trip.geometry;
}

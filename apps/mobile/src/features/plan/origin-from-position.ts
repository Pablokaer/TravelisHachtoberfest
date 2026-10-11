// The origin of a trip when it starts from the traveller's own position (D-081): named after the
// covered city they are in, so the planner can show where it starts from instead of a bare
// "My location".
import { nearestCity, type LatLng } from '@wayfarer/shared';

import { cityName, type City } from '@/features/destinations/api';
import type { Origin } from './use-plan-wizard';

/** Inside this distance of a city's centre the traveller is "in" that city. */
const IN_CITY_M = 20_000;

export type OriginLabels = {
  /** Used when no covered city is within reach. */
  mine: string;
  /** "Near Lisbon": a covered city is within reach but not around the traveller. */
  near: (city: string) => string;
};

/**
 * @example originFromPosition({ lat: 38.73, lng: -9.15 }, cities, 'en', labels).label // 'Lisbon'
 */
export function originFromPosition(
  position: LatLng,
  cities: readonly City[],
  language: string,
  labels: OriginLabels,
): Origin {
  const found = nearestCity(cities, position);
  if (!found) return { ...position, label: labels.mine };
  const name = cityName(found.city, language);
  return { ...position, label: found.distanceM <= IN_CITY_M ? name : labels.near(name) };
}

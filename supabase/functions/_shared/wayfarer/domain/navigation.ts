import type { LatLng } from '../schemas/common.ts';

const fmt = (p: LatLng) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

/**
 * Google Maps walking directions through all stops (universal URL: opens the app when
 * installed, the website otherwise). Google accepts up to 9 waypoints; longer routes are
 * truncated to origin + 9 waypoints + destination and should be opened leg by leg.
 */
export function googleMapsDirectionsUrl(stops: readonly LatLng[]): string {
  if (stops.length < 2) throw new RangeError('need at least two stops');
  const origin = stops[0]!;
  const destination = stops[stops.length - 1]!;
  const waypoints = stops.slice(1, -1).slice(0, 9);
  const params: [string, string][] = [
    ['api', '1'],
    ['origin', fmt(origin)],
    ['destination', fmt(destination)],
    ['travelmode', 'walking'],
  ];
  if (waypoints.length) params.push(['waypoints', waypoints.map(fmt).join('|')]);
  const query = params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return `https://www.google.com/maps/dir/?${query}`;
}

/** Apple Maps walking directions for one leg (Apple Maps URLs support a single destination). */
export function appleMapsLegUrl(from: LatLng, to: LatLng): string {
  return `https://maps.apple.com/?saddr=${fmt(from)}&daddr=${fmt(to)}&dirflg=w`;
}

/** Google Maps walking directions for one leg. */
export function googleMapsLegUrl(from: LatLng, to: LatLng): string {
  return googleMapsDirectionsUrl([from, to]);
}

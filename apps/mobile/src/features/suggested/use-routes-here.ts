// What the suggested-routes tab shows (D-077): the city (from the GPS position or the traveller's
// pick) and its routes, each started at the stop nearest to the traveller, nearest route first.
import { nearestCity, rankByProximity, type LatLng, type RankedRoute } from '@wayfarer/shared';
import { useEffect, useMemo } from 'react';

import { useCities, type City } from '@/features/destinations/api';
import { useSuggestedRoutes, type SuggestedRoute } from './api';
import type { CityBuilder, PlaceHint } from './city-builder';
import { defaultBuilder } from './default-builder';
import { ExpoLocationSource, type LocationSource } from './location';
import { usePlaceStore, type PlaceStatus } from './place-store';
import { useSavedPlaces } from './saved-places';
import { useOwnCity, type OwnCity } from './use-own-city';

export type RoutesHere = {
  cities: City[];
  city: City | null;
  /** The city picked by hand, if any (it wins over the one near the position). */
  chosenCity: string | null;
  /** The traveller's own city while the city builder looks it up or prepares it (D-079). */
  own: OwnCity;
  /** True when the position is known but no covered city is within reach. */
  outOfCoverage: boolean;
  /** Null until the traveller shares a position; routes then show how far each start is. */
  position: LatLng | null;
  status: PlaceStatus;
  routes: ReturnType<typeof useSuggestedRoutes>;
  ranked: RankedRoute<SuggestedRoute>[];
  locate: () => void;
  chooseCity: (slug: string | null) => void;
  setTypedPlace: (position: LatLng, hint?: PlaceHint) => void;
};

const defaultSource = new ExpoLocationSource();

/**
 * The city to show: the traveller's pick, else the city the builder found at their position (the
 * covered city nearest to them when there is no builder, D-079).
 */
function resolveCity(cities: City[], position: LatLng | null, chosen: string | null, own: OwnCity) {
  if (chosen) return cities.find((c) => c.slug === chosen) ?? null;
  if (!position) return null;
  if (own.phase === 'ready') return cities.find((c) => c.slug === own.slug) ?? null;
  return own.phase === 'unavailable' ? (nearestCity(cities, position)?.city ?? null) : null;
}

/**
 * State of the tab. On first use it only reads a location permission already granted, so
 * opening the tab never prompts by surprise; the button asks.
 * @example const { ranked, city } = useRoutesHere();
 */
export function useRoutesHere(
  source: LocationSource = defaultSource,
  builder: CityBuilder | null = defaultBuilder,
): RoutesHere {
  const cities = useCities().data ?? [];
  const { position, chosenCity, placeHint, status, locate, chooseCity, setTypedPlace } =
    usePlaceStore();
  useEffect(() => {
    if (usePlaceStore.getState().status === 'idle') void locate(source, false);
  }, [locate, source]);
  const own = useOwnCity(chosenCity ? null : position, builder, undefined, placeHint);
  const city = resolveCity(cities, position, chosenCity, own);
  // The city the traveller is in goes to the saved cities (D-080).
  const locatedSlug = position && !chosenCity ? (city?.slug ?? null) : null;
  useEffect(() => {
    if (locatedSlug) useSavedPlaces.getState().save(locatedSlug);
  }, [locatedSlug]);
  const routes = useSuggestedRoutes(city?.slug ?? null);
  // Without a position the routes start at the stop nearest to the city centre.
  const fromLat = position?.lat ?? city?.lat;
  const fromLng = position?.lng ?? city?.lng;
  const ranked = useMemo(() => {
    if (!routes.data || fromLat === undefined || fromLng === undefined) return [];
    return rankByProximity(routes.data, { lat: fromLat, lng: fromLng });
  }, [routes.data, fromLat, fromLng]);
  return {
    cities,
    city,
    chosenCity,
    own,
    outOfCoverage: !!position && !chosenCity && own.phase === 'unavailable' && !city,
    position,
    status,
    routes,
    ranked,
    locate: () => void locate(source, true),
    chooseCity,
    setTypedPlace,
  };
}

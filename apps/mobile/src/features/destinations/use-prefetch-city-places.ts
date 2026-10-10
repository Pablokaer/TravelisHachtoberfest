// The city hub (D-033) warms the Map / List page's queries, so "Explore attractions" opens on a
// full grid instead of a spinner (D-062).
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { attractionsQueryOptions, type City } from './api';

import { cityRatingsQueryOptions } from '@/features/reviews/api';

/**
 * Starts loading every place of `city` and their ratings in the background (a no-op while the
 * cached ones are fresh).
 * @example usePrefetchCityPlaces(city); // on the city hub
 */
export function usePrefetchCityPlaces(city: City): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    void queryClient.prefetchQuery(attractionsQueryOptions(city, []));
    void queryClient.prefetchQuery(cityRatingsQueryOptions(city.slug));
  }, [queryClient, city]);
}

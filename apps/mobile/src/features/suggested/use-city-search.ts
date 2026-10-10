// Search of any city in the world by name (D-080), through the local city builder. Waits for a
// few letters and a pause in typing, so each keystroke does not become a request.
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import type { CityBuilder, PlaceMatch } from './city-builder';

/** Letters needed before the service is asked. */
export const SEARCH_MIN_LETTERS = 3;
/** Pause in typing before the search starts. */
const DEBOUNCE_MS = 400;

export type CitySearch = {
  /** False when no city builder is configured: only the cities the app has can be picked. */
  available: boolean;
  isSearching: boolean;
  matches: PlaceMatch[];
};

/**
 * @example const { matches, isSearching } = useCitySearch(text, builder);
 */
export function useCitySearch(
  text: string,
  builder: CityBuilder | null,
  debounceMs: number = DEBOUNCE_MS,
): CitySearch {
  const query = text.trim();
  const [settled, setSettled] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setSettled(query), debounceMs);
    return () => clearTimeout(timer);
  }, [query, debounceMs]);
  const ready = !!builder && settled.length >= SEARCH_MIN_LETTERS && settled === query;
  const found = useQuery({
    queryKey: ['city-search', settled.toLowerCase()],
    enabled: ready,
    retry: false,
    staleTime: 600_000,
    queryFn: () => builder!.search(settled),
  });
  return {
    available: !!builder,
    isSearching: found.isFetching,
    matches: ready ? (found.data ?? []) : [],
  };
}

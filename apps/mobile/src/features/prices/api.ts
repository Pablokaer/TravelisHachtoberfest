// Estimated everyday prices of a city (D-088). Public reference data: one row per city, read by
// everyone. The numbers are modelled (see the data pipeline's `prices` module), not quotes.
import { useQuery } from '@tanstack/react-query';
import type { CityPrices } from '@wayfarer/shared';

import type { Tables } from '@/lib/database.types';
import { supabase, unwrap } from '@/lib/supabase';

export type CityPriceEstimate = {
  prices: CityPrices;
  currency: string;
  /** How expensive the country is against the United States (1.00). */
  priceLevel: number;
  /** True when the Big Mac is the index's own price for the country, false when modelled. */
  bigMacIsReal: boolean;
  retrievedOn: string;
};

export const priceKeys = { all: ['cityPrices'] as const };

type PriceRow = Omit<Tables<'city_prices'>, 'city_slug'> & { city_slug?: string };

/**
 * @example cityPricesFromRow(row).prices.beer // 4.06
 */
export function cityPricesFromRow(row: PriceRow): CityPriceEstimate {
  return {
    prices: {
      beer: row.beer,
      softDrink: row.soft_drink,
      cocktail: row.cocktail,
      coffee: row.coffee,
      mealCheap: row.meal_cheap,
      mealMid: row.meal_mid,
      localDish: row.local_dish,
      bigMac: row.big_mac,
      transportTicket: row.transport_ticket,
      taxi5km: row.taxi_5km,
    },
    currency: row.currency,
    priceLevel: row.price_level,
    bigMacIsReal: row.big_mac_is_real,
    retrievedOn: row.retrieved_on,
  };
}

/** Every city's estimate by slug, in one small request (about 200 rows) kept for an hour. */
export function useAllCityPrices() {
  return useQuery({
    queryKey: priceKeys.all,
    staleTime: 3600_000,
    queryFn: async (): Promise<Map<string, CityPriceEstimate>> => {
      const rows = unwrap(await supabase.from('city_prices').select('*'));
      return new Map(rows.map((row) => [row.city_slug, cityPricesFromRow(row)]));
    },
  });
}

/** One city's estimate; `data` is null when the city has none. */
export function useCityPrices(citySlug: string) {
  const all = useAllCityPrices();
  return { ...all, data: all.data?.get(citySlug) ?? null };
}

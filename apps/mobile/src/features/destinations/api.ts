import type { AttractionCategory } from '@wayfarer/shared';
import { queryOptions, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import type { Database } from '@/lib/database.types';
import { supabase, unwrap } from '@/lib/supabase';

export type City = {
  slug: string;
  nameEn: string;
  namePt: string;
  countryCode: string;
  lat: number;
  lng: number;
  /** [south, west, north, east] */
  bbox: [number, number, number, number];
  timezone: string | null;
  attractionCount: number;
  countryNameEn: string;
  countryNamePt: string;
  /** Photo of the city's most popular attraction that has one, with its required credit. */
  cover: PhotoCover | null;
};

/** A Commons photo with its credit (shown wherever the photo is: city and walk list cards). */
export type PhotoCover = { url: string; author: string | null; license: string | null };

export type AttractionSummary = {
  id: string;
  citySlug: string;
  nameEn: string;
  namePt: string | null;
  category: AttractionCategory;
  lat: number;
  lng: number;
  popularity: number;
  avgVisitMinutes: number;
  imageUrl: string | null;
  isUnesco: boolean;
};

export type AttractionDetail = AttractionSummary & {
  descriptionEn: string | null;
  descriptionPt: string | null;
  imageAuthor: string | null;
  imageLicense: string | null;
  imageLicenseUrl: string | null;
  imagePageUrl: string | null;
  website: string | null;
  wikipediaEn: string | null;
  wikipediaPt: string | null;
  openingHours: string | null;
  fee: string | null;
  wikidataId: string;
  /** Wikipedia introduction and History excerpt (D-070); null without an article or section. */
  summaryEn: string | null;
  summaryPt: string | null;
  historyEn: string | null;
  historyPt: string | null;
};

/**
 * Most places a city page asks for. The pipeline keeps a city to 300 places (MAX_PER_CITY), so a
 * whole city always fits and the category tabs filter it on the device (D-052).
 */
export const CITY_ATTRACTIONS_LIMIT = 500;

export const destinationKeys = {
  cities: ['cities'] as const,
  /** Every place of a city; the category tabs filter it on the device. */
  attractions: (city: string) => ['attractions', city] as const,
  /** Places of some categories, filtered by the server: only for a list cut at the limit. */
  attractionsIn: (city: string, categories: readonly string[]) =>
    ['attractions', city, [...categories].sort()] as const,
  attraction: (id: string) => ['attraction', id] as const,
};

export function localizedName(item: { nameEn: string; namePt: string | null }, language: string) {
  return language === 'pt' && item.namePt ? item.namePt : item.nameEn;
}

/**
 * City name in the UI language.
 * @example cityName(lisbon, 'pt') // 'Lisboa'
 */
export function cityName(city: City, language: string): string {
  return language === 'pt' ? city.namePt : city.nameEn;
}

/**
 * Country of a city in the UI language.
 * @example countryOf(amsterdam, 'pt') // 'Países Baixos'
 */
export function countryOf(city: City, language: string): string {
  return language === 'pt' ? city.countryNamePt : city.countryNameEn;
}

type CityRow = Database['public']['Views']['city_list']['Row'];

function coverFrom(row: CityRow): PhotoCover | null {
  if (!row.cover_image_url) return null;
  return {
    url: row.cover_image_url,
    author: row.cover_image_author,
    license: row.cover_image_license,
  };
}

/** Maps a `city_list` row (every column is nullable in a view's generated type). */
export function cityFromRow(r: CityRow): City {
  return {
    slug: r.slug!,
    nameEn: r.name_en!,
    namePt: r.name_pt!,
    countryCode: r.country_code!,
    lat: r.lat!,
    lng: r.lng!,
    bbox: r.bbox as City['bbox'],
    timezone: r.timezone,
    attractionCount: r.attraction_count ?? 0,
    countryNameEn: r.country_name_en ?? r.country_code!,
    countryNamePt: r.country_name_pt ?? r.country_code!,
    cover: coverFrom(r),
  };
}

export function useCities() {
  return useQuery({
    queryKey: destinationKeys.cities,
    staleTime: 3600_000,
    queryFn: async (): Promise<City[]> => {
      const rows = unwrap(await supabase.from('city_list').select('*').order('name_en'));
      return rows.map(cityFromRow);
    },
  });
}

type AttractionRow = Database['public']['Functions']['attractions_in_view']['Returns'][number];

function attractionFromRow(r: AttractionRow): AttractionSummary {
  return {
    id: r.id,
    citySlug: r.city_slug,
    nameEn: r.name_en,
    namePt: r.name_pt,
    category: r.category,
    lat: r.lat,
    lng: r.lng,
    popularity: r.popularity,
    avgVisitMinutes: r.avg_visit_minutes,
    imageUrl: r.image_url,
    isUnesco: r.is_unesco,
  };
}

/** A city's places (most popular first), and whether CITY_ATTRACTIONS_LIMIT cut the list. */
type CityAttractions = { items: AttractionSummary[]; cut: boolean };

async function fetchAttractions(
  city: City,
  categories: readonly AttractionCategory[],
): Promise<CityAttractions> {
  const [south, west, north, east] = city.bbox;
  const rows = unwrap(
    await supabase.rpc('attractions_in_view', {
      min_lng: west,
      min_lat: south,
      max_lng: east,
      max_lat: north,
      categories: categories.length ? [...categories] : undefined,
      max_results: CITY_ATTRACTIONS_LIMIT,
    }),
  );
  const items = rows.filter((r) => r.city_slug === city.slug).map(attractionFromRow);
  return { items, cut: rows.length >= CITY_ATTRACTIONS_LIMIT };
}

/**
 * The places of `items` in `categories`, order kept; every place when no category is chosen.
 * @example inCategories(places, ['museum']).every((p) => p.category === 'museum') // true
 */
export function inCategories(
  items: AttractionSummary[],
  categories: readonly AttractionCategory[],
): AttractionSummary[] {
  return categories.length ? items.filter((a) => categories.includes(a.category)) : items;
}

/** What the city page reads of its places. */
export type AttractionsState = {
  data: AttractionSummary[] | undefined;
  isPending: boolean;
  isError: boolean;
  refetch: () => unknown;
};

/**
 * The query of a city's places (every one when `categories` is empty): one definition for the
 * city page and the hub's prefetch, so the prefetched list is the one the page reads.
 * @example queryClient.prefetchQuery(attractionsQueryOptions(lisbon, []))
 */
export function attractionsQueryOptions(
  city: City | undefined,
  categories: readonly AttractionCategory[],
) {
  const slug = city?.slug ?? '';
  return queryOptions({
    queryKey: categories.length
      ? destinationKeys.attractionsIn(slug, categories)
      : destinationKeys.attractions(slug),
    enabled: !!city,
    staleTime: 3600_000,
    queryFn: () => fetchAttractions(city!, categories),
  });
}

function useAttractionsQuery(
  city: City | undefined,
  categories: readonly AttractionCategory[],
  enabled: boolean,
) {
  return useQuery({ ...attractionsQueryOptions(city, categories), enabled: !!city && enabled });
}

/**
 * Every place of a city, loaded once: the category tabs filter it on the device (D-052), so
 * switching them needs no request and never empties the map. Only a list cut at
 * CITY_ATTRACTIONS_LIMIT (no city is, today) is filtered by the server instead.
 * @example const museums = useAttractions(lisbon, ['museum']).data;
 */
export function useAttractions(
  city: City | undefined,
  categories: readonly AttractionCategory[],
): AttractionsState {
  const all = useAttractionsQuery(city, [], true);
  const cut = !!all.data?.cut && categories.length > 0;
  const server = useAttractionsQuery(city, categories, cut);
  const local = useMemo(
    () => all.data && inCategories(all.data.items, categories),
    [all.data, categories],
  );
  const shown = cut ? server : all;
  return {
    data: cut ? server.data?.items : local,
    isPending: shown.isPending,
    isError: shown.isError,
    refetch: shown.refetch,
  };
}

type AttractionDetailRow = Database['public']['Views']['attraction_details']['Row'];

/** Maps an `attraction_details` row (every column is nullable in a view's generated type). */
function attractionDetailFromRow(r: AttractionDetailRow): AttractionDetail {
  return {
    id: r.id!,
    citySlug: r.city_slug!,
    nameEn: r.name_en!,
    namePt: r.name_pt,
    category: r.category!,
    lat: r.lat!,
    lng: r.lng!,
    popularity: r.popularity ?? 0,
    avgVisitMinutes: r.avg_visit_minutes ?? 30,
    imageUrl: r.image_url,
    isUnesco: r.is_unesco ?? false,
    descriptionEn: r.description_en,
    descriptionPt: r.description_pt,
    imageAuthor: r.image_author,
    imageLicense: r.image_license,
    imageLicenseUrl: r.image_license_url,
    imagePageUrl: r.image_page_url,
    website: r.website,
    wikipediaEn: r.wikipedia_en,
    wikipediaPt: r.wikipedia_pt,
    openingHours: r.opening_hours,
    fee: r.fee,
    wikidataId: r.wikidata_id!,
    summaryEn: r.summary_en,
    summaryPt: r.summary_pt,
    historyEn: r.history_en,
    historyPt: r.history_pt,
  };
}

/**
 * A place as its page shows it: what every list has (`summary`) and, once loaded, the rest
 * (`detail`; null while only a cached city list's row is known).
 */
export type AttractionPage = { summary: AttractionSummary; detail: AttractionDetail | null };

/**
 * The place's row in any city list already in the cache (the city page, or the hub's
 * prefetch), so its page can show the header before the details arrive.
 * @example cachedAttractionSummary(queryClient, 'a1')?.nameEn // 'Belém Tower'
 */
export function cachedAttractionSummary(
  queryClient: QueryClient,
  id: string,
): AttractionSummary | undefined {
  const lists = queryClient.getQueriesData<CityAttractions>({ queryKey: ['attractions'] });
  for (const [, list] of lists) {
    const found = list?.items.find((a) => a.id === id);
    if (found) return found;
  }
  return undefined;
}

/**
 * One place for its page: starts from its cached city-list row (placeholder, D-062), then the
 * full `attraction_details` row.
 * @example const page = useAttraction(id).data; page?.detail?.openingHours
 */
export function useAttraction(id: string | undefined) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: destinationKeys.attraction(id ?? ''),
    enabled: !!id,
    staleTime: 3600_000,
    placeholderData: (): AttractionPage | undefined => {
      const summary = id ? cachedAttractionSummary(queryClient, id) : undefined;
      return summary && { summary, detail: null };
    },
    queryFn: async (): Promise<AttractionPage> => {
      const r = unwrap(
        await supabase.from('attraction_details').select('*').eq('id', id!).single(),
      );
      const detail = attractionDetailFromRow(r);
      return { summary: detail, detail };
    },
  });
}

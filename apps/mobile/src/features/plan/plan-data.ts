// What the planner knows about every city (D-081): climate of the month, facts and a profile of
// its attractions, read from public reference tables and joined with the cities the app lists.
import type {
  CityFacts,
  CityProfile,
  MonthClimate,
  PlanCity,
  ScoredDestination,
} from '@wayfarer/shared';

import { cityName, countryOf, type City } from '@/features/destinations/api';
import type { Tables } from '@/lib/database.types';
import { supabase, unwrap } from '@/lib/supabase';
import type { RankCandidate } from './plan-agent';

type ClimateRow = Tables<'city_climate'>;
type FactsRow = Tables<'city_facts'>;
type ProfileRow = Tables<'city_profiles'>;

const climateFrom = (row: ClimateRow): MonthClimate => ({
  tempMeanC: row.temp_mean_c,
  tempMaxC: row.temp_max_c,
  precipMm: row.precip_mm,
  snowfallCm: row.snowfall_cm,
  sunshineHours: row.sunshine_hours,
});

const factsFrom = (row: FactsRow): CityFacts => ({
  population: row.population,
  inceptionYear: row.inception_year,
  beaches: row.beach_count,
});

const profileFrom = (row: ProfileRow): CityProfile => ({
  attractionCount: row.attraction_count ?? 0,
  unescoCount: row.unesco_count ?? 0,
  castles: row.castle_count ?? 0,
  palaces: row.palace_count ?? 0,
  museums: row.museum_count ?? 0,
  churches: row.church_count ?? 0,
  monuments: row.monument_count ?? 0,
  parks: row.park_count ?? 0,
  nature: row.nature_count ?? 0,
  viewpoints: row.viewpoint_count ?? 0,
  landmarks: row.landmark_count ?? 0,
});

const bySlug = <T extends { city_slug: string | null }>(rows: readonly T[]): Map<string, T> =>
  new Map(rows.flatMap((row) => (row.city_slug ? [[row.city_slug, row] as const] : [])));

/**
 * Each city with the climate of the planned month, its facts and its attraction profile.
 * @example planCitiesFrom(cities, climateRows, factRows, profileRows)[0].climate?.tempMeanC
 */
export function planCitiesFrom(
  cities: readonly City[],
  climate: readonly ClimateRow[],
  facts: readonly FactsRow[],
  profiles: readonly ProfileRow[],
): PlanCity[] {
  const [climates, allFacts, allProfiles] = [bySlug(climate), bySlug(facts), bySlug(profiles)];
  return cities.map((city) => {
    const [c, f, p] = [
      climates.get(city.slug),
      allFacts.get(city.slug),
      allProfiles.get(city.slug),
    ];
    return {
      slug: city.slug,
      lat: city.lat,
      lng: city.lng,
      countryCode: city.countryCode,
      climate: c ? climateFrom(c) : null,
      facts: f ? factsFrom(f) : null,
      profile: p ? profileFrom(p) : null,
    };
  });
}

/** Reads the three reference tables for one month and joins them with the app's cities. */
export async function fetchPlanCities(cities: readonly City[], month: number): Promise<PlanCity[]> {
  const [climate, facts, profiles] = await Promise.all([
    supabase.from('city_climate').select('*').eq('month', month),
    supabase.from('city_facts').select('*'),
    supabase.from('city_profiles').select('*'),
  ]);
  return planCitiesFrom(cities, unwrap(climate), unwrap(facts), unwrap(profiles));
}

/**
 * The shortlist as the model reads it: names, distance and facts the code measured.
 * @example candidatesFrom(shortlist, cities, 'en')[0].facts.temp_mean_c // 12.4
 */
export function candidatesFrom(
  shortlist: readonly ScoredDestination[],
  cities: readonly City[],
  language: string,
): RankCandidate[] {
  return shortlist.flatMap((d) => {
    const city = cities.find((c) => c.slug === d.slug);
    if (!city) return [];
    const { climate, facts, profile } = d;
    return [
      {
        slug: d.slug,
        name: cityName(city, language),
        country: countryOf(city, language),
        distanceKm: Math.round(d.distanceKm),
        facts: {
          temp_mean_c: climate?.tempMeanC ?? null,
          temp_max_c: climate?.tempMaxC ?? null,
          precip_mm: climate?.precipMm ?? null,
          snowfall_cm: climate?.snowfallCm ?? null,
          sunshine_hours: climate?.sunshineHours ?? null,
          population: facts?.population ?? null,
          inception_year: facts?.inceptionYear ?? null,
          beaches: facts?.beaches ?? null,
          unesco: profile?.unescoCount ?? null,
          castles: profile?.castles ?? null,
          museums: profile?.museums ?? null,
          churches: profile?.churches ?? null,
        },
      },
    ];
  });
}

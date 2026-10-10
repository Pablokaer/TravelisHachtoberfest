// "Plan your next trip" (D-081): the traveller's answers become hard limits (how far, which month)
// and soft wishes (weather, attractions, character). Code narrows the cities of the app to those
// that can fit; the local model only ranks that shortlist and explains it, so it cannot suggest a
// place that is too far or in the wrong season.
import type { LatLng } from '../schemas/common.ts';
import { haversineMeters } from './geo.ts';

export type WeatherWish = 'sunny' | 'warm' | 'hot' | 'mild' | 'cool' | 'rainy' | 'snow';
export type AttractionWish =
  'beaches' | 'castles' | 'history' | 'museums' | 'nature' | 'churches' | 'viewpoints';
export type CharacterWish = 'ancient' | 'big-city' | 'small-quiet';

/** Monthly normals of a city: temperatures in °C, precipitation and snowfall as monthly totals. */
export type MonthClimate = {
  tempMeanC: number;
  tempMaxC: number;
  precipMm: number;
  snowfallCm: number;
  sunshineHours: number;
};

export type CityFacts = {
  population: number | null;
  /** Year of foundation; negative before the common era. */
  inceptionYear: number | null;
  beaches: number;
};

export type CityProfile = {
  attractionCount: number;
  unescoCount: number;
  castles: number;
  palaces: number;
  museums: number;
  churches: number;
  monuments: number;
  parks: number;
  nature: number;
  viewpoints: number;
  landmarks: number;
};

export type PlanCity = LatLng & {
  slug: string;
  countryCode: string;
  /** Climate of the month being planned; null when the city has none. */
  climate: MonthClimate | null;
  facts: CityFacts | null;
  profile: CityProfile | null;
};

export type PlanPreferences = {
  origin: LatLng;
  /** Farthest the traveller will go, in km; null for any distance. */
  maxKm: number | null;
  /** Month of the trip, 1–12. */
  month: number;
  weather: WeatherWish[];
  attractions: AttractionWish[];
  character: CharacterWish[];
};

export type ScoredDestination = PlanCity & {
  distanceKm: number;
  score: number;
  weatherScore: number;
  interestScore: number;
};

/** Weather below this fit is not offered, unless too few cities remain. */
const MIN_WEATHER_FIT = 0.4;
/** Cities handed to the model to rank. */
export const SHORTLIST_SIZE = 25;
/** Fewest destinations worth showing before the weather rule is relaxed. */
export const MIN_DESTINATIONS = 6;

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** 0 outside [a, d], 1 inside [b, c], a straight ramp between. */
function trapezoid(x: number, a: number, b: number, c: number, d: number): number {
  if (x <= a || x >= d) return 0;
  if (x < b) return (x - a) / (b - a);
  return x <= c ? 1 : (d - x) / (d - c);
}

/**
 * The month (1–12) of an ISO date.
 * @example monthOf('2026-12-05') // 12
 */
export function monthOf(isoDate: string): number {
  const match = /^\d{4}-(\d{2})-\d{2}$/.exec(isoDate);
  const month = match ? Number(match[1]) : 0;
  if (month < 1 || month > 12) throw new Error(`Invalid date "${isoDate}": expected YYYY-MM-DD`);
  return month;
}

const WEATHER_FITS: Record<WeatherWish, (c: MonthClimate) => number> = {
  // Sun counts, but a month that is also a downpour is not "sunny".
  sunny: (c) => clamp01((c.sunshineHours - 4) / 4) * (c.precipMm > 150 ? 0.5 : 1),
  warm: (c) => trapezoid(c.tempMeanC, 12, 18, 27, 32),
  hot: (c) => trapezoid(c.tempMaxC, 26, 32, 60, 70),
  mild: (c) => trapezoid(c.tempMeanC, 6, 10, 20, 24),
  cool: (c) => trapezoid(c.tempMeanC, -4, 2, 12, 17),
  rainy: (c) => clamp01((c.precipMm - 40) / 60),
  snow: (c) => clamp01((c.snowfallCm - 2) / 13),
};

/**
 * How well a month's climate fits one weather wish, from 0 to 1.
 * @example weatherFit('warm', { tempMeanC: 23, … }) // 1
 */
export function weatherFit(wish: WeatherWish, climate: MonthClimate): number {
  return WEATHER_FITS[wish](climate);
}

const INTEREST_FITS: Record<AttractionWish, (city: PlanCity) => number> = {
  beaches: (c) => clamp01((c.facts?.beaches ?? 0) / 5),
  castles: (c) => clamp01(((c.profile?.castles ?? 0) + (c.profile?.palaces ?? 0)) / 6),
  history: (c) => {
    const p = c.profile;
    return clamp01(((p?.unescoCount ?? 0) * 2 + (p?.monuments ?? 0) + (p?.castles ?? 0)) / 15);
  },
  museums: (c) => clamp01((c.profile?.museums ?? 0) / 15),
  nature: (c) => clamp01(((c.profile?.nature ?? 0) + (c.profile?.parks ?? 0)) / 10),
  churches: (c) => clamp01((c.profile?.churches ?? 0) / 20),
  viewpoints: (c) => clamp01((c.profile?.viewpoints ?? 0) / 3),
};

/**
 * How much of what the traveller wants to see a city has, from 0 to 1.
 * @example interestFit('beaches', lisbon) // 1
 */
export function interestFit(wish: AttractionWish, city: PlanCity): number {
  return INTEREST_FITS[wish](city);
}

function ageFit(year: number | null): number {
  if (year === null) return 0.3;
  if (year <= 0) return 1;
  return year <= 1000 ? 0.8 : year <= 1500 ? 0.5 : 0.2;
}

/** Fit of a population to "big city" (thresholds ascending: 2M, 500k, 200k) or "small and quiet". */
function sizeFit(wish: 'big-city' | 'small-quiet', population: number | null): number {
  if (population === null) return 0.4;
  if (wish === 'big-city') {
    return population >= 2_000_000
      ? 1
      : population >= 500_000
        ? 0.7
        : population >= 200_000
          ? 0.4
          : 0.1;
  }
  return population < 100_000 ? 1 : population < 300_000 ? 0.7 : population < 800_000 ? 0.3 : 0.05;
}

/**
 * How well a city has the character the traveller wants (oldest, big or small), from 0 to 1.
 * @example characterFit('ancient', rome) // 1
 */
export function characterFit(wish: CharacterWish, city: PlanCity): number {
  if (wish === 'ancient') return ageFit(city.facts?.inceptionYear ?? null);
  return sizeFit(wish, city.facts?.population ?? null);
}

const mean = (values: number[], whenEmpty: number): number =>
  values.length === 0 ? whenEmpty : values.reduce((a, b) => a + b, 0) / values.length;

function scoreCity(city: PlanCity, prefs: PlanPreferences, distanceKm: number): ScoredDestination {
  const weatherScore = mean(
    prefs.weather.map((wish) => weatherFit(wish, city.climate!)),
    1,
  );
  const interestScore = mean(
    [
      ...prefs.attractions.map((wish) => interestFit(wish, city)),
      ...prefs.character.map((wish) => characterFit(wish, city)),
    ],
    0.5,
  );
  return { ...city, distanceKm, weatherScore, interestScore, score: weatherScore + interestScore };
}

function withinReach(city: PlanCity, prefs: PlanPreferences): ScoredDestination | null {
  if (!city.climate) return null;
  const distanceKm = haversineMeters(prefs.origin, city) / 1000;
  if (prefs.maxKm !== null && distanceKm > prefs.maxKm) return null;
  return scoreCity(city, prefs, distanceKm);
}

/**
 * The cities that can fit the answers, best first: within the distance, with climate for the
 * month, and (while enough remain) a weather fit of at least 0.4.
 * @example shortlistDestinations(cities, { origin, maxKm: 3000, month: 12, … }).destinations
 */
export function shortlistDestinations(
  cities: readonly PlanCity[],
  prefs: PlanPreferences,
  limit: number = SHORTLIST_SIZE,
  minDestinations: number = MIN_DESTINATIONS,
): { destinations: ScoredDestination[]; relaxed: boolean } {
  const reachable = cities.flatMap((c) => withinReach(c, prefs) ?? []);
  const fitting = reachable.filter((d) => d.weatherScore >= MIN_WEATHER_FIT);
  const wanted = Math.min(minDestinations, reachable.length);
  const relaxed = prefs.weather.length > 0 && fitting.length < wanted;
  const pool = relaxed ? reachable : fitting;
  return { destinations: pool.sort((a, b) => b.score - a.score).slice(0, limit), relaxed };
}

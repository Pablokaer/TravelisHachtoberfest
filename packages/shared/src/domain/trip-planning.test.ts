import { describe, expect, test } from 'vitest';

import {
  characterFit,
  interestFit,
  monthOf,
  shortlistDestinations,
  weatherFit,
  type MonthClimate,
  type PlanCity,
  type PlanPreferences,
} from './trip-planning.ts';

const climate = (over: Partial<MonthClimate> = {}): MonthClimate => ({
  tempMeanC: 22,
  tempMaxC: 27,
  precipMm: 40,
  snowfallCm: 0,
  sunshineHours: 9,
  ...over,
});

const city = (slug: string, lat: number, lng: number, over: Partial<PlanCity> = {}): PlanCity => ({
  slug,
  lat,
  lng,
  countryCode: 'XX',
  climate: climate(),
  facts: { population: 400_000, inceptionYear: 1500, beaches: 0 },
  profile: null,
  ...over,
});

const SAO_PAULO = { lat: -23.55, lng: -46.63 };
const prefs = (over: Partial<PlanPreferences> = {}): PlanPreferences => ({
  origin: SAO_PAULO,
  maxKm: null,
  month: 12,
  weather: [],
  attractions: [],
  character: [],
  ...over,
});

describe('monthOf', () => {
  test('reads the month of an ISO date', () => {
    expect(monthOf('2026-12-05')).toBe(12);
    expect(monthOf('2027-01-31')).toBe(1);
  });

  test('rejects text that is not a date, naming it', () => {
    expect(() => monthOf('december')).toThrow(/"december".*YYYY-MM-DD/);
  });
});

describe('weatherFit', () => {
  test('sunny wants many hours of sun and not a soaking month', () => {
    expect(weatherFit('sunny', climate({ sunshineHours: 10 }))).toBe(1);
    expect(weatherFit('sunny', climate({ sunshineHours: 3 }))).toBeLessThan(0.2);
    expect(weatherFit('sunny', climate({ sunshineHours: 10, precipMm: 250 }))).toBeLessThan(0.6);
  });

  test('warm, hot, mild and cool follow the temperature', () => {
    expect(weatherFit('warm', climate({ tempMeanC: 23 }))).toBe(1);
    expect(weatherFit('warm', climate({ tempMeanC: 2 }))).toBe(0);
    expect(weatherFit('hot', climate({ tempMeanC: 30, tempMaxC: 38 }))).toBe(1);
    expect(weatherFit('hot', climate({ tempMeanC: 15, tempMaxC: 20 }))).toBe(0);
    expect(weatherFit('mild', climate({ tempMeanC: 15 }))).toBe(1);
    expect(weatherFit('cool', climate({ tempMeanC: 6 }))).toBe(1);
    expect(weatherFit('cool', climate({ tempMeanC: 28 }))).toBe(0);
  });

  test('rainy and snow follow precipitation and snowfall', () => {
    expect(weatherFit('rainy', climate({ precipMm: 180 }))).toBe(1);
    expect(weatherFit('rainy', climate({ precipMm: 10 }))).toBe(0);
    expect(weatherFit('snow', climate({ snowfallCm: 40, tempMeanC: -4 }))).toBe(1);
    expect(weatherFit('snow', climate({ snowfallCm: 0 }))).toBe(0);
  });
});

describe('interestFit and characterFit', () => {
  test('beaches count the OpenStreetMap beaches of the city', () => {
    const beachy = city('a', 0, 0, { facts: { population: 1, inceptionYear: null, beaches: 8 } });
    const dry = city('b', 0, 0, { facts: { population: 1, inceptionYear: null, beaches: 0 } });
    expect(interestFit('beaches', beachy)).toBe(1);
    expect(interestFit('beaches', dry)).toBe(0);
  });

  test('castles use castles and palaces; a city without a profile scores nothing', () => {
    const profile = {
      attractionCount: 100,
      unescoCount: 0,
      castles: 4,
      palaces: 4,
      museums: 0,
      churches: 0,
      monuments: 0,
      parks: 0,
      nature: 0,
      viewpoints: 0,
      landmarks: 0,
    };
    expect(interestFit('castles', city('a', 0, 0, { profile }))).toBe(1);
    expect(interestFit('castles', city('b', 0, 0))).toBe(0);
  });

  test('ancient prefers the oldest cities, big and small follow the population', () => {
    const roman = city('a', 0, 0, {
      facts: { population: 3_000_000, inceptionYear: -753, beaches: 0 },
    });
    const newer = city('b', 0, 0, {
      facts: { population: 40_000, inceptionYear: 1850, beaches: 0 },
    });
    expect(characterFit('ancient', roman)).toBeGreaterThan(characterFit('ancient', newer));
    expect(characterFit('big-city', roman)).toBe(1);
    expect(characterFit('small-quiet', newer)).toBe(1);
  });
});

describe('shortlistDestinations', () => {
  test('never suggests a place farther than the traveller can go: Malta is out for São Paulo at 3,000 km', () => {
    const malta = city('valletta', 35.9, 14.5);
    const buenosAires = city('buenos-aires', -34.6, -58.4);
    const { destinations } = shortlistDestinations([malta, buenosAires], prefs({ maxKm: 3_000 }));
    expect(destinations.map((d) => d.slug)).toEqual(['buenos-aires']);
    expect(destinations[0]!.distanceKm).toBeGreaterThan(1_500);
  });

  test('no limit means any distance', () => {
    const malta = city('valletta', 35.9, 14.5);
    expect(shortlistDestinations([malta], prefs()).destinations).toHaveLength(1);
  });

  test('a December of sun leaves out the cities that are dark and cold that month', () => {
    const rio = city('rio', -22.9, -43.2, {
      climate: climate({ sunshineHours: 8, tempMeanC: 26 }),
    });
    const oslo = city('oslo', 59.9, 10.7, {
      climate: climate({ sunshineHours: 1, tempMeanC: -3, snowfallCm: 30 }),
    });
    const { destinations } = shortlistDestinations(
      [oslo, rio],
      prefs({ weather: ['sunny', 'warm'] }),
      25,
      1,
    );
    expect(destinations.map((d) => d.slug)).toEqual(['rio']);
  });

  test('cities without climate for the month are left out', () => {
    expect(
      shortlistDestinations([city('x', 0, 0, { climate: null })], prefs()).destinations,
    ).toEqual([]);
  });

  test('the best fit comes first and the list is cut to the limit', () => {
    const cities = [
      city('plain', 0, 1),
      city('beachy', 0, 2, { facts: { population: 1, inceptionYear: null, beaches: 9 } }),
      city('beachy-2', 0, 3, { facts: { population: 1, inceptionYear: null, beaches: 5 } }),
    ];
    const { destinations } = shortlistDestinations(cities, prefs({ attractions: ['beaches'] }), 2);
    expect(destinations.map((d) => d.slug)).toEqual(['beachy', 'beachy-2']);
  });

  test('when too few cities fit the weather it relaxes that rule and says so', () => {
    const cold = city('cold', 60, 10, { climate: climate({ tempMeanC: 0, sunshineHours: 1 }) });
    const result = shortlistDestinations([cold], prefs({ weather: ['hot'] }), 10, 3);
    expect(result.relaxed).toBe(true);
    expect(result.destinations.map((d) => d.slug)).toEqual(['cold']);
  });
});

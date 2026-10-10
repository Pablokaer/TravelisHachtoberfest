import { fakeCity } from '@/testing/fixtures';
import { candidatesFrom, planCitiesFrom } from '@/features/plan/plan-data';

const lisbon = fakeCity({
  slug: 'lisbon',
  nameEn: 'Lisbon',
  countryCode: 'PT',
  lat: 38.72,
  lng: -9.14,
});
const oslo = fakeCity({ slug: 'oslo', nameEn: 'Oslo', countryCode: 'NO', lat: 59.9, lng: 10.7 });

const climateRow = {
  city_slug: 'lisbon',
  month: 12,
  temp_mean_c: 12.4,
  temp_max_c: 15.1,
  precip_mm: 98.2,
  snowfall_cm: 0,
  sunshine_hours: 5.1,
};

describe('planCitiesFrom (D-081)', () => {
  test('joins each city with its climate, facts and profile; a city without climate keeps null', () => {
    const planCities = planCitiesFrom(
      [lisbon, oslo],
      [climateRow],
      [{ city_slug: 'lisbon', population: 545000, inception_year: null, beach_count: 12 }],
      [
        {
          city_slug: 'lisbon',
          attraction_count: 80,
          unesco_count: 4,
          castle_count: 3,
          palace_count: 5,
          museum_count: 40,
          church_count: 50,
          monument_count: 20,
          park_count: 6,
          nature_count: 2,
          viewpoint_count: 7,
          landmark_count: 9,
        },
      ],
    );
    const [first, second] = planCities;
    expect(first).toMatchObject({
      slug: 'lisbon',
      lat: 38.72,
      lng: -9.14,
      countryCode: 'PT',
      climate: {
        tempMeanC: 12.4,
        tempMaxC: 15.1,
        precipMm: 98.2,
        snowfallCm: 0,
        sunshineHours: 5.1,
      },
      facts: { population: 545000, inceptionYear: null, beaches: 12 },
      profile: { unescoCount: 4, castles: 3, palaces: 5, museums: 40, viewpoints: 7 },
    });
    expect(second).toMatchObject({ slug: 'oslo', climate: null, facts: null, profile: null });
  });
});

describe('candidatesFrom', () => {
  test('describes a shortlisted city with facts only, in the language of the interface', () => {
    const [city] = planCitiesFrom([lisbon], [climateRow], [], []);
    const candidates = candidatesFrom(
      [{ ...city!, distanceKm: 1912.4, score: 1, weatherScore: 1, interestScore: 1 }],
      [lisbon],
      'pt',
    );
    expect(candidates).toEqual([
      expect.objectContaining({
        slug: 'lisbon',
        distanceKm: 1912,
        facts: expect.objectContaining({ temp_mean_c: 12.4, sunshine_hours: 5.1, precip_mm: 98.2 }),
      }),
    ]);
  });
});

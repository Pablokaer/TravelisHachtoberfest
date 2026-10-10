import { cityFromRow } from '@/features/destinations/api';
import { searchCities } from '@/features/destinations/search';
import { cityRow, fakeCity } from '@/testing/fixtures';

const cities = [
  fakeCity(),
  fakeCity({
    slug: 'lisbon',
    nameEn: 'Lisbon',
    namePt: 'Lisboa',
    countryCode: 'PT',
    countryNameEn: 'Portugal',
    countryNamePt: 'Portugal',
  }),
  fakeCity({
    slug: 'rome',
    nameEn: 'Rome',
    namePt: 'Roma',
    countryCode: 'IT',
    countryNameEn: 'Italy',
    countryNamePt: 'Itália',
  }),
  fakeCity({
    slug: 'milan',
    nameEn: 'Milan',
    namePt: 'Milão',
    countryCode: 'IT',
    countryNameEn: 'Italy',
    countryNamePt: 'Itália',
  }),
];
const slugs = (list: readonly { slug: string }[]) => list.map((c) => c.slug);

describe('searchCities', () => {
  test('matches the start of a city name, ignoring case', () => {
    expect(slugs(searchCities(cities, 'AMST', 'en'))).toEqual(['amsterdam']);
  });

  test('matches Portuguese names and accents are ignored', () => {
    expect(slugs(searchCities(cities, 'lisboa', 'pt'))).toEqual(['lisbon']);
    expect(slugs(searchCities(cities, 'milao', 'pt'))).toEqual(['milan']);
  });

  test('matches the country, after any city-name match, A–Z', () => {
    expect(slugs(searchCities(cities, 'ital', 'en'))).toEqual(['milan', 'rome']);
    // "rom" is Rome by name; no country starts with it.
    expect(slugs(searchCities(cities, 'rom', 'en'))).toEqual(['rome']);
  });

  test('an empty or unmatched query finds nothing', () => {
    expect(searchCities(cities, '  ', 'en')).toEqual([]);
    expect(searchCities(cities, 'dublin', 'en')).toEqual([]);
  });
});

describe('cityFromRow', () => {
  test('maps the country name and the cover with its credit', () => {
    const city = cityFromRow(cityRow());
    expect(city.countryNameEn).toBe('Netherlands');
    expect(city.cover).toEqual({
      url: 'https://upload.wikimedia.org/amsterdam.jpg',
      author: 'Jose A.',
      license: 'CC BY 2.0',
    });
  });

  test('a city without any photographed attraction has no cover', () => {
    expect(cityFromRow(cityRow({ cover_image_url: null })).cover).toBeNull();
  });
});

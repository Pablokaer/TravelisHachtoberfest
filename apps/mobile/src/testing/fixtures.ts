import type { City } from '@/features/destinations/api';
import type { Database } from '@/lib/database.types';

type CityRow = Database['public']['Views']['city_list']['Row'];

/**
 * A `city_list` row as the database returns it.
 * @example cityRow({ slug: 'lisbon', name_en: 'Lisbon' })
 */
export function cityRow(overrides: Partial<CityRow> = {}): CityRow {
  return {
    slug: 'amsterdam',
    name_en: 'Amsterdam',
    name_pt: 'Amesterdão',
    country_code: 'NL',
    country_name_en: 'Netherlands',
    country_name_pt: 'Países Baixos',
    wikidata_id: 'Q727',
    lat: 52.37,
    lng: 4.9,
    bbox: [52.3, 4.8, 52.4, 5.0],
    timezone: 'Europe/Amsterdam',
    attraction_count: 269,
    cover_image_url: 'https://upload.wikimedia.org/amsterdam.jpg',
    cover_image_author: 'Jose A.',
    cover_image_license: 'CC BY 2.0',
    ...overrides,
  };
}

/** The same city as the app models it. */
export function fakeCity(overrides: Partial<City> = {}): City {
  return {
    slug: 'amsterdam',
    nameEn: 'Amsterdam',
    namePt: 'Amesterdão',
    countryCode: 'NL',
    countryNameEn: 'Netherlands',
    countryNamePt: 'Países Baixos',
    lat: 52.37,
    lng: 4.9,
    bbox: [52.3, 4.8, 52.4, 5.0],
    timezone: 'Europe/Amsterdam',
    attractionCount: 269,
    cover: {
      url: 'https://upload.wikimedia.org/amsterdam.jpg',
      author: 'Jose A.',
      license: 'CC BY 2.0',
    },
    ...overrides,
  };
}

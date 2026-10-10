// Content of the landing page's phone mockups (D-072). Only the mockups use it: "Popular
// destinations" reads the real cities from `city_list`. Names, categories, visit times, place
// counts and coordinates are the database's (2026-10-06); the ratings are illustrative, since a
// signed-out visitor cannot read reviews. Photos are Wikimedia Commons files bundled small, credited
// in the landing footer (LANDING_PHOTO_CREDITS) and in docs/DATA_SOURCES.md.
import type { AttractionCategory } from '@wayfarer/shared';
import type { ImageSourcePropType } from 'react-native';

/** A Commons photo bundled with the app, with the credit its licence asks for. */
export type BundledPhoto = { source: ImageSourcePropType; author: string; license: string };

/** A city card of the "Discover" mockup. */
export type MockCity = {
  slug: string;
  nameEn: string;
  namePt: string;
  countryCode: string;
  countryEn: string;
  countryPt: string;
  places: number;
  /** Illustrative: shown in the mockup only. */
  rating: string;
  photo: BundledPhoto;
};

/** A stop of the "My List" mockup; `pin` is its spot on the map image, as a share of its size. */
export type MockStop = {
  nameEn: string;
  namePt: string;
  category: AttractionCategory;
  minutes: number;
  photo: BundledPhoto;
  pin: { x: number; y: number };
};

/** Rooftops of Alfama from the Miradouro de Santa Luzia: the hero background. */
export const HERO_PHOTO: BundledPhoto = {
  source: require('../../../assets/images/landing/hero-lisbon.jpg'),
  author: 'Jakub Hałun',
  license: 'CC BY 4.0',
};

export const MOCK_CITIES: readonly MockCity[] = [
  {
    slug: 'lisbon',
    nameEn: 'Lisbon',
    namePt: 'Lisboa',
    countryCode: 'PT',
    countryEn: 'Portugal',
    countryPt: 'Portugal',
    places: 300,
    rating: '4.8',
    photo: {
      source: require('../../../assets/images/landing/mock-lisbon.jpg'),
      author: 'Dale Cruse',
      license: 'CC BY 4.0',
    },
  },
  {
    slug: 'tokyo',
    nameEn: 'Tokyo',
    namePt: 'Tóquio',
    countryCode: 'JP',
    countryEn: 'Japan',
    countryPt: 'Japão',
    places: 300,
    rating: '4.7',
    photo: {
      source: require('../../../assets/images/landing/mock-tokyo.jpg'),
      author: 'Akonnchiroll',
      license: 'CC BY-SA 4.0',
    },
  },
];

/**
 * Belém, Lisbon, in walking order. The map is a MapLibre render of OpenFreeMap tiles with the
 * route drawn through these stops; `pin` comes from `map.project` on that render (476 × 380 px).
 */
export const MOCK_MAP = {
  source: require('../../../assets/images/landing/mock-map-belem.jpg') as ImageSourcePropType,
  aspectRatio: 476 / 380,
};

export const MOCK_STOPS: readonly MockStop[] = [
  {
    nameEn: 'Belém Palace',
    namePt: 'Palácio Nacional de Belém',
    category: 'palace',
    minutes: 75,
    photo: {
      source: require('../../../assets/images/landing/stop-1.jpg'),
      author: 'Kent Wang',
      license: 'CC BY 4.0',
    },
    pin: { x: 0.882, y: 0.234 },
  },
  {
    nameEn: 'Jerónimos Monastery',
    namePt: 'Mosteiro dos Jerónimos',
    category: 'church',
    minutes: 30,
    photo: {
      source: require('../../../assets/images/landing/stop-2.jpg'),
      author: 'Holger Uwe Schmitt',
      license: 'CC BY-SA 4.0',
    },
    pin: { x: 0.631, y: 0.246 },
  },
  {
    nameEn: 'Padrão dos Descobrimentos',
    namePt: 'Padrão dos Descobrimentos',
    category: 'monument',
    minutes: 20,
    photo: {
      source: require('../../../assets/images/landing/stop-3.jpg'),
      author: 'Jean-Christophe Benoist',
      license: 'CC BY 4.0',
    },
    pin: { x: 0.627, y: 0.582 },
  },
  {
    nameEn: 'Belém Tower',
    namePt: 'Torre de Belém',
    category: 'castle',
    minutes: 90,
    photo: {
      source: require('../../../assets/images/landing/stop-4.jpg'),
      author: 'Rehman Abubakr',
      license: 'CC BY-SA 4.0',
    },
    pin: { x: 0.118, y: 0.766 },
  },
];

/** Every bundled photo of the landing page, credited once in its footer. */
export const LANDING_PHOTO_CREDITS: readonly BundledPhoto[] = [
  HERO_PHOTO,
  ...MOCK_CITIES.map((city) => city.photo),
  ...MOCK_STOPS.map((stop) => stop.photo),
];

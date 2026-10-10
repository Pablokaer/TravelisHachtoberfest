export const SUPPORTED_LANGUAGES = ['en', 'pt'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = 'en';

export const UNITS = ['metric', 'imperial'] as const;
export type Units = (typeof UNITS)[number];

/** Colour themes the user can pick; the app starts light (D-021). */
export const THEMES = ['light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];
export const DEFAULT_THEME: Theme = 'light';

export const ATTRACTION_CATEGORIES = [
  'museum',
  'monument',
  'church',
  'castle',
  'viewpoint',
  'landmark',
  'park',
  // Natural sights (beaches, waterfalls, national parks, mountains…), D-068. Right after park,
  // as in the database enum.
  'nature',
  'palace',
  'other',
] as const;
export type AttractionCategory = (typeof ATTRACTION_CATEGORIES)[number];

/** Default visit duration per category, in minutes (overridable per attraction). */
export const DEFAULT_VISIT_MINUTES: Record<AttractionCategory, number> = {
  museum: 90,
  monument: 20,
  church: 30,
  castle: 90,
  viewpoint: 15,
  landmark: 20,
  park: 45,
  nature: 90,
  palace: 75,
  other: 30,
};

export const ROUTE_MIN_STOPS = 2;
/** Stops per route (the whole tray, before any split); raised from 12 (D-030). */
export const ROUTE_MAX_STOPS = 20;
/** "Suggest a split" offers at most this many routes (what 12 stops allowed). */
export const ROUTE_MAX_SPLIT_PARTS = 6;
/** A route with at least this many stops can be split into several routes. */
export const ROUTE_SPLIT_MIN_STOPS = 5;

export const VISA_REQUIREMENTS = [
  'freedom_of_movement',
  'visa_free',
  'visa_on_arrival',
  'eta',
  'e_visa',
  'visa_required',
  'no_admission',
] as const;
export type VisaRequirement = (typeof VISA_REQUIREMENTS)[number];

/** Best-first ranking used when a traveller holds several passports. */
export const VISA_RANK: Record<VisaRequirement, number> = Object.fromEntries(
  VISA_REQUIREMENTS.map((r, i) => [r, i]),
) as Record<VisaRequirement, number>;

export const MAX_NATIONALITIES = 5;

/** Star ratings are whole numbers in this range (D-028; mirrored by a DB check). */
export const REVIEW_RATING_MIN = 1;
export const REVIEW_RATING_MAX = 5;
/** Longest review comment, in characters (mirrored by a DB check). */
export const REVIEW_COMMENT_MAX = 1000;

/**
 * Who can open a saved trip (walk list) by its link (D-031): only the owner, anyone, or anyone
 * with the password. Mirrored by a DB check on `trips.visibility`.
 */
export const TRIP_VISIBILITIES = ['private', 'public', 'password'] as const;
export type TripVisibility = (typeof TRIP_VISIBILITIES)[number];
export const DEFAULT_TRIP_VISIBILITY: TripVisibility = 'private';
/** Trip password length, in characters; bcrypt reads at most 72 bytes (`set_trip_visibility`). */
export const TRIP_PASSWORD_MIN = 4;
export const TRIP_PASSWORD_MAX = 72;

/**
 * Orders of the public walk list listing (D-035), as `list_walklists(p_sort)` accepts them:
 * best average first, lowest first, most reviews first, newest first.
 */
export const WALKLIST_SORTS = ['top', 'lowest', 'most_reviewed', 'newest'] as const;
export type WalklistSort = (typeof WALKLIST_SORTS)[number];
/** Lists per page on "View all walk lists" (`list_walklists` returns at most 50). */
export const WALKLIST_PAGE_SIZE = 20;
/** Lists in each preview section of the city page (community, official). */
export const WALKLIST_PREVIEW_COUNT = 6;
/** Soonest meetups ranked on the city page (D-041). */
export const MEETUP_PREVIEW_COUNT = 5;

/** EU member states (ISO alpha-2). */
export const EU_COUNTRIES = [
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
] as const;

/** EU + EEA (Iceland, Liechtenstein, Norway) + Switzerland: free movement area. */
export const FREE_MOVEMENT_COUNTRIES = [...EU_COUNTRIES, 'IS', 'LI', 'NO', 'CH'] as const;

/** Schengen area members (2026). */
export const SCHENGEN_COUNTRIES = [
  'AT',
  'BE',
  'BG',
  'HR',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IS',
  'IT',
  'LV',
  'LI',
  'LT',
  'LU',
  'MT',
  'NL',
  'NO',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
  'CH',
] as const;

/** Walking model used for estimates and the offline route fallback. */
export const WALKING_SPEED_M_PER_S = 1.25; // 4.5 km/h
/** Straight-line → street-network distance factor for the fallback estimate. */
export const WALKING_DETOUR_FACTOR = 1.3;

/** Edge Function cache TTLs (seconds). */
export const CACHE_TTL = {
  weather: 3 * 3600,
  advisory: 24 * 3600,
  fx: 24 * 3600,
  route: 30 * 24 * 3600,
} as const;

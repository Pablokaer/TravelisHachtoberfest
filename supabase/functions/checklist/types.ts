import type { VisaOption, WeatherDay } from '@wayfarer/shared';

export type CountryRow = {
  code: string;
  name_en: string;
  name_pt: string;
  currency_codes: string[];
  plug_types: string[];
  voltage: number | null;
  frequency_hz: number | null;
  driving_side: 'left' | 'right' | null;
  calling_code: string | null;
  emergency_number: string | null;
  police_number: string | null;
  ambulance_number: string | null;
  fire_number: string | null;
  languages: string[];
  timezones: string[];
};

export type CityRow = {
  slug: string;
  name_en: string;
  name_pt: string;
  country_code: string;
  lat: number;
  lng: number;
  timezone: string | null;
};

/** A city with its country and the traveller's home country (one row each, in any order). */
export type Place = { city: CityRow; countries: CountryRow[] };

/** Reference-data lookups (Postgres in production, fakes in tests). */
export interface ChecklistDb {
  /** The city and its countries in one round trip; null for an unknown city. */
  getPlace(citySlug: string, homeCountry: string): Promise<Place | null>;
  /** Visa rules of the city's country for each of the given passports (by city: no wait). */
  getVisaOptions(citySlug: string, passports: string[]): Promise<VisaOption[]>;
}

export type Climate = {
  month: number;
  years: number;
  avgMinC: number;
  avgMaxC: number;
  avgPrecipitationMm: number;
  avgRainyDays: number;
};

export interface WeatherProvider {
  /** Daily forecast for [start, end] (ISO dates, inclusive). */
  forecast(q: { lat: number; lng: number; start: string; end: string }): Promise<WeatherDay[]>;
  /** Averages for `month` (1–12) over the calendar years [fromYear, toYear]. */
  climate(q: {
    lat: number;
    lng: number;
    month: number;
    fromYear: number;
    toYear: number;
  }): Promise<Climate>;
}

export type FxQuote = { rate: number; date: string | null; provider: string };

/** 1 unit of `base` = rate × `symbol`. Null when no provider knows the pair. */
export type FxProvider = (base: string, symbol: string) => Promise<FxQuote | null>;

export type Advisory = {
  level: number;
  hasRegionalAdvisory: boolean;
  textEn: string;
  urlSlug: string;
  publishedAt: string | null;
};

/** Travel advisory for an ISO country code, or null when the source has no entry. */
export type AdvisoryProvider = (countryCode: string) => Promise<Advisory | null>;

export type ChecklistDeps = {
  db: ChecklistDb;
  weather: WeatherProvider;
  fx: FxProvider;
  advisory: AdvisoryProvider;
  now: () => Date;
};

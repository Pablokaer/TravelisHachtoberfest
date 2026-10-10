// POST /checklist — pre-trip checklist for one city and the traveller's passports.
// Every section is built independently: a failing provider yields
// `{ status: 'unavailable', reason }` for that section only.
import {
  bestVisaOption,
  type ChecklistRequest,
  checklistRequestSchema,
  type ChecklistResponse,
  checklistResponseSchema,
  checkPassportValidity,
  checkPower,
  type VisaOption,
} from '@wayfarer/shared';

import {
  handleOptions,
  internalError,
  json,
  methodNotAllowed,
  notFound,
  parseJsonBody,
} from '../_shared/cors.ts';
import type { ChecklistDeps, CityRow, CountryRow } from './types.ts';

export const VISA_SOURCE_URL = 'https://github.com/ilyankou/passport-index-dataset';
export const WEATHER_ATTRIBUTION = 'Weather data by Open-Meteo.com';
export const ADVISORY_SOURCE_NAME = 'Government of Canada — travel advice';
/** Open-Meteo forecasts 16 days: today + 15. */
export const FORECAST_HORIZON_DAYS = 15;
const FORECAST_MAX_DAYS = 7;
const CLIMATE_YEARS = 5;

/**
 * GOV.UK foreign travel advice slugs that differ from the lower-kebab English name
 * (verified 2026-09). Travellers *to* the UK have no FCDO page: link to entry requirements.
 */
const GOV_UK_SLUGS: Record<string, string> = {
  TR: 'turkey',
  CZ: 'czechia',
  NL: 'netherlands',
  US: 'usa',
};
const GOV_UK_TO_UK_URL = 'https://www.gov.uk/browse/visas-immigration';

type Sections = Omit<ChecklistResponse, 'destination' | 'generatedAt'>;
type Ok<K extends keyof Sections> = Extract<Sections[K], { status: 'ok' }>;
type Unavailable = { status: 'unavailable'; reason: string };

class SectionUnavailable extends Error {}
/** Throw inside a section builder to mark it unavailable with a clean reason. */
const unavailable = (reason: string): never => {
  throw new SectionUnavailable(reason);
};

export const isoDay = (d: Date): string => d.toISOString().slice(0, 10);

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDay(d);
}

const minIso = (...xs: string[]) => xs.reduce((a, b) => (b < a ? b : a));

export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function ukAdviceUrl(country: Pick<CountryRow, 'code' | 'name_en'>): string {
  if (country.code === 'GB') return GOV_UK_TO_UK_URL;
  const slug = GOV_UK_SLUGS[country.code] ?? slugify(country.name_en);
  return `https://www.gov.uk/foreign-travel-advice/${slug}`;
}

/** Decides forecast vs climate mode and the date window for the weather section. */
export function weatherPlan(
  today: string,
  arrival: string,
  departure: string | null,
):
  | { mode: 'forecast'; start: string; end: string }
  | { mode: 'climate'; month: number; fromYear: number; toYear: number } {
  const horizon = addDays(today, FORECAST_HORIZON_DAYS);
  if (arrival >= today && arrival <= horizon) {
    const last = addDays(arrival, FORECAST_MAX_DAYS - 1);
    const end = minIso(departure && departure >= arrival ? departure : last, last, horizon);
    return { mode: 'forecast', start: arrival, end };
  }
  const thisYear = Number(today.slice(0, 4));
  return {
    mode: 'climate',
    month: Number(arrival.slice(5, 7)),
    fromYear: thisYear - CLIMATE_YEARS,
    toYear: thisYear - 1,
  };
}

type Context = {
  req: ChecklistRequest;
  today: string;
  arrival: string;
  city: CityRow;
  dest: CountryRow;
  home: CountryRow | null;
  /** Read alongside the city, not after it (D-054). */
  visaOptions: Promise<VisaOption[]>;
};

async function settle<K extends keyof Sections>(
  name: K,
  build: () => Promise<Omit<Ok<K>, 'status'>>,
): Promise<Ok<K> | Unavailable> {
  try {
    return { status: 'ok', ...(await build()) } as Ok<K>;
  } catch (err) {
    if (err instanceof SectionUnavailable) return { status: 'unavailable', reason: err.message };
    console.warn(`checklist section ${name} failed:`, err);
    const reason = err instanceof Error && err.message ? err.message : 'provider error';
    return { status: 'unavailable', reason: `provider_error: ${reason}`.slice(0, 200) };
  }
}

function buildSections(deps: ChecklistDeps, ctx: Context) {
  const { req, dest, home, city } = ctx;

  const visa = settle('visa', async () => {
    const options = await ctx.visaOptions;
    const best = bestVisaOption(dest.code, req.nationalities, options) ??
      unavailable('no_visa_data');
    return {
      best,
      options: options
        .filter((o) => req.nationalities.includes(o.nationality))
        .map(({ nationality, requirement, maxStayDays }) => ({
          nationality,
          requirement,
          maxStayDays,
        })),
      sourceUrl: VISA_SOURCE_URL,
    };
  });

  const passport = settle('passport', () => {
    const check = checkPassportValidity({
      destination: dest.code,
      nationalities: req.nationalities,
      arrival: ctx.arrival,
      departure: req.departure ?? null,
      passportExpiry: req.passportExpiry ?? null,
    });
    return Promise.resolve({
      rule: check.rule,
      requiredUntil: check.requiredUntil,
      validity: check.status,
      passportExpiry: check.passportExpiry,
    });
  });

  const power = settle('power', () => {
    const homePlugs = home?.plug_types ?? [];
    const homeVoltage = home?.voltage ?? null;
    const check = checkPower({
      homePlugs,
      homeVoltage,
      destinationPlugs: dest.plug_types,
      destinationVoltage: dest.voltage,
    });
    return Promise.resolve({
      destinationPlugs: dest.plug_types,
      destinationVoltage: dest.voltage,
      destinationFrequencyHz: dest.frequency_hz,
      homePlugs,
      homeVoltage,
      adapterNeeded: check.adapterNeeded,
      voltageDiffers: check.voltageDiffers,
    });
  });

  const weather = settle('weather', async () => {
    const plan = weatherPlan(ctx.today, ctx.arrival, req.departure ?? null);
    if (plan.mode === 'forecast') {
      const { start, end } = plan;
      const days = await deps.weather.forecast({ lat: city.lat, lng: city.lng, start, end });
      return { mode: 'forecast' as const, days, climate: null, attribution: WEATHER_ATTRIBUTION };
    }
    const { month, fromYear, toYear } = plan;
    const climate = await deps.weather.climate({
      lat: city.lat,
      lng: city.lng,
      month,
      fromYear,
      toYear,
    });
    return { mode: 'climate' as const, days: [], climate, attribution: WEATHER_ATTRIBUTION };
  });

  const money = settle('money', async () => {
    const currency = dest.currency_codes[0] ?? unavailable('no_currency_data');
    const homeCurrency = home?.currency_codes[0] ?? null;
    const base = { currency, homeCurrency, rate: null, rateDate: null, provider: null };
    if (!homeCurrency) return base;
    if (homeCurrency === currency) return { ...base, rate: 1 };
    try {
      const quote = await deps.fx(homeCurrency, currency);
      return quote
        ? { ...base, rate: quote.rate, rateDate: quote.date, provider: quote.provider }
        : base;
    } catch (err) {
      // The currency itself is still useful without a rate.
      console.warn('fx failed:', err);
      return base;
    }
  });

  const safety = settle('safety', async () => {
    const a = (await deps.advisory(dest.code)) ?? unavailable('no_advisory_data');
    return {
      level: a.level,
      hasRegionalAdvisory: a.hasRegionalAdvisory,
      summary: a.textEn,
      publishedAt: a.publishedAt,
      sourceName: ADVISORY_SOURCE_NAME,
      sourceUrl: `https://travel.gc.ca/destinations/${encodeURIComponent(a.urlSlug)}`,
      ukAdviceUrl: ukAdviceUrl(dest),
    };
  });

  const practical = settle('practical', () =>
    Promise.resolve({
      drivingSide: dest.driving_side,
      callingCode: dest.calling_code,
      emergency: {
        general: dest.emergency_number,
        police: dest.police_number,
        ambulance: dest.ambulance_number,
        fire: dest.fire_number,
      },
      languages: dest.languages,
      timezone: city.timezone ?? dest.timezones[0] ?? null,
    }));

  return { visa, passport, power, weather, money, safety, practical };
}

export function createHandler(deps: ChecklistDeps): (req: Request) => Promise<Response> {
  return async (req) => {
    const preflight = handleOptions(req);
    if (preflight) return preflight;
    if (req.method !== 'POST') return methodNotAllowed();

    const body = await parseJsonBody(req, checklistRequestSchema);
    if (!body.ok) return body.response;
    const input = body.data;

    try {
      const now = deps.now();
      const today = isoDay(now);
      const homeCode = input.homeCountry ?? input.nationalities[0]!;
      // Both reads start at once: the visa rules are looked up by city, so they need not wait.
      const visaOptions = deps.db.getVisaOptions(input.city, input.nationalities);
      visaOptions.catch(() => undefined); // a failure belongs to the visa section alone
      const place = await deps.db.getPlace(input.city, homeCode);
      if (!place) return notFound('city_not_found', `unknown city "${input.city}"`);

      const { city, countries } = place;
      const dest = countries.find((c) => c.code === city.country_code);
      if (!dest) throw new Error(`country ${city.country_code} missing for city ${city.slug}`);
      const home = countries.find((c) => c.code === homeCode) ?? null;

      const ctx: Context = {
        req: input,
        today,
        arrival: input.arrival ?? today,
        city,
        dest,
        home,
        visaOptions,
      };
      const s = buildSections(deps, ctx);
      const [visa, passport, power, weather, money, safety, practical] = await Promise.all([
        s.visa,
        s.passport,
        s.power,
        s.weather,
        s.money,
        s.safety,
        s.practical,
      ]);

      const response: ChecklistResponse = {
        destination: {
          code: dest.code,
          nameEn: dest.name_en,
          namePt: dest.name_pt,
          city: city.slug,
        },
        generatedAt: now.toISOString(),
        visa,
        passport,
        power,
        weather,
        money,
        safety,
        practical,
      };
      // Guard the contract: a malformed payload is a bug, not something to ship to the app.
      return json(checklistResponseSchema.parse(response));
    } catch (err) {
      return internalError(err);
    }
  };
}

import { assert, assertEquals, assertMatch } from 'jsr:@std/assert@1';
import { type ChecklistResponse, checklistResponseSchema, type VisaOption } from '@wayfarer/shared';

import { createHandler, ukAdviceUrl, weatherPlan } from './handler.ts';
import type { ChecklistDeps, CityRow, CountryRow } from './types.ts';

const country = (over: Partial<CountryRow> & Pick<CountryRow, 'code'>): CountryRow => ({
  name_en: over.code,
  name_pt: over.code,
  currency_codes: [],
  plug_types: [],
  voltage: null,
  frequency_hz: null,
  driving_side: 'right',
  calling_code: null,
  emergency_number: null,
  police_number: null,
  ambulance_number: null,
  fire_number: null,
  languages: [],
  timezones: [],
  ...over,
});

const COUNTRIES: CountryRow[] = [
  country({
    code: 'PT',
    name_en: 'Portugal',
    name_pt: 'Portugal',
    currency_codes: ['EUR'],
    plug_types: ['C', 'F'],
    voltage: 230,
    frequency_hz: 50,
    calling_code: '+351',
    emergency_number: '112',
    police_number: '112',
    ambulance_number: '112',
    fire_number: '112',
    languages: ['pt'],
    timezones: ['Europe/Lisbon', 'Atlantic/Azores'],
  }),
  country({
    code: 'BR',
    name_en: 'Brazil',
    name_pt: 'Brasil',
    currency_codes: ['BRL'],
    plug_types: ['N', 'C'],
    voltage: 127,
    frequency_hz: 60,
  }),
  country({ code: 'US', currency_codes: ['USD'], plug_types: ['A', 'B'], voltage: 120 }),
  country({ code: 'IT', currency_codes: ['EUR'], plug_types: ['C', 'F', 'L'], voltage: 230 }),
  country({
    code: 'GB',
    name_en: 'United Kingdom',
    currency_codes: ['GBP'],
    plug_types: ['G'],
    voltage: 230,
    driving_side: 'left',
  }),
];

const LISBON: CityRow = {
  slug: 'lisbon',
  name_en: 'Lisbon',
  name_pt: 'Lisboa',
  country_code: 'PT',
  lat: 38.7223,
  lng: -9.1393,
  timezone: 'Europe/Lisbon',
};

const VISA: VisaOption[] = [
  { nationality: 'BR', requirement: 'visa_free', maxStayDays: 90 },
  { nationality: 'US', requirement: 'visa_free', maxStayDays: 90 },
  { nationality: 'IN', requirement: 'visa_required', maxStayDays: null },
];

const NOW = new Date('2026-09-27T10:00:00Z');

type Calls = { forecast: unknown[]; climate: unknown[]; fx: [string, string][] };

function fakeDeps(over: Partial<ChecklistDeps> = {}): { deps: ChecklistDeps; calls: Calls } {
  const calls: Calls = { forecast: [], climate: [], fx: [] };
  const deps: ChecklistDeps = {
    db: {
      getPlace: (slug, home) =>
        Promise.resolve(
          slug === 'lisbon'
            ? {
              city: LISBON,
              countries: COUNTRIES.filter((c) => c.code === 'PT' || c.code === home),
            }
            : null,
        ),
      getVisaOptions: (citySlug, passports) =>
        Promise.resolve(
          citySlug === 'lisbon' ? VISA.filter((v) => passports.includes(v.nationality)) : [],
        ),
    },
    weather: {
      forecast: (q) => {
        calls.forecast.push(q);
        return Promise.resolve([
          {
            date: q.start,
            tempMinC: 18,
            tempMaxC: 27.5,
            precipitationMm: 0,
            precipitationProbability: 5,
            weatherCode: 1,
          },
        ]);
      },
      climate: (q) => {
        calls.climate.push(q);
        return Promise.resolve({
          month: q.month,
          years: 5,
          avgMinC: 8.1,
          avgMaxC: 15.2,
          avgPrecipitationMm: 3.4,
          avgRainyDays: 11.2,
        });
      },
    },
    fx: (base, symbol) => {
      calls.fx.push([base, symbol]);
      return Promise.resolve({ rate: 0.17, date: '2026-09-25', provider: 'Frankfurter (ECB)' });
    },
    advisory: (code) =>
      Promise.resolve(
        code === 'PT'
          ? {
            level: 0,
            hasRegionalAdvisory: false,
            textEn: 'Exercise normal security precautions',
            urlSlug: 'portugal',
            publishedAt: '2026-09-24',
          }
          : null,
      ),
    now: () => NOW,
    ...over,
  };
  return { deps, calls };
}

async function post(deps: ChecklistDeps, body: unknown): Promise<Response> {
  return await createHandler(deps)(
    new Request('http://localhost/checklist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

async function ok(deps: ChecklistDeps, body: unknown): Promise<ChecklistResponse> {
  const res = await post(deps, body);
  assertEquals(res.status, 200, await res.clone().text());
  return checklistResponseSchema.parse(await res.json());
}

function okSection<T extends { status: string }>(s: T): Extract<T, { status: 'ok' }> {
  assertEquals(s.status, 'ok', JSON.stringify(s));
  return s as Extract<T, { status: 'ok' }>;
}

Deno.test('checklist: full response for a Brazilian in Lisbon validates against the schema', async () => {
  const { deps } = fakeDeps();
  const r = await ok(deps, { city: 'lisbon', nationalities: ['BR'] });
  assertEquals(r.destination, {
    code: 'PT',
    nameEn: 'Portugal',
    namePt: 'Portugal',
    city: 'lisbon',
  });
  assertEquals(r.generatedAt, NOW.toISOString());

  const visa = okSection(r.visa);
  assertEquals(visa.best, {
    nationality: 'BR',
    requirement: 'visa_free',
    maxStayDays: 90,
    isCitizen: false,
  });
  assertEquals(visa.sourceUrl, 'https://github.com/ilyankou/passport-index-dataset');

  const passport = okSection(r.passport);
  assertEquals(passport.rule, 'schengen_3m_after_departure');
  // arrival defaults to today, departure to arrival + 7 → 2026-10-04 + 3 months.
  assertEquals(passport.requiredUntil, '2027-01-04');
  // No expiry date: the passport is assumed valid.
  assertEquals(passport.validity, 'ok');

  const power = okSection(r.power);
  assertEquals(power.homePlugs, ['N', 'C']);
  assertEquals(power.adapterNeeded, false); // C fits F sockets
  assertEquals(power.voltageDiffers, true); // 127 V vs 230 V

  const money = okSection(r.money);
  assertEquals([money.currency, money.homeCurrency, money.rate], ['EUR', 'BRL', 0.17]);

  const safety = okSection(r.safety);
  assertEquals(safety.level, 0);
  assertEquals(safety.sourceUrl, 'https://travel.gc.ca/destinations/portugal');
  assertEquals(safety.ukAdviceUrl, 'https://www.gov.uk/foreign-travel-advice/portugal');
  assertEquals(safety.sourceName, 'Government of Canada — travel advice');

  const practical = okSection(r.practical);
  assertEquals(practical.timezone, 'Europe/Lisbon');
  assertEquals(practical.emergency.general, '112');
  assertEquals(practical.callingCode, '+351');
});

Deno.test('checklist: citizen of the destination gets freedom of movement', async () => {
  const { deps } = fakeDeps();
  const r = await ok(deps, { city: 'lisbon', nationalities: ['PT'] });
  const visa = okSection(r.visa);
  assertEquals(visa.best.isCitizen, true);
  assertEquals(visa.best.requirement, 'freedom_of_movement');
  assertEquals(okSection(r.passport).rule, 'free_movement');
});

Deno.test('checklist: multi-passport picks the best option and lists every held one', async () => {
  const { deps } = fakeDeps();
  const r = await ok(deps, { city: 'lisbon', nationalities: ['IN', 'US'], homeCountry: 'US' });
  const visa = okSection(r.visa);
  assertEquals(visa.best.nationality, 'US');
  assertEquals(visa.options.map((o) => o.nationality).sort(), ['IN', 'US']);
  const power = okSection(r.power);
  assertEquals(power.adapterNeeded, true);
  assertEquals(okSection(r.money).homeCurrency, 'USD');
});

Deno.test('checklist: visa unavailable when there are no rows and no citizenship', async () => {
  const { deps } = fakeDeps();
  const r = await ok(deps, { city: 'lisbon', nationalities: ['ZZ'] });
  assertEquals(r.visa, { status: 'unavailable', reason: 'no_visa_data' });
  // Unknown home country: power and money still answer with what is known.
  assertEquals(okSection(r.power).adapterNeeded, null);
  assertEquals(okSection(r.money).homeCurrency, null);
});

Deno.test('checklist: forecast mode when arrival is within the forecast horizon', async () => {
  const { deps, calls } = fakeDeps();
  const r = await ok(deps, {
    city: 'lisbon',
    nationalities: ['BR'],
    arrival: '2026-10-01',
    departure: '2026-10-20',
  });
  const weather = okSection(r.weather);
  assertEquals(weather.mode, 'forecast');
  assertEquals(weather.climate, null);
  assertEquals(weather.attribution, 'Weather data by Open-Meteo.com');
  assertEquals(calls.climate.length, 0);
  // capped at 7 days (arrival + 6)
  assertEquals((calls.forecast[0] as { end: string }).end, '2026-10-07');
});

Deno.test('checklist: climate mode for trips beyond the forecast horizon', async () => {
  const { deps, calls } = fakeDeps();
  const r = await ok(deps, { city: 'lisbon', nationalities: ['BR'], arrival: '2027-01-15' });
  const weather = okSection(r.weather);
  assertEquals(weather.mode, 'climate');
  assertEquals(weather.days, []);
  assertEquals(weather.climate?.month, 1);
  assertEquals(calls.forecast.length, 0);
  assertEquals(calls.climate[0], {
    lat: LISBON.lat,
    lng: LISBON.lng,
    month: 1,
    fromYear: 2021,
    toYear: 2025,
  });
});

Deno.test('weatherPlan: window boundaries', () => {
  assertEquals(weatherPlan('2026-09-27', '2026-09-27', null), {
    mode: 'forecast',
    start: '2026-09-27',
    end: '2026-10-03',
  });
  assertEquals(weatherPlan('2026-09-27', '2026-10-10', '2026-10-11'), {
    mode: 'forecast',
    start: '2026-10-10',
    end: '2026-10-11',
  });
  // near the horizon, the window is clipped to today + 15
  assertEquals(weatherPlan('2026-09-27', '2026-10-12', null), {
    mode: 'forecast',
    start: '2026-10-12',
    end: '2026-10-12',
  });
  assertEquals(weatherPlan('2026-09-27', '2026-10-13', null).mode, 'climate');
  assertEquals(weatherPlan('2026-09-27', '2026-09-01', null).mode, 'climate');
});

Deno.test('checklist: same currency → rate 1 without a provider call', async () => {
  const { deps, calls } = fakeDeps();
  const r = await ok(deps, { city: 'lisbon', nationalities: ['IT'] });
  const money = okSection(r.money);
  assertEquals([money.currency, money.homeCurrency, money.rate, money.provider], [
    'EUR',
    'EUR',
    1,
    null,
  ]);
  assertEquals(calls.fx.length, 0);
});

Deno.test('checklist: FX failure keeps the money section with a null rate', async () => {
  const { deps } = fakeDeps({ fx: () => Promise.reject(new Error('down')) });
  const r = await ok(deps, { city: 'lisbon', nationalities: ['BR'] });
  const money = okSection(r.money);
  assertEquals([money.currency, money.rate, money.provider], ['EUR', null, null]);
});

Deno.test('checklist: a failing provider marks only its section unavailable', async () => {
  const { deps } = fakeDeps({
    weather: {
      forecast: () => Promise.reject(new Error('timeout')),
      climate: () => Promise.reject(new Error('timeout')),
    },
    advisory: () => Promise.reject(new Error('HTTP 503 from data.international.gc.ca')),
  });
  const r = await ok(deps, { city: 'lisbon', nationalities: ['BR'] });
  assertEquals(r.weather.status, 'unavailable');
  assertEquals(r.safety.status, 'unavailable');
  if (r.safety.status === 'unavailable') assertMatch(r.safety.reason, /^provider_error/);
  for (const s of [r.visa, r.passport, r.power, r.money, r.practical]) okSection(s);
});

Deno.test('checklist: a failing DB visa lookup does not fail the response', async () => {
  const { deps } = fakeDeps();
  deps.db.getVisaOptions = () => Promise.reject(new Error('db down'));
  const r = await ok(deps, { city: 'lisbon', nationalities: ['BR'] });
  assertEquals(r.visa.status, 'unavailable');
  okSection(r.weather);
});

Deno.test('checklist: one read for the city and its countries, the visa rules read alongside', async () => {
  const { deps } = fakeDeps();
  const place = deps.db.getPlace;
  const visa = deps.db.getVisaOptions;
  let placeReads = 0;
  let placeAnswered = false;
  let visaWaitedForPlace = true;
  deps.db.getPlace = async (...args) => {
    placeReads++;
    const answer = await place(...args);
    placeAnswered = true;
    return answer;
  };
  deps.db.getVisaOptions = (...args) => {
    visaWaitedForPlace = placeAnswered;
    return visa(...args);
  };
  okSection((await ok(deps, { city: 'lisbon', nationalities: ['BR'], homeCountry: 'BR' })).visa);
  assertEquals(placeReads, 1);
  assertEquals(visaWaitedForPlace, false);
});

Deno.test('checklist: an unknown city is a 404, even when the visa read fails', async () => {
  const { deps } = fakeDeps();
  deps.db.getVisaOptions = () => Promise.reject(new Error('db down'));
  assertEquals((await post(deps, { city: 'atlantis', nationalities: ['BR'] })).status, 404);
});

Deno.test('checklist: passport expiry maps to validity', async () => {
  const { deps } = fakeDeps();
  const r = await ok(deps, {
    city: 'lisbon',
    nationalities: ['BR'],
    arrival: '2026-11-01',
    departure: '2026-11-10',
    passportExpiry: '2026-12-01',
  });
  const p = okSection(r.passport);
  assertEquals(p.requiredUntil, '2027-02-10');
  assertEquals(p.validity, 'problem');
  assertEquals(p.passportExpiry, '2026-12-01');
});

Deno.test('ukAdviceUrl: exceptions and default slug', () => {
  assertEquals(
    ukAdviceUrl({ code: 'TR', name_en: 'Türkiye' }),
    'https://www.gov.uk/foreign-travel-advice/turkey',
  );
  assertEquals(
    ukAdviceUrl({ code: 'CZ', name_en: 'Czech Republic' }),
    'https://www.gov.uk/foreign-travel-advice/czechia',
  );
  assertEquals(
    ukAdviceUrl({ code: 'NL', name_en: 'Kingdom of the Netherlands' }),
    'https://www.gov.uk/foreign-travel-advice/netherlands',
  );
  assertEquals(
    ukAdviceUrl({ code: 'GB', name_en: 'United Kingdom' }),
    'https://www.gov.uk/browse/visas-immigration',
  );
  assertEquals(
    ukAdviceUrl({ code: 'ES', name_en: 'Spain' }),
    'https://www.gov.uk/foreign-travel-advice/spain',
  );
});

Deno.test('checklist: unknown city → 404', async () => {
  const { deps } = fakeDeps();
  const res = await post(deps, { city: 'atlantis', nationalities: ['BR'] });
  assertEquals(res.status, 404);
  assertEquals((await res.json()).error, 'city_not_found');
});

Deno.test('checklist: invalid input → 400 with details', async () => {
  const { deps } = fakeDeps();
  const res = await post(deps, { city: 'Lisbon!', nationalities: [] });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, 'bad_request');
  assert(body.message.includes('city'));
  const bad = await createHandler(deps)(
    new Request('http://localhost/checklist', { method: 'POST', body: '{not json' }),
  );
  assertEquals(bad.status, 400);
});

Deno.test('checklist: OPTIONS preflight and method not allowed', async () => {
  const { deps } = fakeDeps();
  const handler = createHandler(deps);
  const pre = await handler(new Request('http://localhost/checklist', { method: 'OPTIONS' }));
  assertEquals(pre.status, 200);
  assertEquals(pre.headers.get('Access-Control-Allow-Origin'), '*');
  const get = await handler(new Request('http://localhost/checklist'));
  assertEquals(get.status, 405);
  assertEquals(get.headers.get('Access-Control-Allow-Origin'), '*');
});

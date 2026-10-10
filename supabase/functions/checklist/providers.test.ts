import { assertEquals, assertRejects } from 'jsr:@std/assert@1';

import { type Cached, noCache } from '../_shared/cache.ts';
import { type FetchJson, HttpError } from '../_shared/http.ts';
import {
  climateFromDaily,
  compactAdvisoryIndex,
  createFx,
  createGacAdvisory,
  createOpenMeteo,
  ER_API_PROVIDER,
  FRANKFURTER_PROVIDER,
} from './providers.ts';

/** Fake fetcher: routes by URL prefix, records calls. */
function fakeFetch(routes: [string, (url: string) => unknown][]) {
  const calls: string[] = [];
  const fetchJson: FetchJson = <T>(url: string) => {
    calls.push(url);
    const route = routes.find(([prefix]) => url.startsWith(prefix));
    if (!route) return Promise.reject(new Error(`unexpected ${url}`));
    try {
      return Promise.resolve(route[1](url) as T);
    } catch (err) {
      return Promise.reject(err);
    }
  };
  return { fetchJson, calls };
}

Deno.test('climateFromDaily: averages the travel month across years', () => {
  const daily = {
    time: ['2024-01-01', '2024-01-02', '2024-02-01', '2025-01-01', '2025-01-02'],
    temperature_2m_min: [5, 7, 20, 6, null],
    temperature_2m_max: [12, 14, 30, 13, 15],
    precipitation_sum: [0, 2.5, 50, 1, 0.4],
  };
  assertEquals(climateFromDaily(daily, 1), {
    month: 1,
    years: 2,
    avgMinC: 6, // (5+7+6)/3
    avgMaxC: 13.5, // (12+14+13+15)/4
    avgPrecipitationMm: 1, // (0+2.5+1+0.4)/4 = 0.975
    avgRainyDays: 1, // 2024: 1 day, 2025: 1 day
  });
});

/** Open-Meteo's answer for the 16 days from `firstDay`, as `/v1/forecast` returns it. */
function sixteenDayForecast(firstDay: string) {
  const time = Array.from({ length: 16 }, (_, i) => {
    const d = new Date(`${firstDay}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
  return {
    daily: {
      time,
      temperature_2m_max: time.map((_, i) => 20 + i),
      temperature_2m_min: time.map((_, i) => 10 + i),
      precipitation_sum: time.map((_, i) => (i === 1 ? 1.8 : 0)),
      precipitation_probability_max: time.map((_, i) => (i === 1 ? 59 : 0)),
      weather_code: time.map((_, i) => (i === 1 ? 80 : 3)),
    },
  };
}

/** A `cached` that keeps every value in memory by key (a warm `api_cache`). */
class MemoryCached {
  values = new Map<string, unknown>();
  cached: Cached = async <T>(key: string, _ttl: unknown, fetcher: () => Promise<T>) => {
    if (!this.values.has(key)) this.values.set(key, await fetcher());
    return this.values.get(key) as T;
  };
}

const LISBON = { lat: 38.7223, lng: -9.1393 };
/** 10:00 UTC on 27 September: the forecast may be asked for 27 September – 12 October. */
const SEP_27 = () => new Date('2026-09-27T10:00:00Z');
const forecastFetch = () =>
  fakeFetch([['https://api.open-meteo.com/v1/forecast', (url) => {
    return sixteenDayForecast(new URL(url).searchParams.get('start_date')!);
  }]]);

Deno.test('open-meteo forecast maps daily arrays of the trip window', async () => {
  const { fetchJson, calls } = forecastFetch();
  const days = await createOpenMeteo({ fetchJson, cached: noCache, now: SEP_27 }).forecast({
    ...LISBON,
    start: '2026-09-27',
    end: '2026-09-28',
  });
  assertEquals(days.map((d) => d.date), ['2026-09-27', '2026-09-28']);
  assertEquals(days[1], {
    date: '2026-09-28',
    tempMinC: 11,
    tempMaxC: 21,
    precipitationMm: 1.8,
    precipitationProbability: 59,
    weatherCode: 80,
  });
  const url = new URL(calls[0]!);
  assertEquals(url.searchParams.get('latitude'), '38.72');
  // The whole range Open-Meteo accepts (UTC today + 15), whatever the window asked for.
  assertEquals(url.searchParams.get('start_date'), '2026-09-27');
  assertEquals(url.searchParams.get('end_date'), '2026-10-12');
  assertEquals(url.searchParams.get('timezone'), 'auto');
});

Deno.test('open-meteo forecast: one fetch per place and day serves every trip window', async () => {
  const { fetchJson, calls } = forecastFetch();
  const cached = new MemoryCached().cached;
  let now = SEP_27();
  const meteo = createOpenMeteo({ fetchJson, cached, now: () => now });
  const first = await meteo.forecast({ ...LISBON, start: '2026-09-27', end: '2026-10-03' });
  const second = await meteo.forecast({ ...LISBON, start: '2026-10-08', end: '2026-10-12' });
  assertEquals(calls.length, 1);
  assertEquals(first.length, 7);
  assertEquals(second.map((d) => d.date), [
    '2026-10-08',
    '2026-10-09',
    '2026-10-10',
    '2026-10-11',
    '2026-10-12',
  ]);
  assertEquals(second[0]!.tempMaxC, 31); // the 12th day of the answer
  now = new Date('2026-09-28T00:30:00Z'); // the next UTC day reaches one day further
  const later = await meteo.forecast({ ...LISBON, start: '2026-10-13', end: '2026-10-13' });
  assertEquals([calls.length, later[0]!.date], [2, '2026-10-13']);
});

Deno.test('open-meteo forecast: a window outside the forecast range is an error, as before', async () => {
  const meteo = createOpenMeteo({
    fetchJson: forecastFetch().fetchJson,
    cached: noCache,
    now: SEP_27,
  });
  // Open-Meteo answered 400 ("out of allowed range") for these per-window requests.
  for (const [start, end] of [['2026-10-12', '2026-10-13'], ['2026-09-26', '2026-09-27']]) {
    await assertRejects(() => meteo.forecast({ ...LISBON, start, end }), Error, 'outside');
  }
});

Deno.test('open-meteo climate requests the month span of the chosen years', async () => {
  const { fetchJson, calls } = fakeFetch([[
    'https://archive-api.open-meteo.com/v1/archive',
    () => ({
      daily: {
        time: ['2021-02-01', '2025-02-28'],
        temperature_2m_min: [8, 10],
        temperature_2m_max: [15, 17],
        precipitation_sum: [3, 0],
      },
    }),
  ]]);
  const c = await createOpenMeteo({ fetchJson, cached: noCache }).climate({
    lat: 38.72,
    lng: -9.14,
    month: 2,
    fromYear: 2021,
    toYear: 2025,
  });
  assertEquals(c.avgMaxC, 16);
  const url = new URL(calls[0]!);
  assertEquals(url.searchParams.get('start_date'), '2021-02-01');
  assertEquals(url.searchParams.get('end_date'), '2025-02-28');
});

Deno.test('fx: Frankfurter first', async () => {
  const { fetchJson, calls } = fakeFetch([[
    'https://api.frankfurter.dev/v1/latest',
    () => ({ base: 'BRL', date: '2026-09-25', rates: { EUR: 0.16923 } }),
  ]]);
  const q = await createFx({ fetchJson, cached: noCache })('BRL', 'EUR');
  assertEquals(q, { rate: 0.16923, date: '2026-09-25', provider: FRANKFURTER_PROVIDER });
  assertEquals(calls, ['https://api.frankfurter.dev/v1/latest?base=BRL&symbols=EUR']);
});

Deno.test('fx: unsupported currency falls back to ExchangeRate-API', async () => {
  const { fetchJson, calls } = fakeFetch([
    ['https://api.frankfurter.dev', (url) => {
      throw new HttpError(url, 404, '{"message":"not found"}');
    }],
    ['https://open.er-api.com/v6/latest/ARS', () => ({
      result: 'success',
      time_last_update_unix: 1790467351,
      rates: { EUR: 0.00071 },
    })],
  ]);
  const q = await createFx({ fetchJson, cached: noCache })('ARS', 'EUR');
  assertEquals(q, { rate: 0.00071, date: '2026-09-27', provider: ER_API_PROVIDER });
  assertEquals(calls.length, 2);
});

Deno.test('fx: EXCHANGE_RATES_BASE_URL overrides the Frankfurter base', async () => {
  const { fetchJson, calls } = fakeFetch([[
    'https://fx.example.com/latest',
    () => ({ base: 'GBP', date: '2026-09-25', rates: { EUR: 1.15 } }),
  ]]);
  await createFx({ fetchJson, cached: noCache, frankfurterBaseUrl: 'https://fx.example.com/' })(
    'GBP',
    'EUR',
  );
  assertEquals(calls, ['https://fx.example.com/latest?base=GBP&symbols=EUR']);
});

Deno.test('fx: both providers down → error', async () => {
  const { fetchJson } = fakeFetch([]);
  await assertRejects(() => createFx({ fetchJson, cached: noCache })('BRL', 'EUR'));
});

const GAC_SAMPLE = {
  metadata: { generated: { date: '2026-09-27 09:40:25' } },
  data: {
    PT: {
      'country-iso': 'PT',
      'advisory-state': 0,
      'has-regional-advisory': 0,
      'date-published': { date: '2026-09-24 08:53:35' },
      eng: { 'url-slug': 'portugal', 'advisory-text': 'Exercise normal security precautions' },
      fra: { 'url-slug': 'portugal', 'advisory-text': 'Prendre des mesures de sécurité normales' },
    },
    TR: {
      'country-iso': 'TR',
      'advisory-state': 1,
      'has-regional-advisory': 1,
      'date-published': { date: '2026-09-25 10:15:52' },
      eng: {
        'url-slug': 'turkiye',
        'advisory-text': 'Exercise a high degree of caution (with regional advisories)',
      },
    },
    XX: { 'advisory-state': 9, eng: { 'url-slug': 'nowhere' } },
  },
};

Deno.test('advisory: compacts the GAC index and maps fields', async () => {
  const compact = compactAdvisoryIndex(GAC_SAMPLE);
  assertEquals(Object.keys(compact).sort(), ['PT', 'TR']);
  const { fetchJson, calls } = fakeFetch([['https://data.international.gc.ca', () => GAC_SAMPLE]]);
  const advisory = createGacAdvisory({ fetchJson, cached: noCache });
  assertEquals(await advisory('TR'), {
    level: 1,
    hasRegionalAdvisory: true,
    textEn: 'Exercise a high degree of caution (with regional advisories)',
    urlSlug: 'turkiye',
    publishedAt: '2026-09-25',
  });
  assertEquals(await advisory('FR'), null);
  assertEquals(calls.length, 2); // noCache: one fetch per call
});

/** A pass-through `cached` that records the stale window each namespace asks for. */
class RecordingCache {
  staleFor: Record<string, number | undefined> = {};
  cached: Cached = (key, _ttl, fetcher, options) => {
    this.staleFor[key.slice(0, key.lastIndexOf(':'))] = options?.staleFor;
    return fetcher();
  };
}

Deno.test('advisories, exchange rates and climate may be answered stale while they refresh', async () => {
  const cache = new RecordingCache();
  const { fetchJson } = fakeFetch([
    ['https://data.international.gc.ca', () => GAC_SAMPLE],
    [
      'https://api.frankfurter.dev',
      () => ({ base: 'BRL', date: '2026-09-25', rates: { EUR: 0.17 } }),
    ],
    [
      'https://archive-api.open-meteo.com',
      () => ({
        daily: {
          time: ['2025-02-01'],
          temperature_2m_min: [8],
          temperature_2m_max: [15],
          precipitation_sum: [3],
        },
      }),
    ],
    ['https://api.open-meteo.com', () => ({ daily: { time: ['2026-09-27'] } })],
  ]);
  await createGacAdvisory({ fetchJson, cached: cache.cached })('PT');
  await createFx({ fetchJson, cached: cache.cached })('BRL', 'EUR');
  const meteo = createOpenMeteo({ fetchJson, cached: cache.cached, now: SEP_27 });
  await meteo.climate({ lat: 38.72, lng: -9.14, month: 2, fromYear: 2025, toYear: 2025 });
  await meteo.forecast({ lat: 38.72, lng: -9.14, start: '2026-09-27', end: '2026-09-27' });
  assertEquals(cache.staleFor, {
    advisory: 7 * 86_400,
    fx: 7 * 86_400,
    'weather:climate': 30 * 86_400,
    'weather:forecast': undefined, // a forecast is for given days: never answered stale
  });
});

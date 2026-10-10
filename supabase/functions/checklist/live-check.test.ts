import { assertEquals } from 'jsr:@std/assert@1';

import { runLiveChecks } from './live-check.ts';
import type { AdvisoryProvider, FxProvider, WeatherProvider } from './types.ts';

/** Providers answering like the real APIs on a good day. */
class FakeHealthyProviders {
  weather: WeatherProvider = {
    forecast: () =>
      Promise.resolve([{
        date: '2026-10-05',
        tempMinC: 9,
        tempMaxC: 15,
        precipitationMm: 1.2,
        precipitationProbability: 40,
        weatherCode: 3,
      }]),
    climate: () =>
      Promise.resolve({
        month: 10,
        years: 3,
        avgMinC: 8,
        avgMaxC: 14,
        avgPrecipitationMm: 2.6,
        avgRainyDays: 14,
      }),
  };
  fx: FxProvider = () =>
    Promise.resolve({ rate: 1.09, date: '2026-10-04', provider: 'Frankfurter' });
  advisory: AdvisoryProvider = () =>
    Promise.resolve({
      level: 0,
      hasRegionalAdvisory: false,
      textEn: 'Take normal security precautions',
      urlSlug: 'netherlands',
      publishedAt: '2026-09-24',
    });
}

const today = new Date('2026-10-05T06:00:00Z');

Deno.test('every provider answering in the expected shape passes', async () => {
  const results = await runLiveChecks(new FakeHealthyProviders(), today);
  assertEquals(results.map((r) => [r.check, r.ok]), [
    ['weather.forecast', true],
    ['weather.climate', true],
    ['fx', true],
    ['advisory', true],
  ]);
});

Deno.test('a provider that fails or changed its answer is reported with the reason', async () => {
  const providers = new FakeHealthyProviders();
  providers.fx = () => Promise.resolve(null);
  providers.advisory = () => Promise.reject(new Error('HTTP 503 from data.international.gc.ca'));
  const failed = (await runLiveChecks(providers, today)).filter((r) => !r.ok);
  assertEquals(failed, [
    { check: 'fx', ok: false, detail: 'EUR→USD: expected a positive rate, got null' },
    { check: 'advisory', ok: false, detail: 'HTTP 503 from data.international.gc.ca' },
  ]);
});

Deno.test('a forecast without temperatures fails', async () => {
  const providers = new FakeHealthyProviders();
  providers.weather = {
    ...providers.weather,
    forecast: () =>
      Promise.resolve([{
        date: '2026-10-05',
        tempMinC: null,
        tempMaxC: null,
        precipitationMm: null,
        precipitationProbability: null,
        weatherCode: null,
      }]),
  };
  const [forecast] = await runLiveChecks(providers, today);
  assertEquals(forecast, {
    check: 'weather.forecast',
    ok: false,
    detail: 'expected days with a maximum temperature, got 1 day(s) without',
  });
});

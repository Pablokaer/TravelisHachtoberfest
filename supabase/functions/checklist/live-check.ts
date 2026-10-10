// Live check of the checklist's data sources (D-042): calls the real Open-Meteo, Frankfurter /
// ExchangeRate-API and Global Affairs Canada endpoints through the production providers (no
// cache) and fails when one is down or answers in a shape the app no longer understands.
// Scheduled weekly by .github/workflows/providers-check.yml; exit code 1 on any failure.
//   deno run --allow-net checklist/live-check.ts
import { noCache } from '../_shared/cache.ts';
import { fetchJson } from '../_shared/http.ts';
import { createFx, createGacAdvisory, createOpenMeteo } from './providers.ts';
import type { AdvisoryProvider, FxProvider, WeatherProvider } from './types.ts';

export type LiveProviders = {
  weather: WeatherProvider;
  fx: FxProvider;
  advisory: AdvisoryProvider;
};
export type LiveCheckResult = { check: string; ok: boolean; detail: string };

// Amsterdam, the Netherlands: a launch city every source covers.
const PLACE = { lat: 52.37, lng: 4.9 };
const COUNTRY = 'NL';

const isoDay = (d: Date, plusDays = 0) =>
  new Date(d.getTime() + plusDays * 86_400_000).toISOString().slice(0, 10);

async function forecastProblem(p: LiveProviders, today: Date): Promise<string | null> {
  const days = await p.weather.forecast({ ...PLACE, start: isoDay(today), end: isoDay(today, 2) });
  const without = days.filter((d) => typeof d.tempMaxC !== 'number').length;
  if (!days.length || without > 0) {
    return `expected days with a maximum temperature, got ${days.length} day(s) without`;
  }
  return null;
}

async function climateProblem(p: LiveProviders, today: Date): Promise<string | null> {
  const year = today.getUTCFullYear() - 1;
  const month = today.getUTCMonth() + 1;
  const climate = await p.weather.climate({ ...PLACE, month, fromYear: year - 2, toYear: year });
  return Number.isFinite(climate.avgMaxC)
    ? null
    : `expected an average maximum, got ${climate.avgMaxC}`;
}

async function fxProblem(p: LiveProviders): Promise<string | null> {
  const quote = await p.fx('EUR', 'USD');
  return quote && quote.rate > 0
    ? null
    : `EUR→USD: expected a positive rate, got ${quote?.rate ?? null}`;
}

async function advisoryProblem(p: LiveProviders): Promise<string | null> {
  const advisory = await p.advisory(COUNTRY);
  if (advisory && advisory.level >= 0 && advisory.level <= 3 && advisory.urlSlug) return null;
  return `${COUNTRY}: expected a level 0–3 advisory with a page, got ${JSON.stringify(advisory)}`;
}

async function runOne(
  check: string,
  probe: () => Promise<string | null>,
): Promise<LiveCheckResult> {
  try {
    const problem = await probe();
    return { check, ok: problem === null, detail: problem ?? 'ok' };
  } catch (err) {
    return { check, ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Probes every provider once, sequentially (the sources are free: stay polite).
 * @example (await runLiveChecks(realProviders(), new Date())).every((r) => r.ok)
 */
export async function runLiveChecks(p: LiveProviders, today: Date): Promise<LiveCheckResult[]> {
  return [
    await runOne('weather.forecast', () => forecastProblem(p, today)),
    await runOne('weather.climate', () => climateProblem(p, today)),
    await runOne('fx', () => fxProblem(p)),
    await runOne('advisory', () => advisoryProblem(p)),
  ];
}

function realProviders(): LiveProviders {
  const deps = { fetchJson, cached: noCache };
  return { weather: createOpenMeteo(deps), fx: createFx(deps), advisory: createGacAdvisory(deps) };
}

if (import.meta.main) {
  const results = await runLiveChecks(realProviders(), new Date());
  for (const r of results) console.log(JSON.stringify({ event: 'provider_check', ...r }));
  if (results.some((r) => !r.ok)) Deno.exit(1);
}

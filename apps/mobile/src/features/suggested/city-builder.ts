// Client of the local city-builder service (D-079): given the traveller's position it answers with
// the city the app already has there, or starts building it (attractions from Wikidata /
// Wikipedia / OpenStreetMap with their sources, then walking routes) and reports its progress.
import type { LatLng } from '@wayfarer/shared';

export type BuildStage = 'locating' | 'attractions' | 'texts' | 'routes' | 'saving';

export type ResolveResult =
  | { status: 'ready'; citySlug: string }
  | { status: 'building'; jobId: string; stage: BuildStage }
  | { status: 'failed'; message: string };

export type JobStatus = {
  status: 'building' | 'ready' | 'failed';
  stage: BuildStage;
  citySlug: string | null;
  message: string | null;
  attractions: number | null;
  routes: number | null;
};

/** A place the traveller can pick by typing its name (D-080). */
export type PlaceMatch = {
  name: string;
  displayName: string;
  countryCode: string;
  lat: number;
  lng: number;
};

/** Places listed for one search. */
const SEARCH_LIMIT = 6;

/** The name and country of a place picked by name: tells a city from the region around it. */
export type PlaceHint = { name: string; countryCode: string };

export interface CityBuilder {
  search(query: string): Promise<PlaceMatch[]>;
  resolve(position: LatLng, hint?: PlaceHint | null): Promise<ResolveResult>;
  job(jobId: string): Promise<JobStatus>;
}

/** The service is not running or not reachable. */
export class CityBuilderUnavailableError extends Error {
  constructor(baseUrl: string, cause: unknown) {
    super(`City builder at ${baseUrl} is not reachable (${String(cause)}); start it with "serve"`);
    this.name = 'CityBuilderUnavailableError';
  }
}

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

type ResolveWire = {
  status: string;
  city_slug?: string;
  job_id?: string;
  stage?: BuildStage;
  message?: string;
};
type SearchWire = {
  results?: {
    name: string;
    display_name: string;
    country_code: string;
    lat: number;
    lng: number;
  }[];
};

type JobWire = {
  status: JobStatus['status'];
  stage: BuildStage;
  city_slug: string | null;
  message: string | null;
  attractions: number | null;
  routes: number | null;
};

function resolveFromWire(wire: ResolveWire): ResolveResult {
  if (wire.status === 'ready' && wire.city_slug)
    return { status: 'ready', citySlug: wire.city_slug };
  if (wire.status === 'building' && wire.job_id)
    return { status: 'building', jobId: wire.job_id, stage: wire.stage ?? 'locating' };
  return {
    status: 'failed',
    message: wire.message ?? `Unexpected answer: ${JSON.stringify(wire)}`,
  };
}

/**
 * @example const builder = new HttpCityBuilder('http://127.0.0.1:8787');
 * const answer = await builder.resolve({ lat: 38.8, lng: -9.38 });
 */
export class HttpCityBuilder implements CityBuilder {
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly http: FetchFn = (url, init) => fetch(url, init),
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  private async call<T>(path: string, init?: RequestInit) {
    try {
      const response = await this.http(`${this.baseUrl}${path}`, init);
      return (await response.json()) as T;
    } catch (cause) {
      throw new CityBuilderUnavailableError(this.baseUrl, cause);
    }
  }

  async search(query: string): Promise<PlaceMatch[]> {
    const path = `/places/search?q=${encodeURIComponent(query)}&limit=${SEARCH_LIMIT}`;
    const wire = await this.call<SearchWire>(path);
    return (wire.results ?? []).map((r) => ({
      name: r.name,
      displayName: r.display_name,
      countryCode: r.country_code,
      lat: r.lat,
      lng: r.lng,
    }));
  }

  async resolve(position: LatLng, hint?: PlaceHint | null): Promise<ResolveResult> {
    const wire = await this.call<ResolveWire>('/places/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lat: position.lat,
        lng: position.lng,
        ...(hint ? { name: hint.name, country_code: hint.countryCode } : {}),
      }),
    });
    return resolveFromWire(wire);
  }

  async job(jobId: string): Promise<JobStatus> {
    const wire = await this.call<JobWire>(`/jobs/${encodeURIComponent(jobId)}`);
    return {
      status: wire.status,
      stage: wire.stage,
      citySlug: wire.city_slug,
      message: wire.message,
      attractions: wire.attractions,
      routes: wire.routes,
    };
  }
}

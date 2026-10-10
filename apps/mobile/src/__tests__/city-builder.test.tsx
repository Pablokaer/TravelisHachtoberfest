import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { LatLng } from '@wayfarer/shared';
import type { PropsWithChildren } from 'react';

import {
  CityBuilderUnavailableError,
  HttpCityBuilder,
  type CityBuilder,
  type JobStatus,
  type PlaceMatch,
  type ResolveResult,
} from '@/features/suggested/city-builder';
import { useCitySearch } from '@/features/suggested/use-city-search';
import { useOwnCity } from '@/features/suggested/use-own-city';

const HERE: LatLng = { lat: 38.8, lng: -9.38 };

/** A fetch that answers with one canned response (or fails like a service that is not running). */
class FakeFetch {
  calls: { url: string; body: unknown }[] = [];
  constructor(
    private readonly status: number,
    private readonly reply: unknown,
    private readonly offline = false,
  ) {}
  fetch = async (url: string, init?: RequestInit): Promise<Response> => {
    if (this.offline) throw new TypeError('Failed to fetch');
    this.calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
    return { status: this.status, ok: this.status < 400, json: async () => this.reply } as Response;
  };
}

/** A builder whose answers the test scripts: one resolve answer, then one answer per job poll. */
class FakeCityBuilder implements CityBuilder {
  polls = 0;
  constructor(
    private readonly resolved: ResolveResult,
    private readonly jobs: JobStatus[] = [],
  ) {}
  async resolve(): Promise<ResolveResult> {
    return this.resolved;
  }
  searched: string[] = [];
  matches: PlaceMatch[] = [];
  async search(query: string): Promise<PlaceMatch[]> {
    this.searched.push(query);
    return this.matches;
  }
  async job(): Promise<JobStatus> {
    const answer = this.jobs[Math.min(this.polls, this.jobs.length - 1)]!;
    this.polls += 1;
    return answer;
  }
}

const building = (stage: JobStatus['stage'], extra: Partial<JobStatus> = {}): JobStatus => ({
  status: 'building',
  stage,
  citySlug: null,
  message: null,
  attractions: null,
  routes: null,
  ...extra,
});

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('HttpCityBuilder (D-079)', () => {
  test('resolve posts the position and reads a city that is already there', async () => {
    const http = new FakeFetch(200, { status: 'ready', city_slug: 'sintra' });
    const builder = new HttpCityBuilder('http://127.0.0.1:8787/', http.fetch);
    await expect(builder.resolve(HERE)).resolves.toEqual({ status: 'ready', citySlug: 'sintra' });
    expect(http.calls).toEqual([
      { url: 'http://127.0.0.1:8787/places/resolve', body: { lat: 38.8, lng: -9.38 } },
    ]);
  });

  test('resolve sends the name and country of a place picked by name, to tell it from its region', async () => {
    const http = new FakeFetch(200, { status: 'ready', city_slug: 'nagasaki' });
    const builder = new HttpCityBuilder('http://x', http.fetch);
    await builder.resolve(HERE, { name: 'Nagasaki', countryCode: 'JP' });
    expect(http.calls[0]!.body).toEqual({
      lat: 38.8,
      lng: -9.38,
      name: 'Nagasaki',
      country_code: 'JP',
    });
  });

  test('resolve reads a job that has started and a place that has no city', async () => {
    const started = new FakeFetch(202, { status: 'building', job_id: 'j1', stage: 'locating' });
    await expect(new HttpCityBuilder('http://x', started.fetch).resolve(HERE)).resolves.toEqual({
      status: 'building',
      jobId: 'j1',
      stage: 'locating',
    });
    const none = new FakeFetch(422, { status: 'failed', message: 'No city at 0, 0' });
    await expect(new HttpCityBuilder('http://x', none.fetch).resolve(HERE)).resolves.toEqual({
      status: 'failed',
      message: 'No city at 0, 0',
    });
  });

  test('job maps the service answer to camelCase', async () => {
    const http = new FakeFetch(200, {
      status: 'ready',
      stage: 'saving',
      city_slug: 'sintra',
      message: null,
      attractions: 120,
      routes: 5,
    });
    await expect(new HttpCityBuilder('http://x', http.fetch).job('j1')).resolves.toEqual({
      status: 'ready',
      stage: 'saving',
      citySlug: 'sintra',
      message: null,
      attractions: 120,
      routes: 5,
    });
    expect(http.calls[0]!.url).toBe('http://x/jobs/j1');
  });

  test('a service that is not running is reported as unavailable, naming the address', async () => {
    const offline = new FakeFetch(0, null, true);
    await expect(new HttpCityBuilder('http://x', offline.fetch).resolve(HERE)).rejects.toThrow(
      CityBuilderUnavailableError,
    );
    await expect(new HttpCityBuilder('http://x', offline.fetch).resolve(HERE)).rejects.toThrow(
      /http:\/\/x/,
    );
  });
});

describe('useOwnCity (D-079)', () => {
  test('waits for a position', () => {
    const builder = new FakeCityBuilder({ status: 'ready', citySlug: 'sintra' });
    const { result } = renderHook(() => useOwnCity(null, builder), { wrapper: wrapper() });
    expect(result.current.phase).toBe('idle');
  });

  test('without a city builder the traveller is told it is unavailable', () => {
    const { result } = renderHook(() => useOwnCity(HERE, null), { wrapper: wrapper() });
    expect(result.current.phase).toBe('unavailable');
  });

  test('a city already in the app is ready at once', async () => {
    const builder = new FakeCityBuilder({ status: 'ready', citySlug: 'sintra' });
    const { result } = renderHook(() => useOwnCity(HERE, builder), { wrapper: wrapper() });
    await waitFor(() => expect(result.current).toMatchObject({ phase: 'ready', slug: 'sintra' }));
  });

  test('a new city is built, showing the stage, until it is ready', async () => {
    const builder = new FakeCityBuilder({ status: 'building', jobId: 'j1', stage: 'locating' }, [
      building('attractions'),
      building('routes'),
      { ...building('saving'), status: 'ready', citySlug: 'sintra', attractions: 90, routes: 4 },
    ]);
    // Every render is recorded: a fast poll must not let the building phase slip past unseen.
    const seen: string[] = [];
    const { result } = renderHook(
      () => {
        const own = useOwnCity(HERE, builder, 5);
        seen.push(`${own.phase}:${own.stage ?? ''}`);
        return own;
      },
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current).toMatchObject({ phase: 'ready', slug: 'sintra' }));
    expect(seen).toContain('building:locating');
  });

  test('a failed build carries the service message', async () => {
    const builder = new FakeCityBuilder({ status: 'building', jobId: 'j1', stage: 'locating' }, [
      { ...building('attractions'), status: 'failed', message: 'Overpass timed out for sintra' },
    ]);
    const { result } = renderHook(() => useOwnCity(HERE, builder, 5), { wrapper: wrapper() });
    await waitFor(() =>
      expect(result.current).toMatchObject({
        phase: 'failed',
        message: 'Overpass timed out for sintra',
      }),
    );
  });

  test('a service that cannot be reached falls back to the cities the app has', async () => {
    const offline = new HttpCityBuilder('http://x', new FakeFetch(0, null, true).fetch);
    const { result } = renderHook(() => useOwnCity(HERE, offline), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.phase).toBe('unavailable'));
  });
});

const KYOTO: PlaceMatch = {
  name: 'Kyoto',
  displayName: 'Kyoto, Kyoto Prefecture, Japan',
  countryCode: 'JP',
  lat: 35.01,
  lng: 135.77,
};

describe('HttpCityBuilder.search (D-080)', () => {
  test('asks for the typed name and maps the places to camelCase', async () => {
    const http = new FakeFetch(200, {
      results: [
        {
          name: 'Kyoto',
          display_name: 'Kyoto, Kyoto Prefecture, Japan',
          country_code: 'JP',
          lat: 35.01,
          lng: 135.77,
        },
      ],
    });
    const found = await new HttpCityBuilder('http://x', http.fetch).search('Kyoto & co');
    expect(found).toEqual([KYOTO]);
    expect(http.calls[0]!.url).toBe('http://x/places/search?q=Kyoto%20%26%20co&limit=6');
  });

  test('a refused search is an empty list, not an error', async () => {
    const refused = new FakeFetch(400, { status: 'failed', message: 'too short' });
    await expect(new HttpCityBuilder('http://x', refused.fetch).search('k')).resolves.toEqual([]);
  });
});

describe('useCitySearch (D-080)', () => {
  test('waits for three letters and a pause before asking the service', async () => {
    const builder = new FakeCityBuilder({ status: 'ready', citySlug: 'x' });
    builder.matches = [KYOTO];
    const { result, rerender } = renderHook(
      ({ text }: { text: string }) => useCitySearch(text, builder, 5),
      { wrapper: wrapper(), initialProps: { text: 'ky' } },
    );
    await new Promise((r) => setTimeout(r, 30));
    expect(builder.searched).toEqual([]);
    expect(result.current.matches).toEqual([]);
    rerender({ text: 'kyo' });
    await waitFor(() => expect(result.current.matches).toEqual([KYOTO]));
    expect(builder.searched).toEqual(['kyo']);
  });

  test('without a city builder there is nothing to search and it says so', () => {
    const { result } = renderHook(() => useCitySearch('kyoto', null, 5), { wrapper: wrapper() });
    expect(result.current).toMatchObject({ available: false, matches: [] });
  });
});

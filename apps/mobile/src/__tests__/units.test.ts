import { parseEnv } from '@/lib/env';
import { formatDistance, formatDuration, formatTemperature, weatherBucket } from '@/lib/format';
import { useRouteStore } from '@/features/route/store';
import type { AttractionSummary } from '@/features/destinations/api';

const stop = (id: string, citySlug = 'lisbon'): AttractionSummary => ({
  id,
  citySlug,
  nameEn: id,
  namePt: null,
  category: 'museum',
  lat: 38.7,
  lng: -9.1,
  popularity: 50,
  avgVisitMinutes: 90,
  imageUrl: null,
  isUnesco: false,
});

describe('env', () => {
  it('treats empty optional values as unset and applies defaults', () => {
    const env = parseEnv({
      supabaseUrl: '',
      supabaseAnonKey: '',
      mapStyleUrl: undefined,
      sentryDsn: '',
      posthogKey: undefined,
      posthogHost: undefined,
      authProviders: ' Google, apple ',
    });
    expect(env.supabaseUrl).toBeUndefined();
    expect(env.mapStyleUrl).toBe('https://tiles.openfreemap.org/styles/liberty');
    expect(env.authProviders).toEqual(['google', 'apple']);
  });

  it('rejects a malformed Supabase URL or unknown provider', () => {
    const base = {
      supabaseAnonKey: undefined,
      mapStyleUrl: undefined,
      sentryDsn: undefined,
      posthogKey: undefined,
      posthogHost: undefined,
    };
    expect(() => parseEnv({ ...base, supabaseUrl: 'not a url' })).toThrow(/EXPO_PUBLIC/);
    expect(() => parseEnv({ ...base, supabaseUrl: undefined, authProviders: 'facebook' })).toThrow(
      /EXPO_PUBLIC/,
    );
  });
});

describe('env: public web address for shared links (D-031)', () => {
  const base = {
    supabaseUrl: undefined,
    supabaseAnonKey: undefined,
    mapStyleUrl: undefined,
    sentryDsn: undefined,
    posthogKey: undefined,
    posthogHost: undefined,
  };
  it('is optional and must be a URL when set', () => {
    expect(parseEnv({ ...base, webUrl: '' }).webUrl).toBeUndefined();
    expect(parseEnv({ ...base, webUrl: 'https://wayfarer.app' }).webUrl).toBe(
      'https://wayfarer.app',
    );
    expect(() => parseEnv({ ...base, webUrl: 'wayfarer app' })).toThrow(/EXPO_PUBLIC/);
  });
});

describe('format', () => {
  it('formats units', () => {
    expect(formatTemperature(20, 'metric')).toBe('20°C');
    expect(formatTemperature(20, 'imperial')).toBe('68°F');
    expect(formatDistance(850, 'metric', 'en')).toBe('850 m');
    expect(formatDistance(2400, 'metric', 'en')).toBe('2.4 km');
    expect(formatDistance(1609.344, 'imperial', 'en')).toBe('1 mi');
    expect(formatDuration(5400)).toBe('1 h 30 min');
    expect(formatDuration(1500)).toBe('25 min');
    expect(weatherBucket(63)).toBe('rain');
    expect(weatherBucket(0)).toBe('clear');
  });
});

describe('route tray', () => {
  beforeEach(() => useRouteStore.getState().clear());

  it('adds, reorders and removes stops', () => {
    const s = useRouteStore.getState();
    expect(s.add(stop('a'))).toBe(true);
    expect(s.add(stop('b'))).toBe(true);
    expect(s.add(stop('a'))).toBe(true); // idempotent
    useRouteStore.getState().move('b', -1);
    expect(useRouteStore.getState().stops.map((x) => x.id)).toEqual(['b', 'a']);
    useRouteStore.getState().remove('b');
    expect(useRouteStore.getState().stops.map((x) => x.id)).toEqual(['a']);
  });

  it('refuses stops from another city and more than 20 stops', () => {
    const s = useRouteStore.getState();
    s.add(stop('a'));
    expect(useRouteStore.getState().add(stop('x', 'porto'))).toBe(false);
    for (let i = 0; i < 19; i++) useRouteStore.getState().add(stop(`s${i}`));
    expect(useRouteStore.getState().stops).toHaveLength(20);
    expect(useRouteStore.getState().add(stop('overflow'))).toBe(false);
  });
});

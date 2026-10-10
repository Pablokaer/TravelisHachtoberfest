import { userEvent } from '@testing-library/react-native';
import { act, renderRouter, screen } from 'expo-router/testing-library';

import { useExploreStore } from '@/features/destinations/store';
import { supabase } from '@/lib/supabase';

import RootLayout from '../app/_layout';
import ExploreLayout from '../app/(tabs)/(explore)/_layout';
import CityScreen from '../app/(tabs)/(explore)/city/[slug]';
import HomeScreen from '../app/(tabs)/(explore)/index';

import { cityRow } from '@/testing/fixtures';
import { fakeSession, queryResult } from '@/testing/test-utils';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
    },
    from: jest.fn(),
    rpc: jest.fn(),
  },
  unwrap: (r: { data: unknown }) => r.data,
  check: () => undefined,
}));

const profileRow = {
  id: 'user-1',
  display_name: 'Ana',
  home_country: 'PT',
  language: 'en',
  units: 'metric',
  theme: 'light',
  passport_expiry: null,
  onboarded_at: '2026-09-28T00:00:00Z',
  profile_nationalities: [{ country_code: 'BR' }],
};

const cities = [
  cityRow(),
  cityRow({
    slug: 'lisbon',
    name_en: 'Lisbon',
    name_pt: 'Lisboa',
    country_code: 'PT',
    country_name_en: 'Portugal',
    country_name_pt: 'Portugal',
    bbox: [38.69, -9.23, 38.8, -9.09],
    attraction_count: 120,
  }),
];

/** An `attractions_in_view` row. */
function attractionRow(id: string, city: string, name: string, category = 'museum') {
  return {
    id,
    city_slug: city,
    name_en: name,
    name_pt: null,
    category,
    lat: 0,
    lng: 0,
    popularity: 50,
    avg_visit_minutes: 60,
    image_url: null,
    is_unesco: false,
  };
}

/** Fake `attractions_in_view`: every attraction of both cities, filtered by category. */
class FakeAttractionsRpc {
  rows = [
    attractionRow('a1', 'amsterdam', 'Rijksmuseum'),
    attractionRow('a2', 'amsterdam', 'Dam Square', 'landmark'),
    attractionRow('l1', 'lisbon', 'Belém Tower', 'monument'),
  ];
  call = async (_fn: string, args: { categories?: string[] }) => ({
    data: this.rows.filter((r) => !args.categories || args.categories.includes(r.category)),
    error: null,
  });
}

beforeEach(() => {
  // The list view renders the attraction grid (the map is mocked and shows no names).
  useExploreStore.setState({ view: 'list', categories: [] });
  jest
    .mocked(supabase.auth.getSession)
    .mockResolvedValue({ data: { session: fakeSession }, error: null } as never);
  jest
    .mocked(supabase.from)
    .mockImplementation(((table: string) =>
      queryResult(table === 'city_list' ? cities : profileRow)) as never);
  jest.mocked(supabase.rpc).mockImplementation(new FakeAttractionsRpc().call as never);
});

afterEach(async () => {
  // Let pending query/timer work settle so it doesn't leak into the next test.
  await act(async () => undefined);
});

const routes = {
  _layout: RootLayout,
  '(tabs)/(explore)/_layout': ExploreLayout,
  '(tabs)/(explore)/index': HomeScreen,
  '(tabs)/(explore)/city/[slug]': CityScreen,
};

test('Home lists the supported cities with country and number of places', async () => {
  renderRouter(routes, { initialUrl: '/' });
  expect(await screen.findByTestId('city-card-amsterdam')).toBeOnTheScreen();
  expect(
    screen.getByRole('button', { name: 'Amsterdam, Netherlands, 269 places' }),
  ).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Lisbon, Portugal, 120 places' })).toBeOnTheScreen();
  expect(screen.getByText('2 destinations')).toBeOnTheScreen();
  // Commons photos are shown with their credit.
  expect(screen.getAllByText('Photo © Jose A. · CC BY 2.0').length).toBeGreaterThan(0);
  // Category tabs belong to city pages.
  expect(screen.queryByRole('checkbox', { name: 'Museums' })).toBeNull();
});

test('Home search filters cities, not attractions', async () => {
  renderRouter(routes, { initialUrl: '/' });
  await userEvent.type(await screen.findByTestId('city-search'), 'amst');
  expect(screen.getByTestId('city-card-amsterdam')).toBeOnTheScreen();
  expect(screen.queryByTestId('city-card-lisbon')).toBeNull();
  expect(screen.getByText('1 destination')).toBeOnTheScreen();
  await userEvent.clear(screen.getByTestId('city-search'));
  await userEvent.type(screen.getByTestId('city-search'), 'dublin');
  expect(screen.getByText('No cities match your search.')).toBeOnTheScreen();
});

// A city card opens the city page (/short/[slug], city-hub.test.tsx); its attractions are at
// /city/[slug], unchanged (D-033).
test('the attractions page of a city has its places, search and filters; the logo goes back', async () => {
  const app = renderRouter(routes, { initialUrl: '/city/amsterdam' });

  expect(await screen.findByText('Rijksmuseum')).toBeOnTheScreen();
  expect(screen.getByText('2 places')).toBeOnTheScreen();
  expect(screen.getByLabelText('Search places in Amsterdam')).toBeOnTheScreen();
  expect(screen.queryByText('Belém Tower')).toBeNull();

  await userEvent.press(screen.getByRole('checkbox', { name: 'Landmarks' }));
  expect(await screen.findByText('1 place')).toBeOnTheScreen();
  expect(screen.getByText('Dam Square')).toBeOnTheScreen();

  await userEvent.press(screen.getByRole('link', { name: 'Travelist — all destinations' }));
  expect(app.getPathname()).toBe('/');
  expect(await screen.findByTestId('city-card-lisbon')).toBeOnTheScreen();
});

test('category tabs filter the places already loaded: no new request, nothing reloads', async () => {
  renderRouter(routes, { initialUrl: '/city/amsterdam' });
  expect(await screen.findByText('Rijksmuseum')).toBeOnTheScreen();
  const requests = jest.mocked(supabase.rpc).mock.calls.length;

  await userEvent.press(screen.getByRole('checkbox', { name: 'Landmarks' }));
  // Synchronous: the filtered list is there at once, without a loading state.
  expect(screen.getByText('1 place')).toBeOnTheScreen();
  expect(screen.queryByText('Rijksmuseum')).toBeNull();
  await userEvent.press(screen.getByRole('checkbox', { name: 'Museums' }));
  expect(screen.getByText('2 places')).toBeOnTheScreen();
  expect(jest.mocked(supabase.rpc).mock.calls.length).toBe(requests);
});

test('a city list cut at the 500-place limit is filtered by the server instead', async () => {
  const server = new FakeAttractionsRpc();
  server.rows = [
    ...Array.from({ length: 499 }, (_, i) => attractionRow(`m${i}`, 'amsterdam', `Museum ${i}`)),
    attractionRow('a2', 'amsterdam', 'Dam Square', 'landmark'),
  ];
  jest.mocked(supabase.rpc).mockImplementation(server.call as never);
  renderRouter(routes, { initialUrl: '/city/amsterdam' });
  expect(await screen.findByText('500 places')).toBeOnTheScreen();

  await userEvent.press(screen.getByRole('checkbox', { name: 'Landmarks' }));
  expect(await screen.findByText('1 place')).toBeOnTheScreen();
  expect(supabase.rpc).toHaveBeenLastCalledWith(
    'attractions_in_view',
    expect.objectContaining({ categories: ['landmark'] }),
  );
});

test('another city loads its own attractions', async () => {
  renderRouter(routes, { initialUrl: '/city/lisbon' });
  expect(await screen.findByText('Belém Tower')).toBeOnTheScreen();
  expect(screen.getByLabelText('Search places in Lisbon')).toBeOnTheScreen();
  expect(screen.queryByText('Rijksmuseum')).toBeNull();
});

test('an unknown city shows a way back to the Home', async () => {
  const app = renderRouter(routes, { initialUrl: '/city/atlantis' });
  expect(await screen.findByText('City not found')).toBeOnTheScreen();
  await userEvent.press(screen.getByRole('button', { name: 'See all destinations' }));
  expect(app.getPathname()).toBe('/');
});

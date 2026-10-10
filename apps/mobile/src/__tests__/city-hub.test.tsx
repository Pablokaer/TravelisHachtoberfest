import { userEvent } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';
import { act, fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';

import { useExploreStore } from '@/features/destinations/store';
import { supabase } from '@/lib/supabase';

import RootLayout from '../app/_layout';
import ExploreLayout from '../app/(tabs)/(explore)/_layout';
import CityScreen from '../app/(tabs)/(explore)/city/[slug]';
import HomeScreen from '../app/(tabs)/(explore)/index';
import CityHubScreen from '../app/(tabs)/(explore)/short/[slug]/index';
import CityMeetupsScreen from '../app/(tabs)/(explore)/short/[slug]/meetups';
import CityWalklistsScreen from '../app/(tabs)/(explore)/short/[slug]/walklists';

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
// Before you go has its own tests; here it stays loading.
jest.mock('@/features/checklist/api', () => ({
  useChecklist: () => ({ isPending: true, isError: false, data: undefined }),
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

const aboutRow = {
  summary_en: 'Amsterdam is the capital of the Netherlands, known for its canals.',
  summary_pt: 'Amesterdão é a capital dos Países Baixos.',
  wikipedia_en: 'Amsterdam',
  wikipedia_pt: 'Amesterdão',
  history_en: 'Amsterdam began as a fishing village dammed on the Amstel around 1250.',
  history_pt: null,
};

/** A `list_walklists` row. */
function walklistRow(id: string, name: string, over: Record<string, unknown> = {}) {
  return {
    id,
    name,
    city_slug: 'amsterdam',
    author_name: 'Ben',
    is_official: false,
    visibility: 'public',
    stop_count: 5,
    distance_m: 3000,
    walking_seconds: 2400,
    visit_minutes: 120,
    review_count: 3,
    rating_avg: 4.7,
    created_at: '2026-09-01T10:00:00Z',
    is_saved: false,
    is_own: false,
    cover: null,
    starts_at: null,
    attendee_count: 0,
    is_attending: false,
    ...over,
  };
}

/** A start `minutes` from now. */
function soon(minutes: number) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

/** Fake RPCs: attractions, walk lists (by official flag and name), reviews, moderator. */
class FakeHubRpc {
  static walklistCalls: Record<string, unknown>[] = [];
  static community = [walklistRow('t1', 'Historic Amsterdam'), walklistRow('t2', 'Canal walk')];
  static official = [walklistRow('o1', 'Amsterdam highlights', { is_official: true })];

  static reset() {
    FakeHubRpc.walklistCalls = [];
    FakeHubRpc.community = [
      walklistRow('t1', 'Historic Amsterdam'),
      walklistRow('t2', 'Canal walk'),
    ];
    FakeHubRpc.official = [walklistRow('o1', 'Amsterdam highlights', { is_official: true })];
    FakeHubRpc.meetups = [
      walklistRow('u1', 'Canal meetup', { starts_at: soon(45), attendee_count: 2 }),
      walklistRow('u2', 'Tomorrow walk', { starts_at: soon(26 * 60), attendee_count: 0 }),
    ];
  }

  static meetups = [
    walklistRow('u1', 'Canal meetup', { starts_at: soon(45), attendee_count: 2 }),
    walklistRow('u2', 'Tomorrow walk', { starts_at: soon(26 * 60), attendee_count: 0 }),
  ];

  static walklists(args: Record<string, unknown>) {
    FakeHubRpc.walklistCalls.push(args);
    if (args.p_upcoming) return FakeHubRpc.meetups;
    const rows = args.p_official === true ? FakeHubRpc.official : FakeHubRpc.community;
    const search = String(args.p_search ?? '').toLowerCase();
    return rows.filter((r) => r.name.toLowerCase().includes(search));
  }

  static call = async (fn: string, args: Record<string, unknown>) => {
    const answers: Record<string, () => unknown> = {
      attractions_in_view: () => [
        {
          id: 'a1',
          city_slug: 'amsterdam',
          name_en: 'Rijksmuseum',
          name_pt: null,
          category: 'museum',
          lat: 0,
          lng: 0,
          popularity: 50,
          avg_visit_minutes: 60,
          image_url: null,
          is_unesco: false,
        },
      ],
      list_walklists: () => FakeHubRpc.walklists(args),
      list_reviews: () => [],
      is_moderator: () => false,
    };
    return { data: answers[fn]?.() ?? null, error: null };
  };
}

/** A `notable_people` row (D-071). */
function personRow(id: string, name: string, over: Record<string, unknown> = {}) {
  return {
    city_slug: 'amsterdam',
    wikidata_id: id,
    name_en: name,
    name_pt: null,
    description_en: null,
    description_pt: null,
    categories: ['art'],
    birth_year: null,
    death_year: null,
    born_here: true,
    died_here: false,
    image_url: null,
    image_author: null,
    image_license: null,
    image_license_url: null,
    image_page_url: null,
    wikipedia_en: name,
    wikipedia_pt: null,
    sitelinks: 50,
    ...over,
  };
}

const tables: Record<string, unknown> = {
  notable_people: [
    personRow('Q5598', 'Rembrandt', {
      description_en: 'Dutch painter (1606–1669)',
      birth_year: 1606,
      death_year: 1669,
      born_here: false,
      died_here: true,
      sitelinks: 150,
    }),
    personRow('Q1', 'Baruch Spinoza', { categories: ['history'], birth_year: 1632 }),
  ],
  city_list: [cityRow()],
  profiles: profileRow,
  cities: aboutRow,
  rating_summary: { review_count: 2, rating_avg: 4, rating_counts: [0, 0, 1, 0, 1] },
  attraction_rating_summary: [],
};

beforeEach(() => {
  FakeHubRpc.reset();
  useExploreStore.setState({ view: 'list', categories: [] });
  jest
    .mocked(supabase.auth.getSession)
    .mockResolvedValue({ data: { session: fakeSession }, error: null } as never);
  jest
    .mocked(supabase.from)
    .mockImplementation(((table: string) => queryResult(tables[table] ?? null)) as never);
  jest.mocked(supabase.rpc).mockImplementation(FakeHubRpc.call as never);
});

afterEach(async () => {
  await act(async () => undefined);
});

const routes = {
  _layout: RootLayout,
  '(tabs)/(explore)/_layout': ExploreLayout,
  '(tabs)/(explore)/index': HomeScreen,
  '(tabs)/(explore)/city/[slug]': CityScreen,
  '(tabs)/(explore)/short/[slug]/index': CityHubScreen,
  '(tabs)/(explore)/short/[slug]/walklists': CityWalklistsScreen,
  '(tabs)/(explore)/short/[slug]/meetups': CityMeetupsScreen,
};

test('a city card opens the city page: photo, country, rating and About', async () => {
  const app = renderRouter(routes, { initialUrl: '/' });
  await userEvent.press(await screen.findByTestId('city-card-amsterdam'));
  expect(app.getPathname()).toBe('/short/amsterdam');

  const hero = await screen.findByTestId('city-hero');
  expect(within(hero).getByText('Amsterdam')).toBeOnTheScreen();
  expect(within(hero).getByText(/Netherlands/)).toBeOnTheScreen();
  expect(await within(hero).findByTestId('rating-summary')).toHaveTextContent('4.0 ★ · 2 reviews');
  expect(await screen.findByText(/known for its canals/)).toBeOnTheScreen();
  expect(screen.getByText('From Wikipedia · CC BY-SA 4.0')).toBeOnTheScreen();
  // What happened there (D-070), then a link to the full article.
  expect(screen.getByText('History')).toBeOnTheScreen();
  expect(screen.getByText(/fishing village dammed on the Amstel/)).toBeOnTheScreen();
  expect(
    screen.getByRole('link', { name: 'Read the full article on Wikipedia' }),
  ).toBeOnTheScreen();
  expect(screen.getAllByText('Photo © Jose A. · CC BY 2.0').length).toBeGreaterThan(0);
});

test('Explore attractions leads to the existing Map / List page of the city', async () => {
  const app = renderRouter(routes, { initialUrl: '/short/amsterdam' });
  await userEvent.press(await screen.findByRole('button', { name: 'Explore attractions' }));
  expect(app.getPathname()).toBe('/city/amsterdam');
  expect(await screen.findByText('Rijksmuseum')).toBeOnTheScreen();
});

test("opening the city page already loads the city's places and their ratings", async () => {
  renderRouter(routes, { initialUrl: '/short/amsterdam' });
  await screen.findByTestId('city-hero');
  // Prefetched with the Map / List page's own queries, so it opens without a spinner.
  await waitFor(() =>
    expect(supabase.rpc).toHaveBeenCalledWith(
      'attractions_in_view',
      expect.objectContaining({ max_results: 500 }),
    ),
  );
  expect(supabase.from).toHaveBeenCalledWith('attraction_rating_summary');
});

test('community and official walk lists are previewed apart, best rated first', async () => {
  renderRouter(routes, { initialUrl: '/short/amsterdam' });
  const community = await screen.findByTestId('walklists-community');
  expect(await within(community).findByText('Historic Amsterdam')).toBeOnTheScreen();
  expect(within(community).queryByText('Amsterdam highlights')).toBeNull();
  const official = screen.getByTestId('walklists-official');
  expect(await within(official).findByText('Amsterdam highlights')).toBeOnTheScreen();
  expect(within(official).getByText('by Travelist')).toBeOnTheScreen();
  // One small request per section, not the whole city.
  expect(FakeHubRpc.walklistCalls).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ p_official: false, p_sort: 'top', p_limit: 7 }),
      expect.objectContaining({ p_official: true, p_sort: 'top', p_limit: 7 }),
    ]),
  );
});

test('empty sections say so without hiding the rest of the page', async () => {
  FakeHubRpc.community = [];
  FakeHubRpc.official = [];
  renderRouter(routes, { initialUrl: '/short/amsterdam' });
  expect(await screen.findByText('No public walk lists yet')).toBeOnTheScreen();
  expect(await screen.findByText('No official walk lists yet')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'View all walk lists' })).toBeNull();
  expect(screen.getByText('Reviews')).toBeOnTheScreen();
  expect(screen.getByText('Rate this city')).toBeOnTheScreen();
});

test('View all walk lists opens the full list of the city, searchable by name', async () => {
  const app = renderRouter(routes, { initialUrl: '/short/amsterdam' });
  await userEvent.press(await screen.findByRole('button', { name: 'View all walk lists' }));
  expect(app.getPathname()).toBe('/short/amsterdam/walklists');
  expect(await screen.findByText('Community walk lists in Amsterdam')).toBeOnTheScreen();
  expect(await screen.findByText('Canal walk')).toBeOnTheScreen();

  fireEvent.changeText(screen.getByTestId('walklist-search'), 'canal');
  await waitFor(() =>
    expect(FakeHubRpc.walklistCalls.at(-1)).toMatchObject({
      p_city_slug: 'amsterdam',
      p_official: false,
      p_search: 'canal',
    }),
  );
  // The city page stays mounted under this one; look only at the full list.
  const grid = screen.getByTestId('walklist-grid');
  await waitFor(() => expect(within(grid).queryByText('Historic Amsterdam')).toBeNull());
  expect(await within(grid).findByText('Canal walk')).toBeOnTheScreen();
  // Two screens plus the real 300 ms search debounce: under a full parallel run this took
  // over Jest's default 5 s (it passes in ~1 s alone), so it gets more room.
}, 15_000);

test('the full list sorts by rating, lowest first on demand', async () => {
  renderRouter(routes, { initialUrl: '/short/amsterdam/walklists' });
  expect(await screen.findByText('Canal walk')).toBeOnTheScreen();
  expect(FakeHubRpc.walklistCalls.at(-1)).toMatchObject({ p_sort: 'top' });
  await userEvent.press(screen.getByRole('radio', { name: 'Lowest rated' }));
  await waitFor(() => expect(FakeHubRpc.walklistCalls.at(-1)).toMatchObject({ p_sort: 'lowest' }));
});

test('a search without matches says so', async () => {
  renderRouter(routes, { initialUrl: '/short/amsterdam/walklists' });
  fireEvent.changeText(await screen.findByTestId('walklist-search'), 'zzz');
  expect(await screen.findByText('No walk lists match your search.')).toBeOnTheScreen();
});

test('an unknown city shows a way back to the Home', async () => {
  const app = renderRouter(routes, { initialUrl: '/short/atlantis' });
  expect(await screen.findByText('City not found')).toBeOnTheScreen();
  await userEvent.press(screen.getByRole('button', { name: 'See all destinations' }));
  expect(app.getPathname()).toBe('/');
});

test('the city page ranks the next meetups with a countdown (D-041)', async () => {
  renderRouter(routes, { initialUrl: '/short/amsterdam' });
  const section = await screen.findByTestId('meetups-upcoming');
  expect(await within(section).findByText('Canal meetup')).toBeOnTheScreen();
  expect(within(section).getByTestId('meetup-rank-1')).toHaveTextContent(/Starts in 4\d min/);
  expect(within(section).getByTestId('meetup-rank-2')).toHaveTextContent(/Tomorrow walk/);
  expect(FakeHubRpc.walklistCalls).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        p_city_slug: 'amsterdam',
        p_upcoming: true,
        p_sort: 'soonest',
        p_limit: 6,
      }),
    ]),
  );
});

test('View all meetups lists every upcoming meetup of the city by day', async () => {
  const app = renderRouter(routes, { initialUrl: '/short/amsterdam' });
  await userEvent.press(await screen.findByRole('button', { name: 'View all meetups' }));
  expect(app.getPathname()).toBe('/short/amsterdam/meetups');
  expect(await screen.findByText('Meetups in Amsterdam')).toBeOnTheScreen();
  const page = screen.getByTestId('meetups-page');
  expect(await within(page).findByText('Canal meetup')).toBeOnTheScreen();
  expect(within(page).getByText('Tomorrow walk')).toBeOnTheScreen();
  expect(within(page).getAllByRole('header').length).toBeGreaterThan(0);
});

test('a city without meetups still shows the rest of its page', async () => {
  FakeHubRpc.meetups = [];
  renderRouter(routes, { initialUrl: '/short/amsterdam' });
  expect(await screen.findByText('No meetups planned')).toBeOnTheScreen();
  expect(screen.getByText('Top community walk lists')).toBeOnTheScreen();
});

test('the city page shows its famous people, filtered by category, each opening Wikipedia', async () => {
  jest.spyOn(WebBrowser, 'openBrowserAsync').mockResolvedValue({ type: 'opened' } as never);
  renderRouter(routes, { initialUrl: '/short/amsterdam' });
  expect(await screen.findByText('Famous people of Amsterdam')).toBeOnTheScreen();
  const rembrandt = await screen.findByTestId('person-Q5598');
  expect(within(rembrandt).getByText('Rembrandt')).toBeOnTheScreen();
  expect(within(rembrandt).getByText('1606–1669')).toBeOnTheScreen();
  expect(within(rembrandt).getByText('Died here')).toBeOnTheScreen();
  expect(screen.getByTestId('person-Q1')).toBeOnTheScreen();

  await userEvent.press(screen.getByRole('checkbox', { name: 'Historical figures' }));
  expect(screen.queryByTestId('person-Q5598')).toBeNull();
  expect(screen.getByTestId('person-Q1')).toBeOnTheScreen();
  // Only the categories someone has are offered.
  expect(screen.queryByRole('checkbox', { name: 'Musicians' })).toBeNull();

  await userEvent.press(screen.getByRole('checkbox', { name: 'All' }));
  await userEvent.press(screen.getByTestId('person-Q5598'));
  expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(
    'https://en.wikipedia.org/wiki/Rembrandt',
  );
});

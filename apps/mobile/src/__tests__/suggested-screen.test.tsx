import { act, fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';

import type { AttractionSummary } from '@/features/destinations/api';
import { useRouteStore } from '@/features/route/store';
import { suggestedRouteFromRow, type SuggestedRoute } from '@/features/suggested/api';
import type { CitySearch } from '@/features/suggested/use-city-search';
import { usePlaceStore } from '@/features/suggested/place-store';
import { useSavedPlaces } from '@/features/suggested/saved-places';
import type { OwnCity } from '@/features/suggested/use-own-city';
import '@/lib/i18n';

import SuggestedScreen from '../app/(tabs)/suggested';

/** What the routes query returns in each test. */
class MockRoutesServer {
  static routes: SuggestedRoute[] = [];
}

const UNAVAILABLE: OwnCity = {
  phase: 'unavailable',
  slug: null,
  stage: null,
  message: null,
  attractions: null,
  routes: null,
};

/** What searching the world by name finds in each test (D-080). */
class MockWorldSearch {
  static result: CitySearch = { available: true, isSearching: false, matches: [] };
}

/** What the city builder says about the traveller's own city in each test (D-079). */
class MockCityBuilder {
  static own: OwnCity = UNAVAILABLE;
}

jest.mock('expo-router', () => ({ router: { push: jest.fn(), navigate: jest.fn() } }));
jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  getForegroundPermissionsAsync: async () => ({ granted: false }),
  requestForegroundPermissionsAsync: async () => ({ granted: false }),
  getCurrentPositionAsync: async () => ({ coords: { latitude: 0, longitude: 0 } }),
}));
jest.mock('@/features/suggested/use-city-search', () => ({
  SEARCH_MIN_LETTERS: 3,
  useCitySearch: () => MockWorldSearch.result,
}));
jest.mock('@/features/suggested/use-own-city', () => ({
  useOwnCity: (position: unknown) =>
    position
      ? MockCityBuilder.own
      : { phase: 'idle', slug: null, stage: null, message: null, attractions: null, routes: null },
}));
jest.mock('@/features/reviews/api', () => ({ useRatingSummary: () => ({ data: undefined }) }));
jest.mock('@/features/profile/api', () => ({ useProfile: () => ({ data: undefined }) }));
jest.mock('@/features/destinations/api', () => ({
  ...jest.requireActual('@/features/destinations/api'),
  useCities: () => ({
    data: [
      jest.requireActual('@/testing/fixtures').fakeCity({
        slug: 'lisbon',
        nameEn: 'Lisbon',
        namePt: 'Lisboa',
        countryCode: 'PT',
        lat: 38.72,
        lng: -9.14,
      }),
      jest.requireActual('@/testing/fixtures').fakeCity(),
    ],
  }),
}));
jest.mock('@/features/suggested/api', () => ({
  ...jest.requireActual('@/features/suggested/api'),
  useSuggestedRoutes: (slug: string | null) => ({
    isPending: false,
    isError: false,
    data: MockRoutesServer.routes.filter((r) => r.citySlug === slug),
  }),
}));

/** A stop `km` kilometres east of Lisbon's centre. */
const stop = (id: string, km: number): AttractionSummary => ({
  id,
  citySlug: 'lisbon',
  nameEn: `Place ${id}`,
  namePt: null,
  category: 'monument',
  lat: 38.72,
  lng: -9.14 + km / 86.8,
  popularity: 1,
  avgVisitMinutes: 30,
  imageUrl: null,
  isUnesco: false,
});

const route = (slug: string, title: string, stops: AttractionSummary[]): SuggestedRoute => ({
  ...suggestedRouteFromRow({
    id: slug,
    city_slug: 'lisbon',
    slug,
    theme: 'highlights',
    title_en: title,
    title_pt: title,
    generated_by: 'rules',
    distance_m: 0,
    walking_seconds: 0,
    visit_minutes: 0,
    suggested_route_stops: [],
  }),
  stops,
});

const oldTown = route('old-town', 'Old town walk', [stop('a1', 0), stop('a2', 1), stop('a3', 2)]);
const riverside = route('riverside', 'Riverside walk', [stop('b1', 6), stop('b2', 7)]);

function userIsAt(lat: number, lng: number) {
  act(() => usePlaceStore.setState({ position: { lat, lng }, status: 'found', chosenCity: null }));
}

beforeEach(() => {
  MockRoutesServer.routes = [oldTown, riverside];
  MockCityBuilder.own = UNAVAILABLE;
  MockWorldSearch.result = { available: true, isSearching: false, matches: [] };
  useSavedPlaces.setState({ slugs: [] });
  useRouteStore.getState().clear();
  usePlaceStore.setState({ position: null, chosenCity: null, status: 'idle' });
  jest.clearAllMocks();
});

describe('SuggestedScreen', () => {
  test('asks where to walk before it knows the position', async () => {
    render(<SuggestedScreen />);
    expect(await screen.findByText('Where do you want to walk?')).toBeOnTheScreen();
    expect(screen.getByText('Use my location')).toBeOnTheScreen();
  });

  test('lists the routes of the city nearest to the user, the nearest route first', async () => {
    userIsAt(38.72, -9.14 + 6.5 / 86.8); // beside the riverside route
    render(<SuggestedScreen />);
    expect(await screen.findByText('Near you: Lisbon')).toBeOnTheScreen();
    const titles = screen.getAllByRole('header').map((h) => h.props.children);
    expect(titles.indexOf('Riverside walk')).toBeLessThan(titles.indexOf('Old town walk'));
  });

  test('starts each route at the stop nearest to the user and says how far it is', async () => {
    userIsAt(38.72, -9.14 + 2.2 / 86.8); // next to a3, the old town route's last stop
    render(<SuggestedScreen />);
    const card = await screen.findByTestId('suggested-route-old-town');
    expect(card).toHaveTextContent(/1\s*Place a3/);
    expect(card).toHaveTextContent(/Starts \d+ m from you/);
  });

  test('Start this route loads the tray in that order and opens the route builder', async () => {
    userIsAt(38.72, -9.14 + 2.2 / 86.8);
    render(<SuggestedScreen />);
    await screen.findByTestId('suggested-route-old-town');
    // The old town route is the nearest, so it is the first card.
    await userEvent.press(screen.getAllByText('Start this route')[0]!);
    expect(useRouteStore.getState().stops[0]!.id).toBe('a3');
    expect(router.push).toHaveBeenCalledWith('/route');
  });

  test('opens a stop on its own page', async () => {
    userIsAt(38.72, -9.14);
    render(<SuggestedScreen />);
    await userEvent.press(await screen.findByLabelText('Open Place a1'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/attraction/[id]',
      params: { id: 'a1' },
    });
  });

  test('explains a refused permission and offers the city list', async () => {
    act(() => usePlaceStore.setState({ status: 'denied' }));
    render(<SuggestedScreen />);
    expect(await screen.findByText(/Location is off for Travelist/)).toBeOnTheScreen();
    expect(screen.getByPlaceholderText('Search a city')).toBeOnTheScreen();
  });

  test('says so when no covered city is near the user', async () => {
    userIsAt(48.85, 2.35); // Paris
    render(<SuggestedScreen />);
    expect(await screen.findByText(/don't have routes near you yet/)).toBeOnTheScreen();
  });

  test('a chosen city shows its routes without a position', async () => {
    act(() => usePlaceStore.setState({ status: 'denied', chosenCity: 'lisbon' }));
    render(<SuggestedScreen />);
    expect(await screen.findByText('Routes in Lisbon')).toBeOnTheScreen();
    expect(screen.getByText('Old town walk')).toBeOnTheScreen();
    expect(screen.queryByText(/from you/)).toBeNull();
  });

  test('says when a city has no routes yet', async () => {
    MockRoutesServer.routes = [];
    act(() => usePlaceStore.setState({ chosenCity: 'lisbon' }));
    render(<SuggestedScreen />);
    expect(await screen.findByText(/No suggested routes for Lisbon yet/)).toBeOnTheScreen();
  });

  test('shows the stage while the city builder prepares the traveller’s own city', async () => {
    MockCityBuilder.own = { ...UNAVAILABLE, phase: 'building', stage: 'attractions' };
    userIsAt(38.72, -9.14);
    render(<SuggestedScreen />);
    expect(await screen.findByText('Getting your city ready')).toBeOnTheScreen();
    expect(
      screen.getByText(/Collecting attractions, monuments, churches and beaches/),
    ).toBeOnTheScreen();
    expect(screen.queryByText('Old town walk')).toBeNull();
  });

  test('uses the city the builder found for the traveller, even far from the covered ones', async () => {
    MockCityBuilder.own = { ...UNAVAILABLE, phase: 'ready', slug: 'lisbon' };
    userIsAt(38.8, -9.38);
    render(<SuggestedScreen />);
    expect(await screen.findByText('Near you: Lisbon')).toBeOnTheScreen();
    expect(screen.getByText('Old town walk')).toBeOnTheScreen();
  });

  test('says why a city could not be prepared and offers the city list', async () => {
    MockCityBuilder.own = { ...UNAVAILABLE, phase: 'failed', message: 'Overpass timed out' };
    userIsAt(38.8, -9.38);
    render(<SuggestedScreen />);
    expect(
      await screen.findByText('We could not prepare your city: Overpass timed out'),
    ).toBeOnTheScreen();
    expect(screen.getByPlaceholderText('Search a city')).toBeOnTheScreen();
  });

  test('shows the city card of the traveller’s city, opening its attractions on the map', async () => {
    userIsAt(38.72, -9.14);
    render(<SuggestedScreen />);
    expect(await screen.findByTestId('city-hero')).toBeOnTheScreen();
    await userEvent.press(screen.getByText('Explore attractions'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/city/[slug]',
      params: { slug: 'lisbon' },
    });
  });

  describe('searching any city in the world (D-080)', () => {
    const kyoto = {
      name: 'Kyoto',
      displayName: 'Kyoto, Kyoto Prefecture, Japan',
      countryCode: 'JP',
      lat: 35.01,
      lng: 135.77,
    };

    test('a city found by name becomes the traveller’s location', async () => {
      MockWorldSearch.result = { available: true, isSearching: false, matches: [kyoto] };
      render(<SuggestedScreen />);
      fireEvent.changeText(await screen.findByPlaceholderText('Search a city'), 'kyo');
      expect(screen.getByText('Search the world')).toBeOnTheScreen();
      await userEvent.press(screen.getByText('Kyoto, Kyoto Prefecture, Japan'));
      expect(usePlaceStore.getState()).toMatchObject({
        position: { lat: 35.01, lng: 135.77 },
        placeHint: { name: 'Kyoto', countryCode: 'JP' },
        status: 'found',
      });
    });

    test('says when nothing is found and when the city builder is not there', async () => {
      render(<SuggestedScreen />);
      fireEvent.changeText(await screen.findByPlaceholderText('Search a city'), 'zzzz');
      expect(screen.getByText('No city found for “zzzz”.')).toBeOnTheScreen();
      MockWorldSearch.result = { available: false, isSearching: false, matches: [] };
      fireEvent.changeText(screen.getByPlaceholderText('Search a city'), 'zzzy');
      expect(screen.getByText(/needs the city builder/)).toBeOnTheScreen();
    });
  });

  describe('saved cities (D-080)', () => {
    test('a city the traveller is in is saved and listed in a drop-down on the page', async () => {
      userIsAt(38.72, -9.14);
      render(<SuggestedScreen />);
      await screen.findByText('Near you: Lisbon');
      expect(useSavedPlaces.getState().slugs).toEqual(['lisbon']);
      await userEvent.press(screen.getByText('Saved cities (1)'));
      expect(screen.getByRole('radio', { name: /Lisbon/ })).toBeOnTheScreen();
    });

    test('picking a saved city makes it the traveller’s location again', async () => {
      useSavedPlaces.setState({ slugs: ['lisbon'] });
      render(<SuggestedScreen />);
      await userEvent.press(await screen.findByText('Saved cities (1)'));
      await userEvent.press(screen.getByRole('radio', { name: /Lisbon/ }));
      expect(usePlaceStore.getState().position).toEqual({ lat: 38.72, lng: -9.14 });
      expect(usePlaceStore.getState().placeHint).toEqual({ name: 'Lisbon', countryCode: 'PT' });
    });

    test('no drop-down before any city is saved', async () => {
      render(<SuggestedScreen />);
      await screen.findByText('Where do you want to walk?');
      expect(screen.queryByText(/Saved cities/)).toBeNull();
    });
  });
});

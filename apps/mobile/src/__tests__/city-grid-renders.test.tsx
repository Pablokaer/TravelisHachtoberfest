import { render, screen, userEvent, within } from '@testing-library/react-native';

import CityScreen from '@/app/(tabs)/(explore)/city/[slug]';
import type { AttractionSummary, City } from '@/features/destinations/api';
import { useExploreStore } from '@/features/destinations/store';
import { useRouteStore } from '@/features/route/store';
import { fakeCity } from '@/testing/fixtures';
import '@/lib/i18n';

/** One city with three photographed places; the ratings map keeps its identity, as a query's. */
class MockGridServer {
  static city: City = fakeCity();
  static place = (id: string): AttractionSummary => ({
    id,
    citySlug: 'amsterdam',
    nameEn: id,
    namePt: null,
    category: 'museum',
    lat: 52.36,
    lng: 4.88,
    popularity: 90,
    avgVisitMinutes: 90,
    imageUrl: `https://example.org/${id}.jpg`,
    isUnesco: false,
  });
  static attractions = ['rijks', 'vondel', 'dam'].map(MockGridServer.place);
  static ratings = new Map([['rijks', { count: 3, average: 5 }]]);
}

/** Counts how often each card's photo renders: a card that re-renders renders its photo. */
class MockPhotoRenders {
  static byUri = new Map<string, number>();
  static count(uri: string | null) {
    if (uri) MockPhotoRenders.byUri.set(uri, (MockPhotoRenders.byUri.get(uri) ?? 0) + 1);
  }
}

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), setParams: jest.fn(), navigate: jest.fn() },
  useLocalSearchParams: () => ({ slug: 'amsterdam' }),
}));
jest.mock('@/features/destinations/api', () => ({
  ...jest.requireActual('@/features/destinations/api'),
  useCities: () => ({ isPending: false, isError: false, data: [MockGridServer.city] }),
  useAttractions: () => ({ isPending: false, isError: false, data: MockGridServer.attractions }),
}));
jest.mock('@/features/reviews/api', () => ({
  ...jest.requireActual('@/features/reviews/api'),
  useCityRatings: () => ({ data: MockGridServer.ratings }),
}));
jest.mock('@/features/destinations/thumbnail', () => {
  const actual = jest.requireActual('@/features/destinations/thumbnail');
  return {
    ...actual,
    Thumbnail: (props: { uri: string | null }) => {
      MockPhotoRenders.count(props.uri);
      return actual.Thumbnail(props);
    },
  };
});

beforeEach(() => {
  useRouteStore.getState().clear();
  useExploreStore.getState().setView('list');
  MockPhotoRenders.byUri.clear();
});

test('adding one place to the route re-renders its card only, not the others', async () => {
  render(<CityScreen />);
  const before = new Map(MockPhotoRenders.byUri);
  const rijks = screen.getByTestId('attraction-card-rijks');
  await userEvent.press(within(rijks).getByTestId('route-checkbox'));

  expect(useRouteStore.getState().stops.map((s) => s.id)).toEqual(['rijks']);
  expect(within(rijks).getByTestId('route-checkbox')).toBeChecked();
  const renders = (id: string) => {
    const uri = `https://example.org/${id}.jpg`;
    return (MockPhotoRenders.byUri.get(uri) ?? 0) - (before.get(uri) ?? 0);
  };
  expect(renders('rijks')).toBeGreaterThan(0);
  expect(renders('vondel')).toBe(0);
  expect(renders('dam')).toBe(0);
});

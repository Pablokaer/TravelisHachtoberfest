import { render, screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';

import CityScreen from '@/app/(tabs)/(explore)/city/[slug]';
import type { AttractionSummary, City } from '@/features/destinations/api';
import { useExploreStore } from '@/features/destinations/store';
import type { MapViewProps } from '@/features/map/map-view.types';
import { useRouteStore } from '@/features/route/store';
import '@/lib/i18n';

/** What the city page loads: one city, two places, a rating for one of them. */
class MockCityServer {
  static city: City = {
    slug: 'amsterdam',
    nameEn: 'Amsterdam',
    namePt: 'Amesterdão',
    countryCode: 'NL',
    lat: 52.37,
    lng: 4.89,
    bbox: [52.3, 4.8, 52.4, 4.95],
    timezone: 'Europe/Amsterdam',
    attractionCount: 2,
    countryNameEn: 'Netherlands',
    countryNamePt: 'Países Baixos',
    cover: null,
  };
  static place = (id: string, nameEn: string, imageUrl: string | null): AttractionSummary => ({
    id,
    citySlug: 'amsterdam',
    nameEn,
    namePt: null,
    category: 'museum',
    lat: 52.36,
    lng: 4.88,
    popularity: 90,
    avgVisitMinutes: 90,
    imageUrl,
    isUnesco: false,
  });
  static attractions = [
    MockCityServer.place('rijks', 'Rijksmuseum', 'https://example.org/rijks.jpg'),
    MockCityServer.place('vondel', 'Vondelpark', null),
  ];
}

/** Stand-in for the map: markers are buttons, the popup is rendered as given. */
class MockMap {
  static last: MapViewProps | null = null;
}

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), setParams: jest.fn(), navigate: jest.fn() },
  useLocalSearchParams: () => ({ slug: 'amsterdam' }),
}));
jest.mock('@/features/destinations/api', () => ({
  ...jest.requireActual('@/features/destinations/api'),
  useCities: () => ({ isPending: false, isError: false, data: [MockCityServer.city] }),
  useAttractions: () => ({ isPending: false, isError: false, data: MockCityServer.attractions }),
}));
jest.mock('@/features/reviews/api', () => ({
  ...jest.requireActual('@/features/reviews/api'),
  useCityRatings: () => ({ data: new Map([['rijks', { count: 3, average: 5 }]]) }),
}));
jest.mock('@/features/map/map-view', () => {
  const { Pressable, Text, View } = jest.requireActual('react-native');
  return {
    MapView: (props: MapViewProps) => {
      MockMap.last = props;
      return (
        <View>
          {props.points.map((p) => (
            <Pressable
              key={p.id}
              testID={`marker-${p.id}`}
              onPress={() => props.onPointPress?.(p.id)}>
              <Text>{p.selected ? 'selected' : 'idle'}</Text>
            </Pressable>
          ))}
          <Pressable testID="empty-map" onPress={() => props.onMapPress?.()} />
          {props.popup}
        </View>
      );
    },
  };
});

beforeEach(() => {
  useRouteStore.getState().clear();
  useExploreStore.getState().setView('map');
  jest.mocked(router.push).mockClear();
});

test('the map draws every place as a photo marker with its own image', () => {
  render(<CityScreen />);
  expect(MockMap.last?.markers).toBe('photo');
  expect(MockMap.last?.points.map((p) => [p.id, p.imageUrl])).toEqual([
    ['rijks', 'https://example.org/rijks.jpg'],
    ['vondel', null],
  ]);
});

test('a first press on a marker opens the compact card instead of navigating', async () => {
  render(<CityScreen />);
  await userEvent.press(screen.getByTestId('marker-rijks'));
  expect(router.push).not.toHaveBeenCalled();
  expect(screen.getByTestId('attraction-card-rijks')).toHaveTextContent(/Rijksmuseum/);
  expect(screen.getByTestId('card-rating')).toHaveTextContent('5.0 ★');
  expect(MockMap.last?.selectedId).toBe('rijks');
});

test('pressing the card opens the attraction page, as in the list', async () => {
  render(<CityScreen />);
  await userEvent.press(screen.getByTestId('marker-rijks'));
  await userEvent.press(screen.getByRole('button', { name: /Rijksmuseum/ }));
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/attraction/[id]',
    params: { id: 'rijks' },
  });
});

test('+ adds the place to the route and stays on the map', async () => {
  render(<CityScreen />);
  await userEvent.press(screen.getByTestId('marker-rijks'));
  await userEvent.press(screen.getByTestId('route-checkbox'));
  expect(useRouteStore.getState().stops.map((s) => s.id)).toEqual(['rijks']);
  expect(router.push).not.toHaveBeenCalled();
  expect(screen.getByTestId('route-checkbox')).toBeChecked();
  expect(screen.getByText('1 stop in your route')).toBeTruthy();
});

test('one place is selected at a time; an empty spot on the map closes the card', async () => {
  render(<CityScreen />);
  await userEvent.press(screen.getByTestId('marker-rijks'));
  await userEvent.press(screen.getByTestId('marker-vondel'));
  expect(screen.queryByTestId('attraction-card-rijks')).toBeNull();
  expect(screen.getByTestId('attraction-card-vondel')).toBeTruthy();
  expect(MockMap.last?.selectedId).toBe('vondel');

  await userEvent.press(screen.getByTestId('empty-map'));
  expect(screen.queryByTestId('attraction-card-vondel')).toBeNull();
  expect(MockMap.last?.selectedId).toBeNull();
});

test('a sixth place joins the route like any other: no plan limit (D-065)', async () => {
  for (const id of ['a', 'b', 'c', 'd', 'e'])
    useRouteStore.getState().add(MockCityServer.place(id, id, null));
  render(<CityScreen />);
  await userEvent.press(screen.getByTestId('marker-rijks'));
  await userEvent.press(screen.getByTestId('route-checkbox'));
  expect(useRouteStore.getState().stops).toHaveLength(6);
  expect(screen.queryByText(/places per list/)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Upgrade to Premium' })).toBeNull();
});

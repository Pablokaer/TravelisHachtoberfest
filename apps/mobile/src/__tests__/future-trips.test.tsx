import { render, screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';

import { futureTripFromRow, type FutureTrip } from '@/features/future-trips/api';
import '@/lib/i18n';

import FutureTripsScreen from '../app/(tabs)/future-trips';

/** What the future trips query returns and what was asked to be removed in each test. */
class MockFutureTrips {
  static trips: FutureTrip[] = [];
  static removed: string[] = [];
}

jest.mock('expo-router', () => ({ router: { push: jest.fn(), navigate: jest.fn() } }));
jest.mock('@/features/profile/api', () => ({ useProfile: () => ({ data: undefined }) }));
jest.mock('@/features/destinations/api', () => ({
  ...jest.requireActual('@/features/destinations/api'),
  useCities: () => ({
    isPending: false,
    isError: false,
    data: [
      jest.requireActual('@/testing/fixtures').fakeCity({ slug: 'lisbon', nameEn: 'Lisbon' }),
      jest.requireActual('@/testing/fixtures').fakeCity({ slug: 'kyoto', nameEn: 'Kyoto' }),
    ],
  }),
}));
jest.mock('@/features/future-trips/api', () => ({
  ...jest.requireActual('@/features/future-trips/api'),
  useFutureTrips: () => ({
    isPending: false,
    isError: false,
    data: MockFutureTrips.trips,
    refetch: jest.fn(),
  }),
  useRemoveFutureTrip: () => ({
    mutate: (slug: string) => MockFutureTrips.removed.push(slug),
    isPending: false,
  }),
}));

beforeEach(() => {
  MockFutureTrips.trips = [
    { citySlug: 'lisbon', reason: 'Warm and sunny in December', plannedFor: '2026-12-10' },
    { citySlug: 'kyoto', reason: null, plannedFor: null },
  ];
  MockFutureTrips.removed = [];
  jest.clearAllMocks();
});

describe('futureTripFromRow (D-081)', () => {
  test('maps a database row to a future trip', () => {
    expect(
      futureTripFromRow({
        city_slug: 'lisbon',
        reason: 'Sunny',
        planned_for: '2026-12-10',
        created_at: '2026-10-11T10:00:00Z',
        user_id: 'u1',
      }),
    ).toEqual({ citySlug: 'lisbon', reason: 'Sunny', plannedFor: '2026-12-10' });
  });
});

describe('FutureTripsScreen (D-081)', () => {
  test('lists the saved cities with the reason and the planned day', () => {
    render(<FutureTripsScreen />);
    expect(screen.getByText('Lisbon')).toBeOnTheScreen();
    expect(screen.getByText('Warm and sunny in December')).toBeOnTheScreen();
    expect(screen.getByText(/10 Dec 2026/)).toBeOnTheScreen();
    expect(screen.getByText('Kyoto')).toBeOnTheScreen();
  });

  test('a city opens its page, with its lists and everything else', async () => {
    render(<FutureTripsScreen />);
    await userEvent.press(screen.getByTestId('city-card-lisbon'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/short/[slug]',
      params: { slug: 'lisbon' },
    });
  });

  test('a city can be taken off the list', async () => {
    render(<FutureTripsScreen />);
    await userEvent.press(screen.getByRole('button', { name: 'Remove Kyoto from future trips' }));
    expect(MockFutureTrips.removed).toEqual(['kyoto']);
  });

  test('with nothing saved it points to the planner', async () => {
    MockFutureTrips.trips = [];
    render(<FutureTripsScreen />);
    expect(screen.getByText('No future trips yet')).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: 'Plan your next trip' }));
    expect(router.navigate).toHaveBeenCalledWith('/plan');
  });
});

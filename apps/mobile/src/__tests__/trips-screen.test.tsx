import { render, screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';

import type { WalklistCard } from '@/features/trips/community-api';
import type { TripSummary } from '@/features/trips/api';
import '@/lib/i18n';

import TripsScreen from '../app/(tabs)/trips';

/** What the trips and saved lists hooks return in each test. */
class MockTripsServer {
  static own: TripSummary[] = [];
  static saved: WalklistCard[] = [];
  static hasNextPage = false;
  static fetchNextPage = jest.fn();

  static reset() {
    MockTripsServer.own = [];
    MockTripsServer.saved = [];
    MockTripsServer.hasNextPage = false;
    MockTripsServer.fetchNextPage = jest.fn();
  }
}

jest.mock('expo-router', () => ({ router: { push: jest.fn(), navigate: jest.fn() } }));
jest.mock('@/features/trips/api', () => ({
  ...jest.requireActual('@/features/trips/api'),
  useTrips: () => ({ isPending: false, isError: false, data: MockTripsServer.own }),
}));
jest.mock('@/features/trips/community-api', () => ({
  ...jest.requireActual('@/features/trips/community-api'),
  useWalklistPages: () => ({
    isPending: false,
    isError: false,
    data: { pages: [MockTripsServer.saved] },
    hasNextPage: MockTripsServer.hasNextPage,
    fetchNextPage: MockTripsServer.fetchNextPage,
    isFetchingNextPage: false,
  }),
  useToggleSavedWalklist: () => ({ isPending: false, mutate: jest.fn() }),
}));
jest.mock('@/features/destinations/api', () => ({
  ...jest.requireActual('@/features/destinations/api'),
  useCities: () => ({ data: [jest.requireActual('@/testing/fixtures').fakeCity()] }),
}));
jest.mock('@/features/profile/api', () => ({ useProfile: () => ({ data: undefined }) }));

const ownTrip: TripSummary = {
  id: 'mine-1',
  name: 'My canal day',
  citySlug: 'amsterdam',
  tripDate: null,
  distanceM: 3000,
  walkingSeconds: 2400,
  visitMinutes: 90,
  stopCount: 4,
  createdAt: '2026-09-01T10:00:00Z',
  visibility: 'public',
  cover: null,
};

const savedList: WalklistCard = {
  id: 'theirs-1',
  name: 'Historic Amsterdam',
  citySlug: 'amsterdam',
  authorName: 'Ana',
  isOfficial: false,
  visibility: 'public',
  stopCount: 12,
  distanceM: 5400,
  walkingSeconds: 4200,
  visitMinutes: 160,
  rating: { count: 8, average: 4.9 },
  createdAt: '2026-09-02T10:00:00Z',
  isSaved: true,
  isOwn: false,
  startsAt: null,
  attendeeCount: 0,
  isAttending: false,
  authorPublicId: 'pub-ana',
  cover: null,
};

beforeEach(() => {
  MockTripsServer.reset();
  jest.mocked(router.push).mockClear();
});

test('My lists is the default tab: the user own trips open their editable page', async () => {
  MockTripsServer.own = [ownTrip];
  render(<TripsScreen />);
  expect(screen.getByRole('radio', { name: 'My lists' })).toBeChecked();
  await userEvent.press(screen.getByRole('button', { name: 'My canal day, Amsterdam' }));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/trip/[id]', params: { id: 'mine-1' } });
});

test('Saved shows other travellers lists, with author, rating and the Saved state', async () => {
  MockTripsServer.saved = [savedList];
  render(<TripsScreen />);
  await userEvent.press(screen.getByRole('radio', { name: 'Saved' }));
  expect(screen.getByText('by Ana')).toBeOnTheScreen();
  expect(
    screen.getByRole('button', { name: 'Remove Historic Amsterdam from saved' }),
  ).toBeOnTheScreen();
  await userEvent.press(screen.getByRole('button', { name: 'Historic Amsterdam, Amsterdam' }));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/shared', params: { id: 'theirs-1' } });
});

test('Saved without lists explains how to save one; more pages load on demand', async () => {
  render(<TripsScreen />);
  await userEvent.press(screen.getByRole('radio', { name: 'Saved' }));
  expect(screen.getByText('No saved walk lists')).toBeOnTheScreen();
});

test('a long saved list loads its next page', async () => {
  MockTripsServer.saved = [savedList];
  MockTripsServer.hasNextPage = true;
  render(<TripsScreen />);
  await userEvent.press(screen.getByRole('radio', { name: 'Saved' }));
  await userEvent.press(screen.getByRole('button', { name: 'Load more' }));
  expect(MockTripsServer.fetchNextPage).toHaveBeenCalled();
});

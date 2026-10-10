import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { zonedToUtc } from '@wayfarer/shared';

import TripScreen from '@/app/trip/[id]';
import type { TripDetail } from '@/features/trips/api';
import '@/lib/i18n';
import { featuresWrapper } from '@/testing/features';

/** The owner's trip and whether they are a moderator. */
class MockOwnTripServer {
  /** null: the trip is not the caller's (RLS returns no row). */
  static trip: TripDetail | null;
  static moderator = false;
  static schedules: (string | null)[] = [];
}

jest.mock('expo-router', () => {
  const { Text: MockText } = jest.requireActual('react-native');
  const MockRedirect = ({ href }: { href: unknown }) => (
    <MockText testID="redirect">{JSON.stringify(href)}</MockText>
  );
  return {
    Stack: { Screen: () => null },
    useLocalSearchParams: () => ({ id: 't1' }),
    router: { push: jest.fn(), back: jest.fn() },
    Redirect: MockRedirect,
  };
});
jest.mock('@/features/trips/api', () => ({
  ...jest.requireActual('@/features/trips/api'),
  useTrip: () => ({ isPending: false, isError: false, data: MockOwnTripServer.trip }),
  useDeleteTrip: () => ({ isPending: false, mutate: jest.fn() }),
}));
jest.mock('@/features/trips/sharing-api', () => ({
  ...jest.requireActual('@/features/trips/sharing-api'),
  useSetTripVisibility: () => ({ isPending: false, error: null, mutate: jest.fn() }),
}));
jest.mock('@/features/trips/community-api', () => ({
  ...jest.requireActual('@/features/trips/community-api'),
  useIsModerator: () => ({ data: MockOwnTripServer.moderator }),
  useSetTripOfficial: () => ({ isPending: false, error: null, mutate: jest.fn() }),
  useSetTripSchedule: () => ({
    isPending: false,
    error: null,
    isSuccess: false,
    mutate: (startsAt: string | null) => MockOwnTripServer.schedules.push(startsAt),
  }),
}));
jest.mock('@/features/reviews/api', () => ({
  ...jest.requireActual('@/features/reviews/api'),
  useReviews: () => ({ data: [], isPending: false }),
  useRatingSummary: () => ({ data: { count: 1, average: 5 } }),
}));
jest.mock('@/features/profile/api', () => ({ useProfile: () => ({ data: undefined }) }));
jest.mock('@/features/destinations/api', () => ({
  ...jest.requireActual('@/features/destinations/api'),
  useCities: () => ({
    data: [jest.requireActual('@/testing/fixtures').fakeCity({ timezone: 'Europe/Amsterdam' })],
  }),
}));

const trip = (over: Partial<TripDetail> = {}): TripDetail => ({
  id: 't1',
  name: 'My canal day',
  citySlug: 'amsterdam',
  tripDate: null,
  distanceM: 3000,
  walkingSeconds: 2400,
  visitMinutes: 90,
  stopCount: 0,
  createdAt: '2026-09-01T10:00:00Z',
  visibility: 'public',
  isOfficial: false,
  startsAt: null,
  geometry: null,
  isFallback: false,
  provider: null,
  stops: [],
  ...over,
});

beforeEach(() => {
  MockOwnTripServer.trip = trip();
  MockOwnTripServer.moderator = false;
  MockOwnTripServer.schedules = [];
});

test('the owner reads the reviews of their list but has no form to rate it', () => {
  render(<TripScreen />);
  expect(screen.getByText('Reviews')).toBeOnTheScreen();
  expect(screen.getByText('Travellers who open your list can rate it here.')).toBeOnTheScreen();
  expect(screen.queryByTestId('review-form')).toBeNull();
  expect(screen.queryByText('Moderation')).toBeNull();
});

test('a moderator can make their own public list official from its page', () => {
  MockOwnTripServer.moderator = true;
  render(<TripScreen />);
  expect(screen.getByRole('button', { name: 'Mark as official' })).toBeOnTheScreen();
});

test('someone else opening the edit address of a list gets the read-only view instead', () => {
  // The shared view shows a public list, asks for a password, or says a private one is not
  // available — never the owner's editing page (D-040).
  MockOwnTripServer.trip = null;
  render(<TripScreen />);
  expect(JSON.parse(screen.getByTestId('redirect').props.children)).toEqual({
    pathname: '/shared',
    params: { id: 't1' },
  });
  expect(screen.queryByRole('button', { name: 'Save visibility' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Delete trip' })).toBeNull();
});

describe('date and time (D-041)', () => {
  const future = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

  test('the owner gives the list a date and time, in the city time', async () => {
    render(<TripScreen />);
    fireEvent.changeText(screen.getByTestId('schedule-date'), future);
    fireEvent.changeText(screen.getByTestId('schedule-time'), '18:30');
    await userEvent.press(screen.getByRole('button', { name: 'Save date and time' }));
    expect(MockOwnTripServer.schedules).toEqual([
      zonedToUtc(future, '18:30', 'Europe/Amsterdam').toISOString(),
    ]);
  });

  test('a scheduled list shows its time and can lose it', async () => {
    MockOwnTripServer.trip = trip({ startsAt: '2030-10-04T16:30:00Z' });
    render(<TripScreen />);
    expect(screen.getByTestId('schedule-date').props.value).toBe('2030-10-04');
    expect(screen.getByTestId('schedule-time').props.value).toBe('18:30');
    await userEvent.press(screen.getByRole('button', { name: 'Remove time' }));
    expect(MockOwnTripServer.schedules).toEqual([null]);
  });

  test('a time in the past is refused; a private list is told it is not listed', async () => {
    MockOwnTripServer.trip = trip({ visibility: 'private' });
    render(<TripScreen />);
    expect(screen.getByText('Only public lists are listed as meetups.')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByTestId('schedule-date'), '2020-01-01');
    fireEvent.changeText(screen.getByTestId('schedule-time'), '10:00');
    await userEvent.press(screen.getByRole('button', { name: 'Save date and time' }));
    expect(await screen.findByText('Choose a date and time in the future.')).toBeOnTheScreen();
    expect(MockOwnTripServer.schedules).toEqual([]);
  });
});

describe('group chat for the organiser (D-044)', () => {
  /** The walk chat is hidden for now (D-065); these tests describe it turned on. */
  const withChat = { wrapper: featuresWrapper({ walkChat: true }) };

  test('the organiser of a public list opens its chat, with or without a time', () => {
    MockOwnTripServer.trip = trip({ visibility: 'public', startsAt: null });
    render(<TripScreen />, withChat);
    expect(screen.getByRole('button', { name: 'Open group chat' })).toBeOnTheScreen();
  });

  test('a private list gathers nobody, so it offers no chat', () => {
    MockOwnTripServer.trip = trip({ visibility: 'private' });
    render(<TripScreen />, withChat);
    expect(screen.queryByRole('button', { name: 'Open group chat' })).toBeNull();
  });

  test('while the walk chat is hidden (D-065), the organiser is offered no chat', () => {
    MockOwnTripServer.trip = trip({ visibility: 'public' });
    render(<TripScreen />);
    expect(screen.queryByRole('button', { name: 'Open group chat' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Save date and time' })).toBeOnTheScreen();
  });
});

describe('every owner deletes their lists (D-065)', () => {
  test('the owner deletes the list after confirming, with no plan notice', async () => {
    render(<TripScreen />);
    expect(screen.queryByText(/Premium/)).toBeNull();
    await userEvent.press(screen.getByRole('button', { name: 'Delete trip' }));
    expect(screen.getByText(/Delete this trip\?/)).toBeOnTheScreen();
  });
});

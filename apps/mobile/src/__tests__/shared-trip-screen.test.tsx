import { render, screen, userEvent } from '@testing-library/react-native';

import SharedTripScreen from '@/app/shared';
import type { SharedTripDetail, SharedTripView } from '@/features/trips/sharing-api';
import '@/lib/i18n';

/** What `shared_trip` answers for each password the visitor tries (null = none yet). */
class MockSharedTripServer {
  static answers = new Map<string | null, SharedTripView>();
  static asked: (string | null)[] = [];
  static pushed: unknown[] = [];
  static signedIn = false;
  static moderator = false;
  static officialSet: boolean[] = [];
  static saves: { id: string; saved: boolean }[] = [];
  static joins: { id: string; attending: boolean }[] = [];

  static reset() {
    MockSharedTripServer.answers = new Map();
    MockSharedTripServer.asked = [];
    MockSharedTripServer.pushed = [];
    MockSharedTripServer.signedIn = false;
    MockSharedTripServer.moderator = false;
    MockSharedTripServer.officialSet = [];
    MockSharedTripServer.saves = [];
    MockSharedTripServer.joins = [];
  }
}

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ id: 't1' }),
  router: { push: (to: unknown) => MockSharedTripServer.pushed.push(to) },
}));
jest.mock('@/features/trips/sharing-api', () => ({
  ...jest.requireActual('@/features/trips/sharing-api'),
  useSharedTrip: (_id: string, password: string | null) => {
    MockSharedTripServer.asked.push(password);
    return { isPending: false, isError: false, data: MockSharedTripServer.answers.get(password) };
  },
}));
jest.mock('@/features/destinations/api', () => ({
  ...jest.requireActual('@/features/destinations/api'),
  useCities: () => ({
    data: [
      jest
        .requireActual('@/testing/fixtures')
        .fakeCity({ slug: 'lisbon', nameEn: 'Lisbon', timezone: 'Europe/Lisbon' }),
    ],
  }),
}));
jest.mock('@/lib/use-now', () => ({ useNow: () => new Date('2026-10-01T10:00:00Z') }));
jest.mock('@/features/auth/auth-provider', () => ({
  useAuth: () => ({ session: MockSharedTripServer.signedIn ? { user: { id: 'u1' } } : null }),
}));
jest.mock('@/features/reviews/api', () => {
  const idle = { isPending: false, error: null, mutate: jest.fn() };
  return {
    ...jest.requireActual('@/features/reviews/api'),
    useReviews: () => ({ data: [], isPending: false }),
    useRatingSummary: () => ({ data: { count: 2, average: 4.5 } }),
    useSaveReview: () => idle,
    useDeleteReview: () => idle,
  };
});
jest.mock('@/features/trips/community-api', () => ({
  ...jest.requireActual('@/features/trips/community-api'),
  useIsModerator: () => ({ data: MockSharedTripServer.moderator }),
  useSetTripOfficial: () => ({
    isPending: false,
    error: null,
    mutate: (official: boolean) => MockSharedTripServer.officialSet.push(official),
  }),
  useToggleAttendance: () => ({
    isPending: false,
    mutate: (input: { id: string; attending: boolean }) => MockSharedTripServer.joins.push(input),
  }),
  useToggleSavedWalklist: () => ({
    isPending: false,
    mutate: (input: { id: string; saved: boolean }) => MockSharedTripServer.saves.push(input),
  }),
}));
jest.mock('@/features/profile/api', () => ({ useProfile: () => ({ data: undefined }) }));

const trip = (isOwner: boolean, over: Partial<SharedTripDetail> = {}): SharedTripView => ({
  status: 'ok',
  trip: {
    id: 't1',
    name: 'Belém by the river',
    citySlug: 'lisbon',
    tripDate: null,
    distanceM: 1200,
    walkingSeconds: 900,
    visitMinutes: 20,
    createdAt: '2026-09-29T10:00:00Z',
    stopCount: 1,
    visibility: 'public',
    geometry: null,
    isFallback: false,
    provider: null,
    isOwner,
    isOfficial: false,
    authorName: 'Olga',
    rating: { count: 0, average: null },
    isSaved: false,
    startsAt: null,
    attendeeCount: 0,
    isAttending: false,
    stops: [
      {
        id: 'a1',
        citySlug: 'lisbon',
        nameEn: 'Belém Tower',
        namePt: null,
        category: 'monument',
        lat: 38.69,
        lng: -9.21,
        popularity: 90,
        avgVisitMinutes: 20,
        imageUrl: null,
        isUnesco: true,
      },
    ],
    ...over,
  },
});

beforeEach(() => MockSharedTripServer.reset());

test('a private or missing list says it is not available', () => {
  MockSharedTripServer.answers.set(null, { status: 'not_found' });
  render(<SharedTripScreen />);
  expect(screen.getByText('Walk list not available')).toBeOnTheScreen();
  expect(screen.getByText('This list is private or no longer exists.')).toBeOnTheScreen();
});

test('a public list shows its stops to a signed-out visitor, with a way to plan their own', () => {
  MockSharedTripServer.answers.set(null, trip(false));
  render(<SharedTripScreen />);
  expect(screen.getByText('Belém by the river')).toBeOnTheScreen();
  expect(screen.getByText('Belém Tower')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Plan your own walks' })).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Edit list' })).toBeNull();
});

test('a protected list asks for the password, refuses a wrong one and opens with the right one', async () => {
  MockSharedTripServer.answers.set(null, { status: 'password_required' });
  MockSharedTripServer.answers.set('nope', { status: 'wrong_password' });
  MockSharedTripServer.answers.set('lisbon24', trip(false));
  render(<SharedTripScreen />);
  expect(screen.getByText('This walk list is protected')).toBeOnTheScreen();

  await userEvent.type(screen.getByLabelText('Password'), 'nope');
  await userEvent.press(screen.getByRole('button', { name: 'Open list' }));
  expect(await screen.findByText('Wrong password. Try again.')).toBeOnTheScreen();

  await userEvent.clear(screen.getByLabelText('Password'));
  await userEvent.type(screen.getByLabelText('Password'), 'lisbon24');
  await userEvent.press(screen.getByRole('button', { name: 'Open list' }));
  expect(await screen.findByText('Belém by the river')).toBeOnTheScreen();
  expect(MockSharedTripServer.asked).toContain('lisbon24');
});

test('the owner sees their list as others do, with a way back to editing it', async () => {
  MockSharedTripServer.answers.set(null, trip(true));
  render(<SharedTripScreen />);
  expect(screen.getByText('This is your list, as others see it.')).toBeOnTheScreen();
  await userEvent.press(screen.getByRole('button', { name: 'Edit list' }));
  expect(MockSharedTripServer.pushed).toEqual([{ pathname: '/trip/[id]', params: { id: 't1' } }]);
});

describe('community features (D-035)', () => {
  test('the list shows its author and rating, signed in or not', () => {
    MockSharedTripServer.answers.set(null, trip(false, { rating: { count: 2, average: 4.5 } }));
    render(<SharedTripScreen />);
    expect(screen.getByText('by Olga')).toBeOnTheScreen();
    expect(screen.getAllByTestId('rating-summary')[0]).toHaveTextContent('4.5 ★ · 2 reviews');
    // Reviews and saving need an account.
    expect(screen.queryByTestId('review-form')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save Belém by the river' })).toBeNull();
  });

  test('an official list is marked as such', () => {
    MockSharedTripServer.answers.set(null, trip(false, { isOfficial: true }));
    render(<SharedTripScreen />);
    expect(screen.getByText('Official')).toBeOnTheScreen();
    expect(screen.getByText('by Travelist')).toBeOnTheScreen();
  });

  test('a signed-in visitor saves the list and rates it', async () => {
    MockSharedTripServer.signedIn = true;
    MockSharedTripServer.answers.set(null, trip(false));
    render(<SharedTripScreen />);
    await userEvent.press(screen.getByRole('button', { name: 'Save Belém by the river' }));
    expect(MockSharedTripServer.saves).toEqual([{ id: 't1', saved: true }]);
    expect(screen.getByText('Rate this walk list')).toBeOnTheScreen();
  });

  test('the owner sees the reviews of their list but cannot rate or save it', () => {
    MockSharedTripServer.signedIn = true;
    MockSharedTripServer.answers.set(null, trip(true));
    render(<SharedTripScreen />);
    expect(screen.getByText('Travellers who open your list can rate it here.')).toBeOnTheScreen();
    expect(screen.queryByTestId('review-form')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save Belém by the river' })).toBeNull();
  });

  test('a moderator marks a public list official, or removes the badge', async () => {
    MockSharedTripServer.signedIn = true;
    MockSharedTripServer.moderator = true;
    MockSharedTripServer.answers.set(null, trip(false));
    const { rerender } = render(<SharedTripScreen />);
    await userEvent.press(screen.getByRole('button', { name: 'Mark as official' }));
    expect(MockSharedTripServer.officialSet).toEqual([true]);

    MockSharedTripServer.answers.set(null, trip(false, { isOfficial: true }));
    rerender(<SharedTripScreen />);
    await userEvent.press(screen.getByRole('button', { name: 'Remove official badge' }));
    expect(MockSharedTripServer.officialSet).toEqual([true, false]);
  });

  test('moderators cannot make a password list official; others see no moderation', () => {
    MockSharedTripServer.signedIn = true;
    MockSharedTripServer.moderator = true;
    MockSharedTripServer.answers.set(null, trip(false, { visibility: 'password' }));
    const { rerender } = render(<SharedTripScreen />);
    expect(screen.getByText('Only public lists can be official.')).toBeOnTheScreen();

    MockSharedTripServer.moderator = false;
    MockSharedTripServer.answers.set(null, trip(false));
    rerender(<SharedTripScreen />);
    expect(screen.queryByText('Moderation')).toBeNull();
  });
});

test('a visitor only views a shared list: no editing, visibility, sharing or delete controls', () => {
  MockSharedTripServer.signedIn = true;
  MockSharedTripServer.answers.set(null, trip(false));
  render(<SharedTripScreen />);
  expect(screen.getByText('Belém by the river')).toBeOnTheScreen();
  for (const name of ['Edit list', 'Save visibility', 'Share list', 'Delete trip'])
    expect(screen.queryByRole('button', { name })).toBeNull();
  expect(screen.queryByRole('radio', { name: 'Private' })).toBeNull();
  expect(screen.queryAllByTestId(/^drag-stop-/)).toHaveLength(0);
});

describe('meetups (D-041)', () => {
  const meetup = { startsAt: '2026-10-04T09:00:00Z', attendeeCount: 2 };

  test('a list with a time says when it starts, in the city time, and how many are going', () => {
    MockSharedTripServer.answers.set(null, trip(false, meetup));
    render(<SharedTripScreen />);
    const banner = screen.getByTestId('meetup-banner');
    expect(banner).toHaveTextContent(/Sun 4 Oct, 10:00/);
    expect(banner).toHaveTextContent(/Lisbon time/);
    expect(banner).toHaveTextContent(/Starts in 2 d 23 h/);
    expect(banner).toHaveTextContent(/2 going/);
    // Signed out: no joining.
    expect(screen.queryByRole('button', { name: "I'm going" })).toBeNull();
  });

  test('a signed-in traveller joins the meetup', async () => {
    MockSharedTripServer.signedIn = true;
    MockSharedTripServer.answers.set(null, trip(false, meetup));
    render(<SharedTripScreen />);
    await userEvent.press(screen.getByRole('button', { name: "I'm going" }));
    expect(MockSharedTripServer.joins).toEqual([{ id: 't1', attending: true }]);
  });

  // D-044: any public list can be joined, before or after its start; its chat stays open.
  test('a meetup that has started can still be joined', () => {
    MockSharedTripServer.signedIn = true;
    MockSharedTripServer.answers.set(
      null,
      trip(false, { startsAt: '2026-10-01T09:00:00Z', attendeeCount: 2 }),
    );
    render(<SharedTripScreen />);
    expect(screen.getByTestId('meetup-banner')).toHaveTextContent(/Started/);
    expect(screen.getByRole('button', { name: "I'm going" })).toBeOnTheScreen();
  });

  test('a public list without a time can be joined too; a protected one cannot', () => {
    MockSharedTripServer.signedIn = true;
    MockSharedTripServer.answers.set(null, trip(false));
    const { rerender } = render(<SharedTripScreen />);
    expect(screen.getByTestId('meetup-banner')).toHaveTextContent(/0 going/);
    expect(screen.getByRole('button', { name: "I'm going" })).toBeOnTheScreen();
    MockSharedTripServer.answers.set(null, trip(false, { visibility: 'password' }));
    rerender(<SharedTripScreen />);
    expect(screen.queryByTestId('meetup-banner')).toBeNull();
  });
});

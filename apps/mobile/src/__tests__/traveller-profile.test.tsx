import { render, screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';

import TravellerScreen from '@/app/traveller';
import { messageFromRow } from '@/features/chat/api';
import { publicProfileFrom, type PublicProfileView } from '@/features/profile/public-profile-api';
import { reviewFromRow, type Review } from '@/features/reviews/api';
import { ReviewCard } from '@/features/reviews/components';
import { walklistFromRow, walklistParams, type WalklistCard } from '@/features/trips/community-api';
import '@/lib/i18n';

/** What the profile and walk list hooks return for the page. */
class MockTravellerServer {
  static view: PublicProfileView = { status: 'not_found' };
  static lists: WalklistCard[] = [];
  static asked: unknown[] = [];

  static reset() {
    MockTravellerServer.view = { status: 'not_found' };
    MockTravellerServer.lists = [];
    MockTravellerServer.asked = [];
  }
}

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ id: 'pub-ana' }),
  router: { push: jest.fn() },
}));
jest.mock('@/features/profile/public-profile-api', () => ({
  ...jest.requireActual('@/features/profile/public-profile-api'),
  usePublicProfile: () => ({ isPending: false, isError: false, data: MockTravellerServer.view }),
}));
jest.mock('@/features/trips/community-api', () => ({
  ...jest.requireActual('@/features/trips/community-api'),
  useWalklistPages: (query: unknown) => {
    MockTravellerServer.asked.push(query);
    return {
      isPending: false,
      isError: false,
      data: { pages: [MockTravellerServer.lists] },
      hasNextPage: false,
    };
  },
  useToggleSavedWalklist: () => ({ isPending: false, mutate: jest.fn() }),
}));
jest.mock('@/features/destinations/api', () => ({
  ...jest.requireActual('@/features/destinations/api'),
  useCities: () => ({ data: [] }),
}));
jest.mock('@/features/profile/api', () => ({ useProfile: () => ({ data: undefined }) }));

const anaProfile = (over: Record<string, unknown> = {}) =>
  publicProfileFrom({
    status: 'ok',
    profile: {
      public_id: 'pub-ana',
      name: 'Ana',
      avatar_path: null,
      member_since: '2026-01-15T10:00:00Z',
      public_walklist_count: 1,
      is_self: false,
      ...over,
    },
  });

function listRow(over: Record<string, unknown> = {}) {
  return {
    id: 't1',
    name: 'Ana public walk',
    city_slug: 'lisbon',
    author_name: 'Ana',
    is_official: false,
    visibility: 'public',
    stop_count: 3,
    distance_m: null,
    walking_seconds: null,
    visit_minutes: null,
    review_count: 0,
    rating_avg: null,
    created_at: '2026-09-01T10:00:00Z',
    is_saved: false,
    is_own: false,
    cover: null,
    starts_at: null,
    attendee_count: 0,
    is_attending: false,
    author_public_id: 'pub-ana',
    ...over,
  };
}

const review = (over: Partial<Review> = {}): Review => ({
  id: 'r1',
  rating: 4,
  comment: 'Great',
  createdAt: '2026-09-29T10:00:00Z',
  updatedAt: '2026-09-29T10:00:00Z',
  authorName: 'Ana',
  authorAvatarUrl: null,
  authorPublicId: 'pub-ana',
  isOwn: false,
  ...over,
});

beforeEach(() => {
  MockTravellerServer.reset();
  jest.mocked(router.push).mockClear();
});

describe('authors link to their public profile (D-045)', () => {
  test('reviews, chat messages and walk lists carry the author public id', () => {
    const common = {
      id: 'x',
      created_at: '2026-09-29T10:00:00Z',
      author_name: 'Ana',
      author_avatar_path: null,
      is_own: false,
    };
    expect(
      reviewFromRow({
        ...common,
        rating: 5,
        comment: null,
        updated_at: common.created_at,
        author_public_id: 'pub-ana',
      }).authorPublicId,
    ).toBe('pub-ana');
    expect(
      messageFromRow({ ...common, body: 'Hi', author_public_id: 'pub-ana' }).authorPublicId,
    ).toBe('pub-ana');
    expect(walklistFromRow(listRow() as never).authorPublicId).toBe('pub-ana');
    expect(walklistParams({ authorPublicId: 'pub-ana', sort: 'newest' }, 20, 0)).toMatchObject({
      p_author: 'pub-ana',
    });
  });

  test("pressing a reviewer's name opens their profile", async () => {
    render(<ReviewCard review={review()} />);
    await userEvent.press(screen.getByRole('link', { name: 'Ana' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/traveller', params: { id: 'pub-ana' } });
  });

  test('an author without a profile id is shown but not linked', () => {
    render(<ReviewCard review={review({ authorPublicId: null })} />);
    expect(screen.getByText('Ana')).toBeOnTheScreen();
    expect(screen.queryByRole('link', { name: 'Ana' })).toBeNull();
  });
});

describe('TravellerScreen', () => {
  test('shows the name, photo, member since and public walk lists', () => {
    MockTravellerServer.view = anaProfile();
    MockTravellerServer.lists = [walklistFromRow(listRow() as never)];
    render(<TravellerScreen />);
    expect(screen.getByRole('header', { name: 'Ana' })).toBeOnTheScreen();
    expect(screen.getByTestId('traveller-avatar')).toBeOnTheScreen();
    expect(screen.getByText('Member since January 2026')).toBeOnTheScreen();
    expect(screen.getByText('1 public walk list')).toBeOnTheScreen();
    expect(screen.getByText('Ana public walk')).toBeOnTheScreen();
    expect(MockTravellerServer.asked).toContainEqual({ authorPublicId: 'pub-ana', sort: 'newest' });
  });

  test('a traveller without public walk lists says so', () => {
    MockTravellerServer.view = anaProfile({ public_walklist_count: 0 });
    render(<TravellerScreen />);
    expect(screen.getByText('No public walk lists yet')).toBeOnTheScreen();
  });

  test("the user's own profile says it is how others see them", () => {
    MockTravellerServer.view = anaProfile({ is_self: true });
    render(<TravellerScreen />);
    expect(
      screen.getByText('This is your public profile, as other travellers see it.'),
    ).toBeOnTheScreen();
  });

  test('an unknown profile is not found', () => {
    render(<TravellerScreen />);
    expect(screen.getByText('Traveller not found')).toBeOnTheScreen();
  });
});

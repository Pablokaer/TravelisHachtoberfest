import { render, screen, userEvent } from '@testing-library/react-native';
import { WALKLIST_PAGE_SIZE } from '@wayfarer/shared';
import { Text } from 'react-native';

import {
  nextWalklistOffset,
  walklistFromRow,
  walklistParams,
  type WalklistCard,
} from '@/features/trips/community-api';
import { SaveWalklistButton } from '@/features/trips/save-walklist-button';
import { CityWalklistsSection } from '@/features/trips/city-walklists-section';
import { TripCard } from '@/features/trips/trip-card';
import '@/lib/i18n';
import { fakeCity } from '@/testing/fixtures';
import { layOutAsIPhone } from '@/testing/phone-width';

/** In-memory stand-in for the save / unsave mutation: what the button asked for. */
class MockSavedWalklists {
  static calls: { id: string; saved: boolean }[] = [];
  static reset() {
    MockSavedWalklists.calls = [];
  }
}

jest.mock('@/features/trips/community-api', () => ({
  ...jest.requireActual('@/features/trips/community-api'),
  // An empty preview: enough to render the section's title and subtitle.
  useWalklistPreview: () => ({
    isPending: false,
    isError: false,
    data: { items: [], hasMore: false },
  }),
  useToggleSavedWalklist: () => ({
    isPending: false,
    mutate: (input: { id: string; saved: boolean }) => MockSavedWalklists.calls.push(input),
  }),
}));

jest.mock('@/features/profile/api', () => ({ useProfile: () => ({ data: undefined }) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

/** A `list_walklists` row. */
function walklistRow(over: Record<string, unknown> = {}) {
  return {
    id: 't1',
    name: 'Historic Amsterdam',
    city_slug: 'amsterdam',
    author_name: 'Ana',
    is_official: false,
    visibility: 'public',
    stop_count: 12,
    distance_m: 5400,
    walking_seconds: 4200,
    visit_minutes: 160,
    review_count: 8,
    rating_avg: 4.9,
    created_at: '2026-09-01T10:00:00Z',
    is_saved: false,
    is_own: false,
    ...over,
  };
}

const card = (over: Record<string, unknown> = {}): WalklistCard =>
  walklistFromRow(walklistRow(over) as never);

beforeEach(() => MockSavedWalklists.reset());

describe('walk list rows (D-035)', () => {
  test('a row becomes a card with its author, rating, stops and saved state', () => {
    expect(card()).toMatchObject({
      id: 't1',
      name: 'Historic Amsterdam',
      citySlug: 'amsterdam',
      authorName: 'Ana',
      isOfficial: false,
      stopCount: 12,
      distanceM: 5400,
      walkingSeconds: 4200,
      rating: { count: 8, average: 4.9 },
      isSaved: false,
      isOwn: false,
    });
  });

  test('the query becomes RPC parameters, paged by offset', () => {
    expect(walklistParams({ citySlug: 'amsterdam', official: false, sort: 'top' }, 6, 0)).toEqual({
      p_city_slug: 'amsterdam',
      p_official: false,
      p_sort: 'top',
      p_limit: 6,
      p_offset: 0,
    });
    expect(walklistParams({ saved: true, search: '  canal ' }, 20, 40)).toEqual({
      p_saved: true,
      p_search: 'canal',
      p_sort: 'top',
      p_limit: 20,
      p_offset: 40,
    });
  });

  test('a full page asks for the next one; a short page is the last', () => {
    const full = Array.from({ length: WALKLIST_PAGE_SIZE }, () => card());
    expect(nextWalklistOffset(full, [full])).toBe(WALKLIST_PAGE_SIZE);
    expect(nextWalklistOffset(full, [full, full])).toBe(WALKLIST_PAGE_SIZE * 2);
    expect(nextWalklistOffset([card()], [full, [card()]])).toBeUndefined();
  });
});

describe('TripCard', () => {
  const amsterdam = fakeCity();

  test('a community list shows its author, stops, walk and rating', () => {
    render(<TripCard trip={card()} city={amsterdam} onPress={jest.fn()} />);
    expect(screen.getByText('Historic Amsterdam')).toBeOnTheScreen();
    expect(screen.getByText('by Ana')).toBeOnTheScreen();
    expect(screen.getByText('12 stops')).toBeOnTheScreen();
    expect(screen.getByTestId('card-rating')).toHaveTextContent('4.9 ★');
    expect(screen.queryByText('Official')).toBeNull();
  });

  test('an official list is marked as such and signed by the platform', () => {
    render(<TripCard trip={card({ is_official: true })} city={amsterdam} onPress={jest.fn()} />);
    expect(screen.getByText('Official')).toBeOnTheScreen();
    expect(screen.getByText('by Travelist')).toBeOnTheScreen();
    expect(screen.queryByText('by Ana')).toBeNull();
  });

  test('pressing the card opens it; its actions sit outside the pressable area', async () => {
    const onPress = jest.fn();
    render(
      <TripCard
        trip={card()}
        city={amsterdam}
        onPress={onPress}
        actions={<SaveWalklistButton trip={card()} />}
      />,
    );
    await userEvent.press(screen.getByRole('button', { name: 'Historic Amsterdam, Amsterdam' }));
    expect(onPress).toHaveBeenCalled();
    await userEvent.press(screen.getByRole('button', { name: 'Save Historic Amsterdam' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('SaveWalklistButton', () => {
  test('saves a list that is not saved yet', async () => {
    render(<SaveWalklistButton trip={card()} />);
    expect(screen.getByText('Save')).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: 'Save Historic Amsterdam' }));
    expect(MockSavedWalklists.calls).toEqual([{ id: 't1', saved: true }]);
  });

  test('a saved list says so and can be removed from saved', async () => {
    render(<SaveWalklistButton trip={card({ is_saved: true })} />);
    expect(screen.getByText('Saved')).toBeOnTheScreen();
    await userEvent.press(
      screen.getByRole('button', { name: 'Remove Historic Amsterdam from saved' }),
    );
    expect(MockSavedWalklists.calls).toEqual([{ id: 't1', saved: false }]);
  });

  test('nobody saves their own list', () => {
    render(<SaveWalklistButton trip={card({ is_own: true })} />);
    expect(screen.queryByText('Save')).toBeNull();
  });
});

// iPhone audit (D-076): on a phone the card's title, byline, facts and actions are centred.
describe('TripCard on a phone', () => {
  layOutAsIPhone();
  const amsterdam = fakeCity();

  test('centres the title, the author line, the facts and the actions', () => {
    render(
      <TripCard trip={card()} city={amsterdam} onPress={jest.fn()} actions={<Text>Save</Text>} />,
    );
    expect(screen.getByText('Historic Amsterdam')).toHaveStyle({ textAlign: 'center' });
    expect(screen.getByTestId('walklist-byline')).toHaveStyle({ justifyContent: 'center' });
    expect(screen.getByTestId('walklist-meta')).toHaveStyle({ justifyContent: 'center' });
    expect(screen.getByTestId('walklist-actions')).toHaveStyle({ justifyContent: 'center' });
  });
});

describe('TripCard on a tablet', () => {
  test('keeps the title at the start of the line', () => {
    render(<TripCard trip={card()} city={fakeCity()} onPress={jest.fn()} />);
    expect(screen.getByText('Historic Amsterdam')).not.toHaveStyle({ textAlign: 'center' });
  });
});

describe('Official walk lists on a phone', () => {
  layOutAsIPhone();

  test("centres 'Curated by the Travelist team.' under the title", () => {
    render(<CityWalklistsSection city={fakeCity()} kind="official" />);
    expect(screen.getByText('Curated by the Travelist team.')).toHaveStyle({
      textAlign: 'center',
    });
  });
});

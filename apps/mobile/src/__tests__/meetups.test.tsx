import { render, screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';

import { walklistFromRow, walklistParams, type WalklistCard } from '@/features/trips/community-api';
import { AttendButton } from '@/features/trips/attend-button';
import { groupByLocalDay, meetupDayLabel, meetupWhen } from '@/features/trips/meetup-time';
import { UpcomingMeetupsSection } from '@/features/trips/upcoming-meetups-section';
import '@/lib/i18n';
import { fakeCity } from '@/testing/fixtures';

/** What the meetup hooks return, and what the Attend button asked for. */
class MockMeetupServer {
  static upcoming: WalklistCard[] = [];
  static hasMore = false;
  static attendance: { id: string; attending: boolean }[] = [];

  static reset() {
    MockMeetupServer.upcoming = [];
    MockMeetupServer.hasMore = false;
    MockMeetupServer.attendance = [];
  }
}

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/features/profile/api', () => ({ useProfile: () => ({ data: undefined }) }));
jest.mock('@/features/trips/community-api', () => ({
  ...jest.requireActual('@/features/trips/community-api'),
  useWalklistPreview: () => ({
    isPending: false,
    isError: false,
    data: { items: MockMeetupServer.upcoming, hasMore: MockMeetupServer.hasMore },
  }),
  useToggleAttendance: () => ({
    isPending: false,
    mutate: (input: { id: string; attending: boolean }) => MockMeetupServer.attendance.push(input),
  }),
}));
// A fixed "now", so countdowns do not depend on when the tests run.
jest.mock('@/lib/use-now', () => ({ useNow: () => new Date('2026-10-01T10:00:00Z') }));

/** A `list_walklists` row with a meetup. */
function meetupRow(over: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    name: 'Sunrise in Alfama',
    city_slug: 'amsterdam',
    author_name: 'Ana',
    is_official: false,
    visibility: 'public',
    stop_count: 4,
    distance_m: 2000,
    walking_seconds: 1500,
    visit_minutes: 60,
    review_count: 0,
    rating_avg: null,
    created_at: '2026-09-01T10:00:00Z',
    is_saved: false,
    is_own: false,
    cover: null,
    starts_at: '2026-10-03T13:05:00Z',
    attendee_count: 3,
    is_attending: false,
    ...over,
  };
}

const meetup = (over: Record<string, unknown> = {}) => walklistFromRow(meetupRow(over) as never);
const amsterdam = fakeCity({ timezone: 'Europe/Amsterdam' });

beforeEach(() => {
  MockMeetupServer.reset();
  jest.mocked(router.push).mockClear();
});

describe('meetup rows (D-041)', () => {
  test('a row carries its start, how many are going and whether the caller is', () => {
    expect(meetup()).toMatchObject({
      startsAt: '2026-10-03T13:05:00Z',
      attendeeCount: 3,
      isAttending: false,
    });
  });

  test('upcoming meetups are asked soonest first', () => {
    expect(
      walklistParams({ citySlug: 'amsterdam', upcoming: true, sort: 'soonest' }, 5, 0),
    ).toEqual({
      p_city_slug: 'amsterdam',
      p_upcoming: true,
      p_sort: 'soonest',
      p_limit: 5,
      p_offset: 0,
    });
  });
});

describe('meetup time', () => {
  const now = new Date('2026-10-01T10:00:00Z');

  test('the start reads in the city time and counts down', () => {
    const when = meetupWhen('2026-10-03T13:05:00Z', 'Europe/Amsterdam', now, 'en-GB');
    expect(when.local).toBe('Sat 3 Oct, 15:05');
    expect(when.countdown).toEqual({ days: 2, hours: 3, minutes: 5 });
  });

  test('a later day heading is the date written out in the city', () => {
    expect(meetupDayLabel('2026-10-05', 'en-GB', 'Europe/Amsterdam')).toBe('Monday 5 October');
    expect(meetupDayLabel('2026-10-05', 'pt-PT', 'Europe/Lisbon')).toBe(
      'segunda-feira, 5 de outubro',
    );
  });

  test('meetups are grouped by the city day: today, tomorrow, then dates', () => {
    const groups = groupByLocalDay(
      [
        meetup({ id: 'a', starts_at: '2026-10-01T18:00:00Z' }),
        meetup({ id: 'b', starts_at: '2026-10-02T08:00:00Z' }),
        meetup({ id: 'c', starts_at: '2026-10-02T21:30:00Z' }),
        meetup({ id: 'd', starts_at: '2026-10-05T09:00:00Z' }),
      ],
      'Europe/Amsterdam',
      now,
    );
    // 21:30 UTC on the 2nd is 23:30 in Amsterdam: still the 2nd.
    expect(groups.map((g) => [g.day, g.items.map((i) => i.id)])).toEqual([
      ['today', ['a']],
      ['tomorrow', ['b', 'c']],
      ['2026-10-05', ['d']],
    ]);
  });
});

describe('UpcomingMeetupsSection', () => {
  test('ranks the next meetups with their countdown, time and people going', async () => {
    MockMeetupServer.upcoming = [
      meetup({ id: 'm1', name: 'Canal meetup', starts_at: '2026-10-01T10:45:00Z' }),
      meetup({
        id: 'm2',
        name: 'Weekend walk',
        starts_at: '2026-10-03T13:05:00Z',
        attendee_count: 1,
      }),
    ];
    render(<UpcomingMeetupsSection city={amsterdam} />);
    expect(screen.getByText('Upcoming meetups')).toBeOnTheScreen();
    const first = screen.getByTestId('meetup-rank-1');
    expect(first).toHaveTextContent(/Canal meetup/);
    expect(first).toHaveTextContent(/Starts in 45 min/);
    expect(first).toHaveTextContent(/3 going/);
    expect(screen.getByTestId('meetup-rank-2')).toHaveTextContent(/Starts in 2 d 3 h/);
    expect(screen.getByTestId('meetup-rank-2')).toHaveTextContent(/Sat 3 Oct, 15:05/);

    await userEvent.press(screen.getByRole('button', { name: /Canal meetup/ }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/shared', params: { id: 'm1' } });
    await userEvent.press(screen.getByRole('button', { name: 'View all meetups' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/short/[slug]/meetups',
      params: { slug: 'amsterdam' },
    });
  });

  test('without meetups it says how to plan one', () => {
    render(<UpcomingMeetupsSection city={amsterdam} />);
    expect(screen.getByText('No meetups planned')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'View all meetups' })).toBeNull();
  });
});

describe('AttendButton', () => {
  test('joins a meetup, and leaves it', async () => {
    const { rerender } = render(<AttendButton trip={meetup()} />);
    await userEvent.press(screen.getByRole('button', { name: "I'm going" }));
    rerender(<AttendButton trip={meetup({ is_attending: true })} />);
    await userEvent.press(screen.getByRole('button', { name: 'Not going' }));
    expect(MockMeetupServer.attendance).toEqual([
      { id: 'm1', attending: true },
      { id: 'm1', attending: false },
    ]);
  });

  test('the organiser has no button (they are going anyway)', () => {
    render(<AttendButton trip={meetup({ is_own: true })} />);
    expect(screen.queryByRole('button', { name: "I'm going" })).toBeNull();
  });
});

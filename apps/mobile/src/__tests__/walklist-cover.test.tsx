// Walk list cover photo (D-038): every walk list card shows the photo of its starting point
// (or of the next stop with one), with its credit; own trips and community lists alike.
import { render, screen } from '@testing-library/react-native';

import { tripSummaryFromRow } from '@/features/trips/api';
import { walklistFromRow } from '@/features/trips/community-api';
import { TripCard, type TripCardData } from '@/features/trips/trip-card';
import { walklistCoverFrom } from '@/features/trips/walklist-cover';
import '@/lib/i18n';
import { fakeCity } from '@/testing/fixtures';

jest.mock('@/features/profile/api', () => ({ useProfile: () => ({ data: undefined }) }));

const damSquare = {
  url: 'https://upload.wikimedia.org/dam.jpg',
  author: 'Ann Author',
  license: 'CC BY-SA 4.0',
};

const trip = (over: Partial<TripCardData> = {}): TripCardData => ({
  id: 't1',
  name: 'Golden Age Canal Ring',
  citySlug: 'amsterdam',
  stopCount: 6,
  distanceM: 1200,
  walkingSeconds: 960,
  ...over,
});

describe('walklistCoverFrom', () => {
  test('reads the cover the database returns', () => {
    expect(walklistCoverFrom(damSquare)).toEqual(damSquare);
    expect(walklistCoverFrom({ url: damSquare.url, author: null, license: null })).toEqual({
      url: damSquare.url,
      author: null,
      license: null,
    });
  });

  test('no cover, or one without a photo URL, is null', () => {
    expect(walklistCoverFrom(null)).toBeNull();
    expect(walklistCoverFrom(undefined)).toBeNull();
    expect(walklistCoverFrom({ author: 'Ann' })).toBeNull();
    expect(walklistCoverFrom('https://x.test/a.jpg')).toBeNull();
  });
});

describe('cover on walk list data', () => {
  test('a community list row carries its cover', () => {
    const row = { id: 't1', review_count: 0, rating_avg: null, cover: damSquare };
    expect(walklistFromRow(row as never).cover).toEqual(damSquare);
    expect(walklistFromRow({ ...row, cover: null } as never).cover).toBeNull();
  });

  test('an own trip row carries its cover (walklist_cover computed column)', () => {
    const row = {
      id: 'mine-1',
      name: 'My canal day',
      city_slug: 'amsterdam',
      trip_date: null,
      distance_m: 3000,
      walking_seconds: 2400,
      visit_minutes: 90,
      created_at: '2026-09-01T10:00:00Z',
      visibility: 'public',
      trip_stops: [{ count: 4 }],
      walklist_cover: damSquare,
    };
    expect(tripSummaryFromRow(row)).toMatchObject({ stopCount: 4, cover: damSquare });
  });
});

describe('TripCard cover', () => {
  test('shows the starting point photo with its credit', () => {
    render(<TripCard trip={trip({ cover: damSquare })} city={fakeCity()} onPress={jest.fn()} />);
    expect(screen.getByTestId('walklist-cover')).toBeOnTheScreen();
    expect(screen.getByText('Photo © Ann Author · CC BY-SA 4.0')).toBeOnTheScreen();
  });

  test('a list without a photo shows the placeholder and no credit', () => {
    render(<TripCard trip={trip({ cover: null })} city={fakeCity()} onPress={jest.fn()} />);
    expect(screen.getByTestId('walklist-cover-placeholder')).toBeOnTheScreen();
    expect(screen.queryByText(/Photo ©/)).toBeNull();
  });
});

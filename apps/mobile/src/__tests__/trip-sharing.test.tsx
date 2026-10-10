import { render, screen, userEvent } from '@testing-library/react-native';
import type { createURL } from 'expo-linking';

import { sharedTripDetail } from '@/features/trips/sharing-api';
import { createLinkSharer, tripShareUrl, type ShareDeps } from '@/features/trips/share-link';
import { TripPasswordPrompt } from '@/features/trips/trip-password-prompt';
import { VisibilityEditor, visibilityBadge } from '@/features/trips/visibility-editor';
import '@/lib/i18n';

/** Records what the platform share APIs were asked to do. */
class FakeShareApis {
  shared: { url: string; title: string }[] = [];
  copied: string[] = [];
  dismiss = false;

  deps(platform: ShareDeps['platform'], withWebShare = true): ShareDeps {
    return {
      platform,
      nativeShare: async ({ url, title }) => {
        this.shared.push({ url, title });
        return this.dismiss ? 'dismissed' : 'shared';
      },
      webShare: withWebShare
        ? async (d: { url: string; title: string }) => void this.shared.push(d)
        : undefined,
      copyText: async (text: string) => void this.copied.push(text),
    };
  }
}

describe('tripShareUrl', () => {
  test('uses the public web address when one is configured', () => {
    expect(tripShareUrl('t1', 'https://wayfarer.app/')).toBe('https://wayfarer.app/shared?id=t1');
  });

  test('falls back to the app link (the web origin on web, wayfarer:// on native)', () => {
    const createUrl: typeof createURL = (path, o) => `wayfarer://${path}?id=${o?.queryParams?.id}`;
    expect(tripShareUrl('t1', undefined, createUrl)).toBe('wayfarer://shared?id=t1');
  });
});

describe('createLinkSharer', () => {
  test('opens the native share sheet on iOS and Android', async () => {
    const apis = new FakeShareApis();
    const result = await createLinkSharer(apis.deps('ios')).share('https://x/shared/t1', 'Walk');
    expect(result).toBe('shared');
    expect(apis.shared).toEqual([{ url: 'https://x/shared/t1', title: 'Walk' }]);
  });

  test('uses the browser share sheet on web when there is one', async () => {
    const apis = new FakeShareApis();
    expect(await createLinkSharer(apis.deps('web')).share('https://x', 'Walk')).toBe('shared');
    expect(apis.copied).toEqual([]);
  });

  test('copies the link on web browsers without a share sheet', async () => {
    const apis = new FakeShareApis();
    const result = await createLinkSharer(apis.deps('web', false)).share('https://x', 'Walk');
    expect(result).toBe('copied');
    expect(apis.copied).toEqual(['https://x']);
  });
});

describe('VisibilityEditor', () => {
  const saved: { visibility: string; password: string }[] = [];
  const shares: number[] = [];
  const editor = (over: Partial<Parameters<typeof VisibilityEditor>[0]> = {}) => (
    <VisibilityEditor
      visibility="private"
      onSave={(form) => saved.push(form)}
      onShare={() => shares.push(1)}
      {...over}
    />
  );
  beforeEach(() => {
    saved.length = 0;
    shares.length = 0;
  });

  test('starts on the saved visibility and saves a new one', async () => {
    render(editor());
    expect(screen.getByRole('radio', { name: 'Private' })).toBeChecked();
    await userEvent.press(screen.getByRole('radio', { name: 'Public' }));
    await userEvent.press(screen.getByRole('button', { name: 'Save visibility' }));
    expect(saved).toEqual([{ visibility: 'public', password: '' }]);
  });

  test('asks for a password before protecting a trip that has none', async () => {
    render(editor());
    await userEvent.press(screen.getByRole('radio', { name: 'With password' }));
    await userEvent.press(screen.getByRole('button', { name: 'Save visibility' }));
    expect(await screen.findByText('Choose a password for this list')).toBeOnTheScreen();
    expect(saved).toEqual([]);
    await userEvent.type(screen.getByLabelText('Password'), 'lisbon24');
    await userEvent.press(screen.getByRole('button', { name: 'Save visibility' }));
    expect(saved).toEqual([{ visibility: 'password', password: 'lisbon24' }]);
  });

  test('a protected trip keeps its password when the field is left blank', async () => {
    render(editor({ visibility: 'password' }));
    expect(screen.getByText('Leave blank to keep the current password.')).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: 'Save visibility' }));
    expect(saved).toEqual([{ visibility: 'password', password: '' }]);
  });

  test('offers sharing only once the saved list is public or protected', async () => {
    const { rerender } = render(editor());
    expect(screen.queryByRole('button', { name: 'Share list' })).toBeNull();
    expect(screen.getByText('Only you can see this list.')).toBeOnTheScreen();
    rerender(editor({ visibility: 'public' }));
    await userEvent.press(screen.getByRole('button', { name: 'Share list' }));
    expect(shares).toHaveLength(1);
  });

  test('tells the owner when the link was copied', () => {
    render(editor({ visibility: 'public', shareNotice: 'copied' }));
    expect(screen.getByText('Link copied.')).toBeOnTheScreen();
  });
});

describe('TripPasswordPrompt', () => {
  test('sends the typed password', async () => {
    const tried: string[] = [];
    render(<TripPasswordPrompt onSubmit={(p) => tried.push(p)} />);
    expect(screen.getByText('This walk list is protected')).toBeOnTheScreen();
    await userEvent.type(screen.getByLabelText('Password'), 'lisbon24');
    await userEvent.press(screen.getByRole('button', { name: 'Open list' }));
    expect(tried).toEqual(['lisbon24']);
  });

  test('says when the password was wrong', () => {
    render(<TripPasswordPrompt wrong onSubmit={() => undefined} />);
    expect(screen.getByText('Wrong password. Try again.')).toBeOnTheScreen();
  });
});

describe('sharedTripDetail', () => {
  test('maps an opened trip and its stops (already in trip order) to the trip view', () => {
    const stop = {
      id: 'a1',
      citySlug: 'lisbon',
      nameEn: 'Belém Tower',
      namePt: 'Torre de Belém',
      category: 'monument' as const,
      lat: 38.69,
      lng: -9.21,
      popularity: 90,
      avgVisitMinutes: 20,
      imageUrl: null,
      isUnesco: true,
    };
    const trip = {
      id: 't1',
      name: 'Belém',
      city_slug: 'lisbon',
      trip_date: '2026-10-01',
      route_geometry: null,
      distance_m: 1200,
      walking_seconds: 900,
      visit_minutes: 20,
      is_fallback: true,
      provider: 'fallback',
      visibility: 'password' as const,
      created_at: '2026-09-29T10:00:00+00:00',
      is_owner: false,
      is_official: true,
      author_name: 'Olga',
      review_count: 3,
      rating_avg: 4.33,
      is_saved: true,
      starts_at: '2026-10-04T09:00:00+00:00',
      attendee_count: 2,
      is_attending: false,
      stop_ids: ['a1'],
    };
    expect(sharedTripDetail(trip, [stop])).toEqual({
      id: 't1',
      name: 'Belém',
      citySlug: 'lisbon',
      tripDate: '2026-10-01',
      distanceM: 1200,
      walkingSeconds: 900,
      visitMinutes: 20,
      createdAt: '2026-09-29T10:00:00+00:00',
      stopCount: 1,
      visibility: 'password',
      geometry: null,
      isFallback: true,
      provider: 'fallback',
      stops: [stop],
      isOwner: false,
      isOfficial: true,
      authorName: 'Olga',
      rating: { count: 3, average: 4.33 },
      isSaved: true,
      startsAt: '2026-10-04T09:00:00+00:00',
      attendeeCount: 2,
      isAttending: false,
    });
  });
});

describe('visibilityBadge', () => {
  test('marks shared lists in My Trips and leaves private ones unmarked', () => {
    expect(visibilityBadge('private')).toBeNull();
    expect(visibilityBadge('public')).toEqual({
      icon: 'globe',
      label: 'sharing.visibility.public',
    });
    expect(visibilityBadge('password')).toEqual({
      icon: 'key',
      label: 'sharing.visibility.password',
    });
  });
});

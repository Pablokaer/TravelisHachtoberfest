// Profile photos (D-039): the square crop, the storage path and public URL, the avatar with a
// photo, the editor on Edit profile, and the author's photo on review cards.
import { render, screen, userEvent } from '@testing-library/react-native';

import { Avatar } from '@/components/avatar';
import { avatarObjectPath, avatarUrl } from '@/features/profile/avatar-api';
import type { Profile } from '@/features/profile/api';
import { ProfilePhotoEditor } from '@/features/profile/profile-photo-editor';
import { reviewFromRow } from '@/features/reviews/api';
import { ReviewCard } from '@/features/reviews/components';
import '@/lib/i18n';
import { centerSquareCrop, PhotoPermissionError, type PickedPhoto } from '@/lib/photo-picker';

/** What the photo mutations were asked to do. */
class MockProfilePhotoServer {
  static saved: PickedPhoto[] = [];
  static removed = 0;
  static reset() {
    MockProfilePhotoServer.saved = [];
    MockProfilePhotoServer.removed = 0;
  }
}

jest.mock('@/features/profile/avatar-api', () => ({
  ...jest.requireActual('@/features/profile/avatar-api'),
  useSetProfilePhoto: () => ({
    isPending: false,
    error: null,
    mutate: (photo: PickedPhoto) => MockProfilePhotoServer.saved.push(photo),
  }),
  useRemoveProfilePhoto: () => ({
    isPending: false,
    error: null,
    mutate: () => (MockProfilePhotoServer.removed += 1),
  }),
}));

/** Stands in for the device photo library: returns what the test chose. */
class FakePhotoPicker {
  constructor(private readonly outcome: PickedPhoto | null | Error) {}
  pick = async (): Promise<PickedPhoto | null> => {
    if (this.outcome instanceof Error) throw this.outcome;
    return this.outcome;
  };
}

const USER = 'd0000000-0000-4000-8000-000000000001';
const photo: PickedPhoto = { uri: 'file:///tmp/me.jpg', mimeType: 'image/jpeg' };

const profile = (avatarPath: string | null): Profile => ({
  id: USER,
  displayName: 'Emma Clarke',
  nickname: 'emma',
  homeCountry: 'GB',
  language: 'en',
  units: 'metric',
  theme: 'light',
  passportExpiry: null,
  onboardedAt: '2026-06-02T09:14:00Z',
  nationalities: ['GB'],
  avatarPath,
  welcomeEmailSent: true,
});

beforeEach(() => MockProfilePhotoServer.reset());

describe('centerSquareCrop', () => {
  test('keeps the centre square of a landscape, portrait or square photo', () => {
    expect(centerSquareCrop(4000, 3000)).toEqual({
      originX: 500,
      originY: 0,
      width: 3000,
      height: 3000,
    });
    expect(centerSquareCrop(1080, 1921)).toEqual({
      originX: 0,
      originY: 420,
      width: 1080,
      height: 1080,
    });
    expect(centerSquareCrop(512, 512)).toEqual({ originX: 0, originY: 0, width: 512, height: 512 });
  });
});

describe('avatar storage', () => {
  test('a new photo goes in the user folder under a new name (no stale cached image)', () => {
    expect(avatarObjectPath(USER, 1790700000000)).toBe(`${USER}/avatar-1790700000000.jpg`);
  });

  test('the public URL of a stored photo; none without a path', () => {
    expect(avatarUrl(`${USER}/avatar-1.jpg`)).toMatch(
      new RegExp(`/storage/v1/object/public/avatars/${USER}/avatar-1\\.jpg$`),
    );
    expect(avatarUrl(null)).toBeNull();
  });
});

describe('Avatar', () => {
  test('shows the photo when there is one, the initials otherwise', () => {
    const { rerender } = render(<Avatar name="Emma Clarke" uri="https://x.test/me.jpg" />);
    expect(screen.getByTestId('avatar-photo')).toBeOnTheScreen();
    expect(screen.queryByText('EC', { includeHiddenElements: true })).toBeNull();
    rerender(<Avatar name="Emma Clarke" uri={null} />);
    // The initials are decorative (aria-hidden): the name is read next to them.
    expect(screen.getByText('EC', { includeHiddenElements: true })).toBeOnTheScreen();
  });
});

describe('ProfilePhotoEditor', () => {
  test('adds the photo chosen in the library', async () => {
    const picker = new FakePhotoPicker(photo);
    render(<ProfilePhotoEditor profile={profile(null)} pickPhoto={picker.pick} />);
    expect(screen.queryByRole('button', { name: 'Remove photo' })).toBeNull();
    await userEvent.press(screen.getByRole('button', { name: 'Add photo' }));
    expect(MockProfilePhotoServer.saved).toEqual([photo]);
  });

  test('closing the library changes nothing', async () => {
    const picker = new FakePhotoPicker(null);
    render(<ProfilePhotoEditor profile={profile(null)} pickPhoto={picker.pick} />);
    await userEvent.press(screen.getByRole('button', { name: 'Add photo' }));
    expect(MockProfilePhotoServer.saved).toEqual([]);
  });

  test('a user with a photo can change or remove it', async () => {
    const picker = new FakePhotoPicker(photo);
    render(
      <ProfilePhotoEditor profile={profile(`${USER}/avatar-1.jpg`)} pickPhoto={picker.pick} />,
    );
    expect(screen.getByTestId('avatar-photo')).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: 'Remove photo' }));
    expect(MockProfilePhotoServer.removed).toBe(1);
    await userEvent.press(screen.getByRole('button', { name: 'Change photo' }));
    expect(MockProfilePhotoServer.saved).toEqual([photo]);
  });

  test('says so when photo library access is denied', async () => {
    const picker = new FakePhotoPicker(new PhotoPermissionError());
    render(<ProfilePhotoEditor profile={profile(null)} pickPhoto={picker.pick} />);
    await userEvent.press(screen.getByRole('button', { name: 'Add photo' }));
    expect(
      await screen.findByText('Allow access to your photos in Settings to add a profile photo.'),
    ).toBeOnTheScreen();
  });
});

describe('review author photo', () => {
  const row = {
    id: 'r1',
    rating: 5,
    comment: 'Lovely',
    created_at: '2026-07-08T19:20:00Z',
    updated_at: '2026-07-08T19:20:00Z',
    author_name: 'Emma Clarke',
    is_own: false,
    author_avatar_path: `${USER}/avatar-1.jpg`,
  };

  test('a review carries its author photo URL, or none', () => {
    expect(reviewFromRow(row).authorAvatarUrl).toMatch(/\/avatars\/.+\/avatar-1\.jpg$/);
    expect(reviewFromRow({ ...row, author_avatar_path: null }).authorAvatarUrl).toBeNull();
  });

  test('the review card shows the author photo', () => {
    render(<ReviewCard review={reviewFromRow(row)} />);
    expect(screen.getByTestId('avatar-photo')).toBeOnTheScreen();
  });
});

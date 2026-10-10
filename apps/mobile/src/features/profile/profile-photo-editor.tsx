// Profile photo editor on Edit profile (D-039): the avatar, Add / Change photo (photo library,
// cropped to a 512 px square) and Remove photo. Changes apply at once, not with the form's Save.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { Text } from '@/components/text';
import type { Profile } from '@/features/profile/api';
import {
  avatarUrl,
  useRemoveProfilePhoto,
  useSetProfilePhoto,
} from '@/features/profile/avatar-api';
import { PhotoPermissionError, pickSquarePhoto, type PickedPhoto } from '@/lib/photo-picker';
import { spacing } from '@/theme/colors';
import { useTheme } from '@/theme/use-theme';

type PhotoMutations = {
  set: ReturnType<typeof useSetProfilePhoto>;
  remove: ReturnType<typeof useRemoveProfilePhoto>;
};

/** The message under the buttons: denied access, a failed save, or the privacy hint. */
function PhotoStatus({
  pickError,
  mutations,
}: {
  pickError: string | null;
  mutations: PhotoMutations;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const failed = mutations.set.error ?? mutations.remove.error;
  const error = pickError ?? (failed ? t('profile.photo.failed') : null);
  if (error) {
    return (
      <Text variant="caption" style={{ color: theme.danger }} accessibilityRole="alert">
        {error}
      </Text>
    );
  }
  return (
    <Text variant="caption" secondary>
      {t('profile.photo.hint')}
    </Text>
  );
}

/**
 * @example <ProfilePhotoEditor profile={profile} />
 * `pickPhoto` is the photo library (injected so tests can stand in for the device).
 */
export function ProfilePhotoEditor({
  profile,
  pickPhoto = pickSquarePhoto,
}: {
  profile: Profile;
  pickPhoto?: () => Promise<PickedPhoto | null>;
}) {
  const { t } = useTranslation();
  const mutations: PhotoMutations = {
    set: useSetProfilePhoto(profile.avatarPath),
    remove: useRemoveProfilePhoto(profile.avatarPath),
  };
  const [pickError, setPickError] = useState<string | null>(null);
  const busy = mutations.set.isPending || mutations.remove.isPending;

  const choose = async () => {
    setPickError(null);
    try {
      const photo = await pickPhoto();
      if (photo) mutations.set.mutate(photo);
    } catch (e) {
      setPickError(
        t(
          e instanceof PhotoPermissionError
            ? 'profile.photo.permissionDenied'
            : 'profile.photo.failed',
        ),
      );
    }
  };

  return (
    <View style={styles.row}>
      <Avatar name={profile.displayName ?? ''} uri={avatarUrl(profile.avatarPath)} size={96} />
      <View style={styles.side}>
        <View style={styles.buttons}>
          <Button
            compact
            variant="secondary"
            icon="photo"
            label={t(profile.avatarPath ? 'profile.photo.change' : 'profile.photo.add')}
            loading={mutations.set.isPending}
            disabled={busy}
            onPress={() => void choose()}
            testID="profile-photo-choose"
          />
          {profile.avatarPath ? (
            <Button
              compact
              variant="ghost"
              label={t('profile.photo.remove')}
              loading={mutations.remove.isPending}
              disabled={busy}
              onPress={() => mutations.remove.mutate()}
              testID="profile-photo-remove"
            />
          ) : null}
        </View>
        <PhotoStatus pickError={pickError} mutations={mutations} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  side: { flex: 1, gap: spacing.sm },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});

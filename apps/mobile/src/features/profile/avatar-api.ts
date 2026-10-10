// Profile photos (D-039): files in the public `avatars` Storage bucket, one folder per user
// (RLS: users write only in their own), and `profiles.avatar_path` pointing at the current one.
// Every new photo gets a new name, so no device or CDN keeps showing a cached old one.
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/auth-provider';
import { check, supabase } from '@/lib/supabase';
import type { PickedPhoto } from '@/lib/photo-picker';

const BUCKET = 'avatars';

/**
 * Storage path of a new profile photo.
 * @example avatarObjectPath('d000…01', 1790700000000) // 'd000…01/avatar-1790700000000.jpg'
 */
export function avatarObjectPath(userId: string, now: number): string {
  return `${userId}/avatar-${now}.jpg`;
}

/**
 * Public URL of a stored photo (no request is made); null without a path.
 * @example avatarUrl(profile.avatarPath) // 'http://…/storage/v1/object/public/avatars/…jpg'
 */
export function avatarUrl(path: string | null): string | null {
  if (!path) return null;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

async function uploadPhotoFile(path: string, photo: PickedPhoto): Promise<void> {
  // fetch reads file://, blob: and data: URIs alike (native and web).
  const bytes = await (await fetch(photo.uri)).arrayBuffer();
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: photo.mimeType, upsert: false });
  if (error) throw new Error(`profile photo upload to ${path} failed: ${error.message}`);
}

async function removePhotoFiles(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error)
    throw new Error(`removing profile photos ${paths.join(', ')} failed: ${error.message}`);
}

async function pointProfileAt(userId: string, path: string | null): Promise<void> {
  check(await supabase.from('profiles').update({ avatar_path: path }).eq('id', userId));
}

/** Refreshes everything that shows the photo: the profile and review cards. */
function useInvalidatePhoto() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['profile'] }),
      queryClient.invalidateQueries({ queryKey: ['reviews'] }),
    ]);
}

/**
 * Uploads a new profile photo, makes it the profile's, then deletes the previous file.
 * @example useSetProfilePhoto().mutate(await pickSquarePhoto())
 */
export function useSetProfilePhoto(previousPath: string | null) {
  const { session } = useAuth();
  const invalidate = useInvalidatePhoto();
  return useMutation({
    mutationFn: async (photo: PickedPhoto) => {
      const userId = session!.user.id;
      const path = avatarObjectPath(userId, Date.now());
      await uploadPhotoFile(path, photo);
      await pointProfileAt(userId, path).catch(async (e: unknown) => {
        await removePhotoFiles([path]);
        throw e;
      });
      if (previousPath) await removePhotoFiles([previousPath]).catch(() => undefined);
    },
    onSuccess: invalidate,
  });
}

/**
 * Removes the profile photo (the profile shows initials again) and deletes its file.
 * @example useRemoveProfilePhoto(profile.avatarPath).mutate()
 */
export function useRemoveProfilePhoto(path: string | null) {
  const { session } = useAuth();
  const invalidate = useInvalidatePhoto();
  return useMutation({
    mutationFn: async () => {
      await pointProfileAt(session!.user.id, null);
      if (path) await removePhotoFiles([path]);
    },
    onSuccess: invalidate,
  });
}

/**
 * Deletes every file in the user's avatars folder (account deletion: Storage files do not
 * cascade with the database rows).
 * @example await removeAllProfilePhotos(session.user.id)
 */
export async function removeAllProfilePhotos(userId: string): Promise<void> {
  const { data, error } = await supabase.storage.from(BUCKET).list(userId);
  if (error) throw new Error(`listing profile photos of ${userId} failed: ${error.message}`);
  await removePhotoFiles(data.map((f) => `${userId}/${f.name}`));
}

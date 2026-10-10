// Thin wrapper over expo-image-picker + expo-image-manipulator (D-039): choose one photo from
// the library and return it as a small square JPEG, ready to upload. The native crop UI only
// exists on iOS/Android, so the centre square is always cut here too (web gets the same result).
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

/** Side of the stored profile photo, in pixels (plenty for a 96 pt avatar at 3×). */
export const PROFILE_PHOTO_SIZE = 512;

export type PickedPhoto = { uri: string; mimeType: 'image/jpeg' };
export type SquareCrop = { originX: number; originY: number; width: number; height: number };

/** The user refused access to the photo library. */
export class PhotoPermissionError extends Error {
  constructor() {
    super('photo library permission denied (expected granted)');
    this.name = 'PhotoPermissionError';
  }
}

/**
 * The largest centred square of a width × height image.
 * @example centerSquareCrop(4000, 3000) // { originX: 500, originY: 0, width: 3000, height: 3000 }
 */
export function centerSquareCrop(width: number, height: number): SquareCrop {
  const side = Math.min(width, height);
  return {
    originX: Math.floor((width - side) / 2),
    originY: Math.floor((height - side) / 2),
    width: side,
    height: side,
  };
}

async function ensureLibraryAccess(): Promise<void> {
  // The browser file dialog needs no permission.
  if (Platform.OS === 'web') return;
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new PhotoPermissionError();
}

async function toSquareJpeg(asset: ImagePicker.ImagePickerAsset): Promise<PickedPhoto> {
  const context = ImageManipulator.manipulate(asset.uri)
    .crop(centerSquareCrop(asset.width, asset.height))
    .resize({ width: PROFILE_PHOTO_SIZE, height: PROFILE_PHOTO_SIZE });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  return { uri: saved.uri, mimeType: 'image/jpeg' };
}

/**
 * Opens the photo library (call it from a button press: browsers require a user gesture) and
 * returns the chosen photo as a 512 px square JPEG, or null when the user closed the library.
 * Throws PhotoPermissionError when access is denied.
 * @example const photo = await pickSquarePhoto(); if (photo) upload(photo.uri);
 */
export async function pickSquarePhoto(): Promise<PickedPhoto | null> {
  await ensureLibraryAccess();
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: 'images',
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  return asset ? toSquareJpeg(asset) : null;
}

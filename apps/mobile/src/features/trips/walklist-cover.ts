// Walk list cover (D-038): the photo of the list's starting point, or of the next stop that has
// one, chosen in the database by `walklist_cover(trip)` and returned as jsonb by
// `list_walklists` (`cover`) and by the trips computed column (`walklist_cover`).
import type { PhotoCover } from '@/features/destinations/api';

const textOrNull = (value: unknown): string | null => (typeof value === 'string' ? value : null);

/**
 * The cover as the card shows it; null when there is none (no stop has a photo) or the value
 * is not a `{ url, author, license }` object.
 * @example walklistCoverFrom({ url: 'https://…/dam.jpg', author: 'Ann', license: 'CC0' })?.url
 */
export function walklistCoverFrom(value: unknown): PhotoCover | null {
  if (typeof value !== 'object' || value === null) return null;
  const cover = value as Record<string, unknown>;
  const url = textOrNull(cover.url);
  if (!url) return null;
  return { url, author: textOrNull(cover.author), license: textOrNull(cover.license) };
}

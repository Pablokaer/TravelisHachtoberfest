// Cities the traveller has been in or searched for (D-080), kept for the drop-down of the My city
// tab. Only slugs are stored: names and coordinates come from the cities the app already loads.
import { create, type StoreApi, type UseBoundStore } from 'zustand';

import { readSafely, storageFor, writeSafely, type KeyValueStorage } from '@/lib/browser-storage';

/** Most cities kept; the oldest drop out. */
export const SAVED_PLACES_MAX = 12;

const STORAGE_KEY = 'wayfarer.saved-places';

/** @example parseSavedSlugs('["sintra"]') // ['sintra'] */
export function parseSavedSlugs(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

type SavedPlacesState = { slugs: string[]; save: (slug: string) => void };

/** @example createSavedPlacesStore(storageFor('wayfarer.saved-places')).getState().save('sintra'); */
export function createSavedPlacesStore(
  storage: KeyValueStorage,
): UseBoundStore<StoreApi<SavedPlacesState>> {
  return create<SavedPlacesState>((set, get) => ({
    slugs: parseSavedSlugs(readSafely(storage)),
    save: (slug) => {
      const slugs = [slug, ...get().slugs.filter((s) => s !== slug)].slice(0, SAVED_PLACES_MAX);
      set({ slugs });
      writeSafely(storage, JSON.stringify(slugs));
    },
  }));
}

export const useSavedPlaces = createSavedPlacesStore(storageFor(STORAGE_KEY));

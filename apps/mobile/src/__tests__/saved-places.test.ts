import type { KeyValueStorage } from '@/lib/browser-storage';
import {
  createSavedPlacesStore,
  parseSavedSlugs,
  SAVED_PLACES_MAX,
} from '@/features/suggested/saved-places';

/** In-memory stand-in for the browser's localStorage. */
class FakeKeyValueStorage implements KeyValueStorage {
  value: string | null;
  constructor(value: string | null = null) {
    this.value = value;
  }
  read(): string | null {
    return this.value;
  }
  write(value: string): void {
    this.value = value;
  }
}

describe('saved places (D-080)', () => {
  test('parseSavedSlugs keeps only a list of strings', () => {
    expect(parseSavedSlugs('["sintra","kyoto"]')).toEqual(['sintra', 'kyoto']);
    expect(parseSavedSlugs('{"a":1}')).toEqual([]);
    expect(parseSavedSlugs('[1,"ok"]')).toEqual(['ok']);
    expect(parseSavedSlugs('not json')).toEqual([]);
    expect(parseSavedSlugs(null)).toEqual([]);
  });

  test('a city is saved once, newest first, and remembered for the next visit', () => {
    const storage = new FakeKeyValueStorage();
    const store = createSavedPlacesStore(storage);
    store.getState().save('sintra');
    store.getState().save('kyoto');
    store.getState().save('sintra');
    expect(store.getState().slugs).toEqual(['sintra', 'kyoto']);
    expect(createSavedPlacesStore(storage).getState().slugs).toEqual(['sintra', 'kyoto']);
  });

  test('only the most recent cities are kept', () => {
    const store = createSavedPlacesStore(new FakeKeyValueStorage());
    for (let i = 0; i < SAVED_PLACES_MAX + 3; i += 1) store.getState().save(`city-${i}`);
    expect(store.getState().slugs).toHaveLength(SAVED_PLACES_MAX);
    expect(store.getState().slugs[0]).toBe(`city-${SAVED_PLACES_MAX + 2}`);
  });

  test('a storage that fails still lets the list work for this visit', () => {
    const broken: KeyValueStorage = {
      read: () => {
        throw new Error('blocked');
      },
      write: () => {
        throw new Error('blocked');
      },
    };
    const store = createSavedPlacesStore(broken);
    store.getState().save('sintra');
    expect(store.getState().slugs).toEqual(['sintra']);
  });
});

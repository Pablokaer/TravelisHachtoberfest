// The first question of a local install (D-079): explore the traveller's own city or a city
// elsewhere. The answer is remembered in the browser so the question is only asked once; both
// areas stay one tap away in the side bar.
import { create, type StoreApi, type UseBoundStore } from 'zustand';

import { readSafely, storageFor, writeSafely, type KeyValueStorage } from '@/lib/browser-storage';

export type StartChoice = 'home' | 'world';

/** Where the answer is kept (see `KeyValueStorage`). */
export type ChoiceStorage = KeyValueStorage;

const STORAGE_KEY = 'wayfarer.start-choice';

/** @example parseStartChoice('home') // 'home' */
export function parseStartChoice(value: string | null): StartChoice | null {
  return value === 'home' || value === 'world' ? value : null;
}

type StartChoiceState = { choice: StartChoice | null; choose: (choice: StartChoice) => void };

/** @example const store = createStartChoiceStore(storageFor('wayfarer.start-choice')); */
export function createStartChoiceStore(
  storage: ChoiceStorage,
): UseBoundStore<StoreApi<StartChoiceState>> {
  return create<StartChoiceState>((set) => ({
    choice: parseStartChoice(readSafely(storage)),
    choose: (choice) => {
      set({ choice });
      writeSafely(storage, choice);
    },
  }));
}

export const useStartChoice = createStartChoiceStore(storageFor(STORAGE_KEY));

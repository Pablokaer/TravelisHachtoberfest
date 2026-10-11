// The offline store on the web (D-092): browser localStorage, one entry per file. The native app
// uses real files (default-store.native.ts); a browser has a few MB, enough for several trips.
import { MemoryOfflineStore, type OfflineStore } from './offline-store';

const PREFIX = 'travelist.offline.';

export class LocalStorageOfflineStore implements OfflineStore {
  constructor(private readonly storage: Storage) {}

  async read(name: string): Promise<string | null> {
    return this.storage.getItem(PREFIX + name);
  }

  async write(name: string, text: string): Promise<void> {
    this.storage.setItem(PREFIX + name, text);
  }

  async remove(name: string): Promise<void> {
    this.storage.removeItem(PREFIX + name);
  }

  async names(): Promise<string[]> {
    const all = Array.from({ length: this.storage.length }, (_, i) => this.storage.key(i) ?? '');
    return all.filter((key) => key.startsWith(PREFIX)).map((key) => key.slice(PREFIX.length));
  }
}

/** localStorage when the browser lets us use it (it can throw in a private window). */
function chooseStore(): OfflineStore {
  try {
    if (typeof localStorage !== 'undefined') return new LocalStorageOfflineStore(localStorage);
  } catch {
    // storage blocked: keep the copy for this visit only
  }
  return new MemoryOfflineStore();
}

export const defaultOfflineStore: OfflineStore = chooseStore();

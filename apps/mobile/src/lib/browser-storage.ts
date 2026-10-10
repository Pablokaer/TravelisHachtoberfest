// Small values kept between visits (D-079, D-080): the first answer and the saved cities. Behind
// an interface so tests and native builds need no browser.
import { Platform } from 'react-native';

export interface KeyValueStorage {
  read(): string | null;
  write(value: string): void;
}

/** localStorage under one key; every access can throw (private window, blocked site data). */
export class BrowserKeyStorage implements KeyValueStorage {
  constructor(private readonly key: string) {}

  read(): string | null {
    return globalThis.localStorage?.getItem(this.key) ?? null;
  }

  write(value: string): void {
    globalThis.localStorage?.setItem(this.key, value);
  }
}

/** Native builds keep nothing between launches. */
class NoKeyStorage implements KeyValueStorage {
  read(): string | null {
    return null;
  }
  write(): void {}
}

/**
 * The storage of this platform for `key`.
 * @example const storage = storageFor('wayfarer.start-choice');
 */
export function storageFor(key: string): KeyValueStorage {
  return Platform.OS === 'web' ? new BrowserKeyStorage(key) : new NoKeyStorage();
}

/** A read that never throws: a blocked storage reads as empty. */
export function readSafely(storage: KeyValueStorage): string | null {
  try {
    return storage.read();
  } catch {
    return null;
  }
}

/** A write that never throws: the value still holds for this visit. */
export function writeSafely(storage: KeyValueStorage, value: string): void {
  try {
    storage.write(value);
  } catch {
    // Kept in memory only.
  }
}

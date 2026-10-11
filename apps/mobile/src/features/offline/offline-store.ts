// Where saved trips live on the device (D-092): a few named text files. The storage sits behind
// OfflineStore so the rest of the offline code (and its tests) does not care whether the files
// are real (native), browser storage (web) or memory (tests).
export interface OfflineStore {
  read(name: string): Promise<string | null>;
  write(name: string, text: string): Promise<void>;
  remove(name: string): Promise<void>;
  names(): Promise<string[]>;
}

/**
 * Memory only: for tests, and as the fallback when the device offers no storage.
 * @example const store = new MemoryOfflineStore(); await store.write('trip-1.json', '{}');
 */
export class MemoryOfflineStore implements OfflineStore {
  private readonly files = new Map<string, string>();

  async read(name: string): Promise<string | null> {
    return this.files.get(name) ?? null;
  }

  async write(name: string, text: string): Promise<void> {
    this.files.set(name, text);
  }

  async remove(name: string): Promise<void> {
    this.files.delete(name);
  }

  async names(): Promise<string[]> {
    return [...this.files.keys()];
  }
}

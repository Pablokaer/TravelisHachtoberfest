// The offline store on a phone (D-092): real files in the app's document folder, which the system
// does not clear when storage runs low (the cache folder it may).
import { Directory, File, Paths } from 'expo-file-system';

import type { OfflineStore } from './offline-store';

const FOLDER = 'travelist-offline';

export class FileOfflineStore implements OfflineStore {
  private cached: Directory | null = null;

  /** Built on first use, so importing this file does not call the native module. */
  private get folder(): Directory {
    this.cached ??= new Directory(Paths.document, FOLDER);
    return this.cached;
  }

  private ensureFolder(): Directory {
    if (!this.folder.exists) this.folder.create({ intermediates: true });
    return this.folder;
  }

  async read(name: string): Promise<string | null> {
    const file = new File(this.folder, name);
    return file.exists ? await file.text() : null;
  }

  async write(name: string, text: string): Promise<void> {
    const file = new File(this.ensureFolder(), name);
    if (!file.exists) file.create();
    file.write(text);
  }

  async remove(name: string): Promise<void> {
    const file = new File(this.folder, name);
    if (file.exists) file.delete();
  }

  async names(): Promise<string[]> {
    if (!this.folder.exists) return [];
    return this.folder
      .list()
      .filter((entry): entry is File => entry instanceof File)
      .map((file) => file.name);
  }
}

export const defaultOfflineStore: OfflineStore = new FileOfflineStore();

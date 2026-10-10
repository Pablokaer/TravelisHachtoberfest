import * as SecureStore from 'expo-secure-store';

/**
 * Supabase auth storage backed by the iOS Keychain / Android Keystore.
 * SecureStore values are limited to ~2 KB, so sessions are split into chunks.
 */
const CHUNK = 1800;
const countKey = (key: string) => `${key}.chunks`;
const chunkKey = (key: string, i: number) => `${key}.${i}`;

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const count = Number(await SecureStore.getItemAsync(countKey(key)));
    if (!count) return null;
    const parts = await Promise.all(
      Array.from({ length: count }, (_, i) => SecureStore.getItemAsync(chunkKey(key, i))),
    );
    return parts.some((p) => p == null) ? null : parts.join('');
  },
  async setItem(key: string, value: string): Promise<void> {
    await this.removeItem(key);
    const chunks = value.match(new RegExp(`[\\s\\S]{1,${CHUNK}}`, 'g')) ?? [''];
    await Promise.all(chunks.map((c, i) => SecureStore.setItemAsync(chunkKey(key, i), c)));
    await SecureStore.setItemAsync(countKey(key), String(chunks.length));
  },
  async removeItem(key: string): Promise<void> {
    const count = Number(await SecureStore.getItemAsync(countKey(key)));
    await Promise.all(
      Array.from({ length: count || 0 }, (_, i) => SecureStore.deleteItemAsync(chunkKey(key, i))),
    );
    await SecureStore.deleteItemAsync(countKey(key));
  },
};

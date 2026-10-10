jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'en', languageTag: 'en-GB' }],
}));

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => void store.set(k, v)),
    deleteItemAsync: jest.fn(async (k: string) => void store.delete(k)),
  };
});

jest.mock('@maplibre/maplibre-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Pass = ({ children }: { children?: unknown }) => children ?? null;
  return { Map: View, Camera: () => null, GeoJSONSource: Pass, Layer: () => null };
});

// Route maps in tests only include the screens under test; silence expo-router's
// "screen doesn't exist / extraneous" layout warnings for the ones left out.
const originalWarn = console.warn;
console.warn = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].startsWith('[Layout children]')) return;
  originalWarn(...args);
};

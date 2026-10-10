import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppMenuButton } from '@/components/app-menu';
import type { AttractionSummary } from '@/features/destinations/api';
import { AttractionSearch } from '@/features/destinations/attraction-search';
import {
  buildSearchIndex,
  normalizeSearch,
  searchAttractions,
  searchIndex,
} from '@/features/destinations/search';
import '@/lib/i18n';

/** Builds a minimal attraction for search tests. */
function fakeAttraction(id: string, nameEn: string, popularity = 1, namePt: string | null = null) {
  return {
    id,
    citySlug: 'lisbon',
    nameEn,
    namePt,
    category: 'monument',
    lat: 38.7,
    lng: -9.1,
    popularity,
    avgVisitMinutes: 30,
    imageUrl: null,
    isUnesco: false,
  } satisfies AttractionSummary;
}

const lisbon = [
  fakeAttraction('tower', 'Belém Tower', 90, 'Torre de Belém'),
  fakeAttraction('monastery', 'Jerónimos Monastery', 100, 'Mosteiro dos Jerónimos'),
  fakeAttraction('palace', 'Belém Palace', 40, 'Palácio de Belém'),
  fakeAttraction('arch', 'Rua Augusta Arch', 70),
];
const ids = (items: readonly AttractionSummary[]) => items.map((a) => a.id);

describe('searchAttractions', () => {
  test('ignores accents and case', () => {
    expect(normalizeSearch('  Jerónimos ')).toBe('jeronimos');
    expect(ids(searchAttractions(lisbon, 'JERON', 'en'))).toEqual(['monastery']);
  });

  test('ranks names starting with the query first, then by popularity', () => {
    // "Belém Tower"/"Belém Palace" start with it; "Mosteiro dos Jerónimos" doesn't match.
    expect(ids(searchAttractions(lisbon, 'bel', 'en'))).toEqual(['tower', 'palace']);
    // "arch" starts a word in "Rua Augusta Arch" only.
    expect(ids(searchAttractions(lisbon, 'arch', 'en'))).toEqual(['arch']);
  });

  test('matches Portuguese names too, and respects the limit', () => {
    expect(ids(searchAttractions(lisbon, 'mosteiro', 'pt'))).toEqual(['monastery']);
    expect(searchAttractions(lisbon, 'e', 'en', 2)).toHaveLength(2);
  });

  test('an empty query matches nothing', () => {
    expect(searchAttractions(lisbon, '   ', 'en')).toEqual([]);
  });
});

describe('buildSearchIndex / searchIndex', () => {
  afterEach(() => jest.restoreAllMocks());

  test('holds every name normalised once, with its words', () => {
    const [tower] = buildSearchIndex(lisbon);
    expect(tower!.item.id).toBe('tower');
    expect(tower!.names).toEqual([
      { text: 'belem tower', words: ['belem', 'tower'] },
      { text: 'torre de belem', words: ['torre', 'de', 'belem'] },
    ]);
  });

  test('ranks exactly like searchAttractions', () => {
    const index = buildSearchIndex(lisbon);
    for (const [query, lang, limit] of [
      ['bel', 'en', Infinity],
      ['arch', 'en', Infinity],
      ['mosteiro', 'pt', Infinity],
      ['e', 'en', 2],
      ['e', 'pt', Infinity],
      ['  ', 'en', Infinity],
    ] as const) {
      expect(ids(searchIndex(index, query, lang, limit))).toEqual(
        ids(searchAttractions(lisbon, query, lang, limit)),
      );
    }
  });

  test('a keystroke normalises only the query, not every name again', () => {
    const index = buildSearchIndex(lisbon);
    const normalize = jest.spyOn(String.prototype, 'normalize');
    searchIndex(index, 'bel', 'en');
    expect(normalize).toHaveBeenCalledTimes(1);
  });
});

describe('AttractionSearch', () => {
  function renderSearch(query: string, routeOrder = new Map<string, number>()) {
    const handlers = { onQueryChange: jest.fn(), onToggle: jest.fn(), onOpen: jest.fn() };
    render(
      <AttractionSearch
        items={lisbon}
        cityName="Lisbon"
        query={query}
        routeOrder={routeOrder}
        {...handlers}
      />,
    );
    return handlers;
  }

  test('suggests matching places while typing; picking one selects it for the route', async () => {
    const handlers = renderSearch('bel');
    fireEvent.changeText(screen.getByTestId('attraction-search'), 'bele');
    expect(handlers.onQueryChange).toHaveBeenCalledWith('bele');
    await userEvent.press(
      screen.getByRole('checkbox', { name: 'Include Belém Tower in the route' }),
    );
    expect(handlers.onToggle).toHaveBeenCalledWith(lisbon[0]);
  });

  test('shows places already in the route as checked and can open a place', async () => {
    const handlers = renderSearch('bel', new Map([['palace', 2]]));
    fireEvent(screen.getByTestId('attraction-search'), 'focus');
    expect(
      screen.getByRole('checkbox', { name: 'Include Belém Palace in the route' }),
    ).toBeChecked();
    await userEvent.press(screen.getByRole('button', { name: 'Open Belém Tower' }));
    expect(handlers.onOpen).toHaveBeenCalledWith(lisbon[0]);
  });

  test('says so when nothing matches', async () => {
    renderSearch('zzz');
    fireEvent(screen.getByTestId('attraction-search'), 'focus');
    expect(screen.getByText('No places match “zzz”.')).toBeOnTheScreen();
  });
});

describe('app menu', () => {
  test('the logo button opens a menu that navigates to the main sections', async () => {
    const navigate = jest.spyOn(router, 'navigate').mockImplementation(() => undefined);
    render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}>
        <AppMenuButton />
      </SafeAreaProvider>,
    );
    await userEvent.press(screen.getByRole('button', { name: 'Open menu' }));
    for (const label of ['Explore', 'My Trips', 'Profile', 'About']) {
      expect(screen.getByRole('menuitem', { name: label })).toBeOnTheScreen();
    }
    await userEvent.press(screen.getByRole('menuitem', { name: 'My Trips' }));
    expect(navigate).toHaveBeenCalledWith('/trips');
  });
});

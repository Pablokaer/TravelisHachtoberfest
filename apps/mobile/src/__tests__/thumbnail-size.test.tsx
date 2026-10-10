import { fireEvent, render, screen } from '@testing-library/react-native';
import { PixelRatio } from 'react-native';

import type { AttractionSummary } from '@/features/destinations/api';
import { AttractionSearch } from '@/features/destinations/attraction-search';
import { AttractionRow } from '@/features/destinations/components';
import { Thumbnail, thumbnailWidthFor } from '@/features/destinations/thumbnail';
import '@/lib/i18n';

// The pipeline stores Commons' 960 px thumbnail (~230–300 kB); small boxes must not load it.
const COMMONS =
  'https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b5/Belem.jpg/960px-Belem.jpg?utm_source=x';

const place: AttractionSummary = {
  id: 'tower',
  citySlug: 'lisbon',
  nameEn: 'Belém Tower',
  namePt: 'Torre de Belém',
  category: 'monument',
  lat: 38.69,
  lng: -9.21,
  popularity: 90,
  avgVisitMinutes: 45,
  imageUrl: COMMONS,
  isUnesco: true,
};

const sourceOf = (testID: string) =>
  JSON.stringify(screen.getByTestId(testID, { includeHiddenElements: true }).props.source);

const layout = (width: number) => ({
  nativeEvent: { layout: { width, height: Math.round(width * 0.56), x: 0, y: 0 } },
});

describe('thumbnailWidthFor', () => {
  test.each([
    // Map markers: 36 px unselected, 48 px selected (D-050, D-062).
    [36, 1, 60],
    [36, 2, 60],
    [36, 3, 120],
    [48, 2, 120],
    [40, 1, 60],
    [40, 3, 120],
    [64, 2, 120],
    [64, 3, 250],
    [282, 1, 250],
    [282, 2, 500],
    [358, 3, 960],
    [2000, 2, 960],
  ])('a %i px box at %ix loads the %i px Commons thumbnail', (width, ratio, expected) => {
    expect(thumbnailWidthFor(width, ratio)).toBe(expected);
  });
});

describe('Thumbnail', () => {
  beforeEach(() => jest.spyOn(PixelRatio, 'get').mockReturnValue(2));
  afterEach(() => jest.restoreAllMocks());

  test('a box of known width loads the matching Commons width right away', () => {
    render(<Thumbnail uri={COMMONS} width={64} style={{}} testID="photo" />);
    expect(sourceOf('photo')).toContain('/120px-Belem.jpg');
  });

  test('otherwise it waits for its layout and loads the width it is shown at', () => {
    render(<Thumbnail uri={COMMONS} style={{}} testID="photo" />);
    expect(sourceOf('photo')).not.toContain('px-Belem.jpg');
    fireEvent(screen.getByTestId('photo'), 'layout', layout(282));
    expect(sourceOf('photo')).toContain('/500px-Belem.jpg');
  });

  test('photos that are not Commons thumbnails load as they are', () => {
    render(<Thumbnail uri="https://example.org/a.jpg" style={{}} testID="photo" />);
    fireEvent(screen.getByTestId('photo'), 'layout', layout(282));
    expect(sourceOf('photo')).toContain('https://example.org/a.jpg');
  });
});

describe('small photos in lists', () => {
  beforeEach(() => jest.spyOn(PixelRatio, 'get').mockReturnValue(2));
  afterEach(() => jest.restoreAllMocks());

  test('a route stop row (64 px) loads a 120 px thumbnail, not the 960 px one', () => {
    render(<AttractionRow item={place} index={0} />);
    expect(sourceOf('attraction-row-photo')).toContain('/120px-Belem.jpg');
  });

  test('a search suggestion (40 px) loads a 120 px thumbnail', () => {
    render(
      <AttractionSearch
        items={[place]}
        cityName="Lisbon"
        query="bel"
        routeOrder={new Map()}
        onQueryChange={jest.fn()}
        onToggle={jest.fn()}
        onOpen={jest.fn()}
      />,
    );
    fireEvent(screen.getByTestId('attraction-search'), 'focus');
    expect(sourceOf('search-suggestion-photo')).toContain('/120px-Belem.jpg');
  });
});

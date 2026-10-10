import { render, screen } from '@testing-library/react-native';

import { MapView } from '@/features/map/map-view.native';
import { samePhotoMarker, type MapPoint } from '@/features/map/map-view.types';
import '@/lib/i18n';

/** Captures what the native map is given (each GeoJSON source's data) and counts marker renders. */
class MockMapSources {
  static data: Record<string, GeoJSON.FeatureCollection> = {};
  static markerRenders = 0;
}

jest.mock('@maplibre/maplibre-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Pass = ({ children }: { children?: unknown }) => children ?? null;
  return {
    Map: View,
    Camera: () => null,
    Layer: () => null,
    Marker: Pass,
    GeoJSONSource: (props: { id: string; data: GeoJSON.FeatureCollection; children?: unknown }) => {
      MockMapSources.data[props.id] = props.data;
      return props.children ?? null;
    },
  };
});
jest.mock('@/features/map/photo-marker', () => {
  const actual = jest.requireActual('@/features/map/photo-marker');
  return {
    ...actual,
    PhotoMarker: (props: object) => {
      MockMapSources.markerRenders++;
      return actual.PhotoMarker(props);
    },
  };
});

/** `n` places, most popular first, across Amsterdam. */
function places(n: number, selectedId?: string): MapPoint[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    lat: 52.37,
    lng: 4.8 + (i / n) * 0.15,
    color: '#123456',
    imageUrl: null,
    name: `Place ${i}`,
    selected: `p${i}` === selectedId,
  }));
}
const AMSTERDAM: [number, number, number, number] = [4.8, 52.3, 4.95, 52.4];

describe('samePhotoMarker (D-051)', () => {
  const [point] = places(1);

  test('a rebuilt point with the same content needs no re-render', () => {
    expect(samePhotoMarker(point!, { ...point! })).toBe(true);
  });

  test('selecting a place, numbering it as a stop or a new photo does', () => {
    expect(samePhotoMarker(point!, { ...point!, selected: true })).toBe(false);
    expect(samePhotoMarker(point!, { ...point!, order: 2 })).toBe(false);
    expect(samePhotoMarker(point!, { ...point!, imageUrl: 'https://example.org/x.jpg' })).toBe(
      false,
    );
  });
});

describe('native photo map', () => {
  const onPress = jest.fn();
  const map = (points: MapPoint[]) => (
    <MapView
      styleUrl="style.json"
      bounds={AMSTERDAM}
      points={points}
      markers="photo"
      onPointPress={onPress}
    />
  );

  test('every place is a photo marker; the dot layer stays empty (D-029)', () => {
    render(map(places(100)));
    expect(screen.getAllByTestId('photo-marker', { includeHiddenElements: true })).toHaveLength(
      100,
    );
    expect(MockMapSources.data.points?.features).toHaveLength(0);
  });

  test('a new selection re-renders the markers it changes, not all of them', () => {
    const view = render(map(places(100)));
    MockMapSources.markerRenders = 0;
    view.rerender(map(places(100, 'p7')));
    expect(MockMapSources.markerRenders).toBe(1);
  });
});

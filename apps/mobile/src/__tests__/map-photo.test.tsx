import { render, screen, userEvent } from '@testing-library/react-native';
import { PixelRatio } from 'react-native';

import type { AttractionSummary } from '@/features/destinations/api';
import { AttractionCard } from '@/features/destinations/attraction-card';
import { thumbnailUrl } from '@/features/destinations/thumbnail';
import { popupPanY } from '@/features/map/map-view.types';
import { PhotoMarker } from '@/features/map/photo-marker';
import '@/lib/i18n';

const COMMONS =
  'https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b5/Belem.jpg/960px-Belem.jpg?utm_source=x';

const place: AttractionSummary = {
  id: 'a1',
  citySlug: 'amsterdam',
  nameEn: 'Rijksmuseum',
  namePt: null,
  category: 'museum',
  lat: 52.36,
  lng: 4.885,
  popularity: 99,
  avgVisitMinutes: 90,
  imageUrl: COMMONS,
  isUnesco: false,
};

describe('thumbnailUrl', () => {
  test('asks Wikimedia Commons for a small standard thumbnail', () => {
    expect(thumbnailUrl(COMMONS, 120)).toBe(
      'https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b5/Belem.jpg/120px-Belem.jpg?utm_source=x',
    );
  });

  test('leaves other URLs and missing images alone', () => {
    expect(thumbnailUrl('https://example.org/a.jpg', 120)).toBe('https://example.org/a.jpg');
    expect(thumbnailUrl(null, 120)).toBeNull();
  });
});

describe('PhotoMarker', () => {
  afterEach(() => jest.restoreAllMocks());

  test("shows the attraction's own photo, small, in a circle", () => {
    jest.spyOn(PixelRatio, 'get').mockReturnValue(3);
    render(<PhotoMarker imageUrl={COMMONS} name="Rijksmuseum" />);
    const photo = screen.getByTestId('photo-marker-image', { includeHiddenElements: true });
    // expo-image normalises `source` to [{ uri }].
    expect(JSON.stringify(photo.props.source)).toContain('/120px-Belem.jpg');
    expect(screen.getByTestId('photo-marker', { includeHiddenElements: true })).toHaveStyle({
      width: 36,
      height: 36,
      borderRadius: 18,
      borderColor: '#FFFFFF',
    });
  });

  test('on a 2× screen a marker loads the 60 px thumbnail (~3.5 kB instead of ~8.5 kB)', () => {
    jest.spyOn(PixelRatio, 'get').mockReturnValue(2);
    render(<PhotoMarker imageUrl={COMMONS} name="Rijksmuseum" />);
    const photo = screen.getByTestId('photo-marker-image', { includeHiddenElements: true });
    expect(JSON.stringify(photo.props.source)).toContain('/60px-Belem.jpg');
  });

  test('uses the existing placeholder when the place has no photo', () => {
    render(<PhotoMarker imageUrl={null} name="Somewhere" />);
    expect(screen.queryByTestId('photo-marker-image', { includeHiddenElements: true })).toBeNull();
    expect(
      screen.getByTestId('photo-marker-image-placeholder', { includeHiddenElements: true }),
    ).toBeTruthy();
  });

  test('the selected marker is larger; a route stop shows its number', () => {
    render(<PhotoMarker imageUrl={COMMONS} name="Rijksmuseum" selected order={2} />);
    expect(screen.getByTestId('photo-marker', { includeHiddenElements: true })).toHaveStyle({
      width: 48,
      height: 48,
    });
    expect(screen.getByText('2', { includeHiddenElements: true })).toBeTruthy();
  });
});

describe('AttractionCard compact (map popup)', () => {
  test('shows photo, name, category and visit time, rating and the + button', () => {
    render(
      <AttractionCard
        compact
        item={place}
        rating={{ count: 3, average: 5 }}
        onPress={jest.fn()}
        onToggleRoute={jest.fn()}
      />,
    );
    const card = screen.getByTestId('attraction-card-a1');
    expect(card).toHaveTextContent(/Rijksmuseum/);
    expect(card).toHaveTextContent(/Museums · ~90 min/);
    expect(screen.getByTestId('card-rating')).toHaveTextContent('5.0 ★');
    expect(screen.getByLabelText('Include Rijksmuseum in the route')).toBeTruthy();
  });

  test('+ adds to the route without opening the place; the card opens it', async () => {
    const onPress = jest.fn();
    const onToggleRoute = jest.fn();
    render(<AttractionCard compact item={place} onPress={onPress} onToggleRoute={onToggleRoute} />);
    await userEvent.press(screen.getByTestId('route-checkbox'));
    expect(onToggleRoute).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
    await userEvent.press(screen.getByRole('button', { name: /Rijksmuseum/ }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('a place already in the route shows its stop number, as in the list', () => {
    render(<AttractionCard compact item={place} order={4} onToggleRoute={jest.fn()} />);
    expect(screen.getByTestId('route-checkbox')).toBeChecked();
    expect(screen.getByTestId('route-checkbox')).toHaveTextContent('4');
  });
});

describe('popupPanY', () => {
  const map = { top: 0, bottom: 800 };

  test('a popup behind the bottom controls moves up by the overlap plus a margin', () => {
    expect(popupPanY({ top: 500, bottom: 700 }, map, { bottom: 150 })).toBe(62);
  });

  test('a popup under the top overlay moves down', () => {
    expect(popupPanY({ top: 30, bottom: 230 }, map, { top: 60 })).toBe(-42);
  });

  test('a popup that fits stays put', () => {
    expect(popupPanY({ top: 200, bottom: 400 }, map, { top: 60, bottom: 150 })).toBe(0);
    expect(popupPanY({ top: 200, bottom: 400 }, map)).toBe(0);
  });
});

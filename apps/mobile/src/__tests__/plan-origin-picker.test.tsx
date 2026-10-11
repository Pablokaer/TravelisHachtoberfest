import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { LatLng } from '@wayfarer/shared';

import { fakeCity } from '@/testing/fixtures';
import { OriginPicker } from '@/features/plan/origin-picker';
import { originFromPosition } from '@/features/plan/origin-from-position';
import type { LocationSource } from '@/features/suggested/location';
import '@/lib/i18n';

jest.mock('expo-location', () => ({ Accuracy: { Balanced: 3 } }));
jest.mock('@/features/suggested/use-city-search', () => ({
  SEARCH_MIN_LETTERS: 3,
  useCitySearch: () => ({ available: false, isSearching: false, matches: [] }),
}));

const LISBON = fakeCity({
  slug: 'lisbon',
  nameEn: 'Lisbon',
  namePt: 'Lisboa',
  lat: 38.72,
  lng: -9.14,
});
const PORTO = fakeCity({ slug: 'porto', nameEn: 'Porto', namePt: 'Porto', lat: 41.15, lng: -8.61 });
const CITIES = [LISBON, PORTO];

/** A location service that answers a fixed position, or none (permission refused), or fails. */
class FakeLocation implements LocationSource {
  constructor(
    private readonly answer: LatLng | null,
    private readonly failure?: Error,
  ) {}

  async requestPosition(): Promise<LatLng | null> {
    if (this.failure) throw this.failure;
    return this.answer;
  }
}

describe('originFromPosition (the city a position starts from)', () => {
  const label = { mine: 'My location', near: (city: string) => `Near ${city}` };

  test('a position inside a covered city is that city', () => {
    const origin = originFromPosition({ lat: 38.73, lng: -9.15 }, CITIES, 'en', label);
    expect(origin.label).toBe('Lisbon');
    expect(origin).toMatchObject({ lat: 38.73, lng: -9.15 });
  });

  test('a position some way from a city says it is near it', () => {
    const origin = originFromPosition({ lat: 38.72, lng: -9.14 + 30 / 86.8 }, CITIES, 'en', label);
    expect(origin.label).toBe('Near Lisbon');
  });

  test('the name follows the language', () => {
    expect(originFromPosition({ lat: 38.72, lng: -9.14 }, CITIES, 'pt', label).label).toBe(
      'Lisboa',
    );
  });

  test('a position far from every covered city is just "My location"', () => {
    const origin = originFromPosition({ lat: 0, lng: 0 }, CITIES, 'en', label);
    expect(origin.label).toBe('My location');
  });
});

describe('OriginPicker, Use my location (feedback)', () => {
  const renderPicker = (source: LocationSource, onOrigin = jest.fn()) => {
    render(<OriginPicker origin={null} cities={CITIES} onOrigin={onOrigin} source={source} />);
    return onOrigin;
  };

  test('hands the origin up with the city the traveller is in', async () => {
    const onOrigin = renderPicker(new FakeLocation({ lat: 38.73, lng: -9.15 }));
    await userEvent.press(screen.getByRole('button', { name: 'Use my location' }));
    await waitFor(() =>
      expect(onOrigin).toHaveBeenCalledWith({ lat: 38.73, lng: -9.15, label: 'Lisbon' }),
    );
  });

  test('shows the city it found right away, before the parent re-renders', async () => {
    renderPicker(new FakeLocation({ lat: 38.73, lng: -9.15 }));
    await userEvent.press(screen.getByRole('button', { name: 'Use my location' }));
    expect(await screen.findByText('Starting from Lisbon')).toBeOnTheScreen();
  });

  test('says it is looking while it waits for the position', async () => {
    let release: (position: LatLng) => void = () => undefined;
    const slow: LocationSource = {
      requestPosition: () => new Promise<LatLng>((resolve) => (release = resolve)),
    };
    renderPicker(slow);
    await userEvent.press(screen.getByRole('button', { name: 'Use my location' }));
    expect(await screen.findByText('Finding your position…')).toBeOnTheScreen();
    release({ lat: 38.73, lng: -9.15 });
    expect(await screen.findByText('Starting from Lisbon')).toBeOnTheScreen();
    expect(screen.queryByText('Finding your position…')).toBeNull();
  });

  test('explains a refused permission and offers the search instead', async () => {
    const onOrigin = renderPicker(new FakeLocation(null));
    await userEvent.press(screen.getByRole('button', { name: 'Use my location' }));
    expect(await screen.findByText(/Location access was not allowed/)).toBeOnTheScreen();
    expect(onOrigin).not.toHaveBeenCalled();
  });

  test('explains a failing GPS with its message', async () => {
    renderPicker(new FakeLocation(null, new Error('position unavailable')));
    await userEvent.press(screen.getByRole('button', { name: 'Use my location' }));
    expect(await screen.findByText(/position unavailable/)).toBeOnTheScreen();
  });

  test('a later success clears an earlier refusal', async () => {
    const answers: (LatLng | null)[] = [null, { lat: 38.73, lng: -9.15 }];
    const source: LocationSource = { requestPosition: async () => answers.shift() ?? null };
    renderPicker(source);
    await userEvent.press(screen.getByRole('button', { name: 'Use my location' }));
    await screen.findByText(/Location access was not allowed/);
    await userEvent.press(screen.getByRole('button', { name: 'Use my location' }));
    expect(await screen.findByText('Starting from Lisbon')).toBeOnTheScreen();
    expect(screen.queryByText(/Location access was not allowed/)).toBeNull();
  });
});

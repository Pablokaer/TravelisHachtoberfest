import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import type { AttractionDetail } from '@/features/destinations/api';
import { MemoryOfflineStore } from '@/features/offline/offline-store';
import { buildOfflineTrip, OfflineTripLibrary } from '@/features/offline/offline-trip';
import { OfflineTripSection } from '@/features/offline/offline-trip-section';
import type { SaveDeps } from '@/features/offline/save-offline';
import type { TripDetail } from '@/features/trips/api';
import '@/lib/i18n';

const detail = (id: string): AttractionDetail => ({
  id,
  citySlug: 'lisbon',
  nameEn: `Place ${id}`,
  namePt: null,
  category: 'monument',
  lat: 38.7,
  lng: -9.2,
  popularity: 1,
  avgVisitMinutes: 30,
  imageUrl: null,
  isUnesco: false,
  descriptionEn: null,
  descriptionPt: null,
  imageAuthor: null,
  imageLicense: null,
  imageLicenseUrl: null,
  imagePageUrl: null,
  website: null,
  wikipediaEn: null,
  wikipediaPt: null,
  openingHours: null,
  fee: null,
  wikidataId: `Q${id}`,
  summaryEn: null,
  summaryPt: null,
  historyEn: null,
  historyPt: null,
});

const TRIP: TripDetail = {
  id: 't1',
  name: 'Old town',
  citySlug: 'lisbon',
  tripDate: null,
  distanceM: 1000,
  walkingSeconds: 800,
  visitMinutes: 60,
  stopCount: 2,
  createdAt: '2026-10-01T10:00:00Z',
  visibility: 'private',
  isOfficial: false,
  startsAt: null,
  geometry: null,
  isFallback: false,
  provider: 'osm-foot',
  stops: [detail('a'), detail('b')],
};

/** The library the section reads, and the downloads it asks for, replaced by fakes. */
class MockDevice {
  static library = new OfflineTripLibrary(new MemoryOfflineStore());
  static deps: SaveDeps;
  static failDetails = false;

  static reset() {
    MockDevice.library = new OfflineTripLibrary(new MemoryOfflineStore());
    MockDevice.failDetails = false;
    MockDevice.deps = {
      library: MockDevice.library,
      styleUrl: 'https://tiles.example/style.json',
      now: () => '2026-10-12T09:00:00Z',
      fetchDetails: async (ids) => {
        if (MockDevice.failDetails) throw new Error('no connection');
        return ids.map(detail);
      },
      images: { prefetch: async () => undefined },
      mapPacks: { download: async () => 'pack-1', remove: async () => undefined },
    };
  }
}

// Each call reaches the library of the current test: the class is defined after this hoisted mock.
jest.mock('@/features/offline/library', () => ({
  offlineLibrary: {
    get: (id: string) => MockDevice.library.get(id),
    list: () => MockDevice.library.list(),
    save: (copy: never) => MockDevice.library.save(copy),
    remove: (id: string) => MockDevice.library.remove(id),
    detailOf: (id: string) => MockDevice.library.detailOf(id),
  },
}));

jest.mock('@/features/offline/use-offline', () => {
  const real = jest.requireActual('@/features/offline/use-offline');
  return {
    ...real,
    useTripOffline: (trip: unknown) => real.useTripOffline(trip, MockDevice.deps),
  };
});

beforeEach(() => MockDevice.reset());

function renderSection(trip: TripDetail = TRIP) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<OfflineTripSection trip={trip} />, { wrapper });
}

describe('OfflineTripSection (D-092)', () => {
  test('offers to save a trip that is not on the device yet', async () => {
    renderSection();
    expect(await screen.findByText(/Keep this trip on this device/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Save for offline' })).toBeOnTheScreen();
    expect(screen.queryByTestId('offline-remove')).toBeNull();
  });

  test('saving keeps the trip and then shows when it was saved', async () => {
    renderSection();
    await userEvent.press(await screen.findByRole('button', { name: 'Save for offline' }));
    expect(await screen.findByTestId('offline-saved')).toHaveTextContent(/Saved on this device on/);
    expect((await MockDevice.library.get('t1'))?.trip.name).toBe('Old town');
    expect(screen.getByRole('button', { name: 'Update the saved copy' })).toBeOnTheScreen();
    expect(screen.getByTestId('offline-remove')).toBeOnTheScreen();
  });

  test('says whether the map of the route came with the copy', async () => {
    renderSection();
    await userEvent.press(await screen.findByRole('button', { name: 'Save for offline' }));
    expect(await screen.findByText('The map of the route is saved too.')).toBeOnTheScreen();
  });

  test('a copy that already exists is shown as saved at once', async () => {
    await MockDevice.library.save(
      buildOfflineTrip(TRIP, [detail('a'), detail('b')], '2026-10-05T09:00:00Z'),
    );
    renderSection();
    expect(await screen.findByTestId('offline-saved')).toBeOnTheScreen();
    expect(
      screen.getByText('The map of the route is not saved (map areas are saved by the phone app).'),
    ).toBeOnTheScreen();
  });

  test('removing the copy brings back the offer to save it', async () => {
    await MockDevice.library.save(
      buildOfflineTrip(TRIP, [detail('a'), detail('b')], '2026-10-12T09:00:00Z'),
    );
    renderSection();
    await userEvent.press(await screen.findByTestId('offline-remove'));
    await waitFor(async () => expect(await MockDevice.library.get('t1')).toBeNull());
    expect(await screen.findByRole('button', { name: 'Save for offline' })).toBeOnTheScreen();
  });

  test('a failure to fetch the places is said, and nothing is kept', async () => {
    MockDevice.failDetails = true;
    renderSection();
    await userEvent.press(await screen.findByRole('button', { name: 'Save for offline' }));
    expect(await screen.findByTestId('offline-error')).toHaveTextContent(/no connection/);
    expect(await MockDevice.library.list()).toEqual([]);
  });

  test('a trip shown from the device cannot be re-downloaded until the network is back', async () => {
    renderSection({ ...TRIP, fromOffline: true });
    await screen.findByText(/Keep this trip on this device/);
    expect(screen.getByTestId('offline-save')).toBeDisabled();
  });
});

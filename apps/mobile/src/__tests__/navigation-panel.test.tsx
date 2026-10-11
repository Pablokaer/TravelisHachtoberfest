import { act, render, screen, userEvent } from '@testing-library/react-native';

import type { AttractionSummary } from '@/features/destinations/api';
import { NavigationPanel } from '@/features/navigation/navigation-panel';
import { useNavigationStore } from '@/features/navigation/navigation-store';
import { NavigationLinks } from '@/features/route/components';
import '@/lib/i18n';

jest.mock('@/features/profile/api', () => ({ useProfile: () => ({ data: undefined }) }));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));

const place = (id: string, name: string, eastM: number): AttractionSummary => ({
  id,
  citySlug: 'lisbon',
  nameEn: name,
  namePt: null,
  category: 'monument',
  lat: 38.7,
  lng: -9.2 + eastM / 86_800,
  popularity: 1,
  avgVisitMinutes: 30,
  imageUrl: null,
  isUnesco: false,
});
const STOPS = [
  place('a', 'Old Gate', 0),
  place('b', 'Hill Church', 500),
  place('c', 'Castle', 1000),
];

function navigate(state: Partial<ReturnType<typeof useNavigationStore.getState>>) {
  act(() =>
    useNavigationStore.setState({
      tripId: 'trip-1',
      stops: STOPS,
      geometry: null,
      status: 'tracking',
      index: 0,
      position: null,
      offRoute: false,
      message: null,
      ...state,
    }),
  );
}

beforeEach(() => act(() => useNavigationStore.getState().stop()));

describe('NavigationPanel (D-086)', () => {
  test('shows nothing while this trip is not being navigated', () => {
    render(<NavigationPanel tripId="trip-1" stops={STOPS} />);
    expect(screen.queryByTestId('navigation-panel')).toBeNull();
  });

  test('names the next stop, its number and how far it is', () => {
    navigate({ position: { lat: 38.7, lng: -9.2 + 200 / 86_800 }, index: 1 });
    render(<NavigationPanel tripId="trip-1" stops={STOPS} />);
    expect(screen.getByText('Stop 2 of 3')).toBeOnTheScreen();
    expect(screen.getByText('Hill Church')).toBeOnTheScreen();
    expect(screen.getByTestId('navigation-away')).toHaveTextContent(/walk/);
  });

  test('the next stop opens its page without stopping the navigation', async () => {
    navigate({ index: 1 });
    const open = jest.fn();
    render(<NavigationPanel tripId="trip-1" stops={STOPS} onOpenStop={open} />);
    await userEvent.press(screen.getByRole('link', { name: 'Read about Hill Church' }));
    expect(open).toHaveBeenCalledWith('b');
    expect(useNavigationStore.getState().status).toBe('tracking');
  });

  test('the upcoming stops are listed and open their pages too', async () => {
    navigate({ index: 0 });
    const open = jest.fn();
    render(<NavigationPanel tripId="trip-1" stops={STOPS} onOpenStop={open} />);
    await userEvent.press(screen.getByRole('link', { name: 'Read about Castle' }));
    expect(open).toHaveBeenCalledWith('c');
  });

  test('waits for the first position', () => {
    navigate({ status: 'locating' });
    render(<NavigationPanel tripId="trip-1" stops={STOPS} />);
    expect(screen.getByText('Finding your position…')).toBeOnTheScreen();
  });

  test('warns when the traveller is off the route', () => {
    navigate({ offRoute: true });
    render(<NavigationPanel tripId="trip-1" stops={STOPS} />);
    expect(screen.getByText(/You are away from the route/)).toBeOnTheScreen();
  });

  test('Skip this stop moves to the next one', async () => {
    navigate({ index: 0 });
    render(<NavigationPanel tripId="trip-1" stops={STOPS} />);
    await userEvent.press(screen.getByRole('button', { name: 'Skip this stop' }));
    expect(useNavigationStore.getState().index).toBe(1);
  });

  test('says so when every stop was reached', () => {
    navigate({ status: 'finished', index: 3 });
    render(<NavigationPanel tripId="trip-1" stops={STOPS} />);
    expect(screen.getByText('You have arrived at every stop. Enjoy!')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Skip this stop' })).toBeNull();
  });

  test('explains a refused location permission', () => {
    navigate({ status: 'denied' });
    render(<NavigationPanel tripId="trip-1" stops={STOPS} />);
    expect(screen.getByText(/Allow location access to navigate/)).toBeOnTheScreen();
  });

  test('Stop navigating ends it', async () => {
    navigate({});
    render(<NavigationPanel tripId="trip-1" stops={STOPS} />);
    await userEvent.press(screen.getByRole('button', { name: 'Stop navigating' }));
    expect(useNavigationStore.getState().status).toBe('idle');
  });

  test('another trip being navigated does not show here', () => {
    navigate({ tripId: 'trip-2' });
    render(<NavigationPanel tripId="trip-1" stops={STOPS} />);
    expect(screen.queryByTestId('navigation-panel')).toBeNull();
  });
});

describe('NavigationLinks (D-086)', () => {
  test('the in-app button sits above the one that opens Google Maps', () => {
    render(
      <NavigationLinks
        stops={STOPS}
        navigation={{ active: false, onStart: jest.fn(), onStop: jest.fn() }}
      />,
    );
    const labels = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel);
    expect(labels.indexOf('Navigate in the app')).toBeGreaterThanOrEqual(0);
    expect(labels.indexOf('Navigate in the app')).toBeLessThan(
      labels.findIndex((l: string) => /Google Maps/.test(l)),
    );
  });

  test('pressing it starts the navigation', async () => {
    const onStart = jest.fn();
    render(
      <NavigationLinks stops={STOPS} navigation={{ active: false, onStart, onStop: jest.fn() }} />,
    );
    await userEvent.press(screen.getByRole('button', { name: 'Navigate in the app' }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  test('while navigating the button offers to stop', async () => {
    const onStop = jest.fn();
    render(
      <NavigationLinks stops={STOPS} navigation={{ active: true, onStart: jest.fn(), onStop }} />,
    );
    await userEvent.press(screen.getByRole('button', { name: 'Stop navigating' }));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  test('without navigation support the Google Maps button is all there is', () => {
    render(<NavigationLinks stops={STOPS} />);
    expect(screen.queryByRole('button', { name: 'Navigate in the app' })).toBeNull();
  });
});

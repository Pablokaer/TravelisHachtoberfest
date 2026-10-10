import { render, screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';

import { useStartChoice } from '@/features/start/choice-store';
import { usePlaceStore } from '@/features/suggested/place-store';
import '@/lib/i18n';

import StartScreen from '../app/start';

jest.mock('expo-router', () => ({ router: { replace: jest.fn(), push: jest.fn() } }));
jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  getForegroundPermissionsAsync: async () => ({ granted: true }),
  requestForegroundPermissionsAsync: async () => ({ granted: true }),
  getCurrentPositionAsync: async () => ({ coords: { latitude: 38.72, longitude: -9.14 } }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  useStartChoice.setState({ choice: null });
  usePlaceStore.setState({ position: null, chosenCity: null, status: 'idle' });
});

describe('StartScreen (D-079)', () => {
  test('asks where to explore with one button for the traveller’s city and one for the world', () => {
    render(<StartScreen />);
    expect(screen.getByText('Where would you like to explore?')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /My city/ })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /A city elsewhere/ })).toBeOnTheScreen();
  });

  test('My city remembers the answer, asks for the location and opens the routes near the traveller', async () => {
    render(<StartScreen />);
    await userEvent.press(screen.getByRole('button', { name: /My city/ }));
    expect(useStartChoice.getState().choice).toBe('home');
    expect(router.replace).toHaveBeenCalledWith('/suggested');
    expect(usePlaceStore.getState().position).toEqual({ lat: 38.72, lng: -9.14 });
  });

  test('A city elsewhere remembers the answer and opens the list of cities', async () => {
    render(<StartScreen />);
    await userEvent.press(screen.getByRole('button', { name: /A city elsewhere/ }));
    expect(useStartChoice.getState().choice).toBe('world');
    expect(router.replace).toHaveBeenCalledWith('/');
    expect(usePlaceStore.getState().status).toBe('idle');
  });
});

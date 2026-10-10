import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';

import '@/lib/i18n';

import PlanScreen from '../app/(tabs)/plan';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), navigate: jest.fn() } }));
jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  getForegroundPermissionsAsync: async () => ({ granted: false }),
  requestForegroundPermissionsAsync: async () => ({ granted: false }),
  getCurrentPositionAsync: async () => ({ coords: { latitude: 0, longitude: 0 } }),
}));
jest.mock('@/features/profile/api', () => ({
  useProfile: () => ({ data: undefined }),
  useSaveAvoidedCountries: () => ({ mutate: jest.fn() }),
}));
jest.mock('@/features/reviews/api', () => ({ useRatingSummary: () => ({ data: undefined }) }));
jest.mock('@/features/suggested/use-city-search', () => ({
  SEARCH_MIN_LETTERS: 3,
  useCitySearch: () => ({ available: false, isSearching: false, matches: [] }),
}));
jest.mock('@/features/destinations/api', () => ({
  ...jest.requireActual('@/features/destinations/api'),
  useCities: () => ({
    isPending: false,
    isError: false,
    data: [
      jest
        .requireActual('@/testing/fixtures')
        .fakeCity({ slug: 'lisbon', nameEn: 'Lisbon', lat: 38.72, lng: -9.14 }),
    ],
  }),
}));
jest.mock('@/features/plan/plan-data', () => ({
  ...jest.requireActual('@/features/plan/plan-data'),
  fetchPlanCities: async () => [],
}));
jest.mock('@/features/future-trips/api', () => ({
  ...jest.requireActual('@/features/future-trips/api'),
  useSaveFutureTrips: () => ({ mutate: jest.fn(), isPending: false }),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('PlanScreen (D-081)', () => {
  test('introduces the planner and starts the interview with one question at a time', async () => {
    render(<PlanScreen />);
    expect(screen.getByText('Plan your next trip')).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: 'Start' }));
    expect(screen.getByText('Question 1 of 10')).toBeOnTheScreen();
    expect(screen.getByText('Where will you travel from?')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Use my location' })).toBeOnTheScreen();
  });

  test('Next waits for an answer, then asks for the date with a calendar', async () => {
    render(<PlanScreen />);
    await userEvent.press(screen.getByRole('button', { name: 'Start' }));
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    fireEvent.changeText(screen.getByPlaceholderText('Search a city'), 'lis');
    await userEvent.press(screen.getByText('Lisbon'));
    expect(screen.getByText('Starting from Lisbon')).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Question 2 of 10')).toBeOnTheScreen();
    expect(screen.getByText('When would you like to travel?')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Choose a date' })).toBeOnTheScreen();
  });
});

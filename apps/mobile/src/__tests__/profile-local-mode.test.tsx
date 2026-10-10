import { render, screen } from '@testing-library/react-native';

import { featuresWrapper } from '@/testing/features';
import '@/lib/i18n';

import ProfileScreen from '../app/(tabs)/profile';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/features/auth/auth-provider', () => ({ useAuth: () => ({ session: null }) }));
jest.mock('@/features/auth/api', () => ({ signOut: jest.fn(), deleteAccount: jest.fn() }));
jest.mock('@/features/subscription/subscription-section', () => ({
  SubscriptionSection: () => null,
}));
jest.mock('@/features/profile/api', () => ({
  countryName: () => '',
  useProfile: () => ({ data: undefined }),
  useCountries: () => ({ data: [] }),
  useUpdatePreferences: () => ({ mutate: jest.fn() }),
}));

describe('profile in local mode (D-078)', () => {
  test('signing out is offered to an account with a login', () => {
    render(<ProfileScreen />);
    expect(screen.getByTestId('sign-out')).toBeOnTheScreen();
  });

  test('the silent account has no login to come back to, so there is no sign out', () => {
    render(<ProfileScreen />, { wrapper: featuresWrapper({ localMode: true }) });
    expect(screen.queryByTestId('sign-out')).toBeNull();
  });
});

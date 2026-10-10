import { userEvent } from '@testing-library/react-native';
import { act, renderRouter, screen } from 'expo-router/testing-library';

import i18n from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

import RootLayout from '../app/_layout';
import AuthLayout from '../app/(auth)/_layout';
import SignInScreen from '../app/(auth)/sign-in';
import SignUpScreen from '../app/(auth)/sign-up';
import WelcomeScreen from '../app/(auth)/welcome';
import AboutScreen from '../app/about';

import { cityRow } from '@/testing/fixtures';
import { queryResult } from '@/testing/test-utils';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({ data: { session: null }, error: null })),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
    },
    from: jest.fn(),
    rpc: jest.fn(),
  },
  unwrap: (r: { data: unknown }) => r.data,
  check: () => undefined,
}));

/** `city_list` as the signed-out visitor reads it: two curated cities and one that is not. */
class FakeCityList {
  static rows = [
    cityRow({ slug: 'paris', name_en: 'Paris', name_pt: 'Paris', country_code: 'FR' }),
    cityRow({ slug: 'rome', name_en: 'Rome', name_pt: 'Roma', country_code: 'IT' }),
    cityRow(),
  ];
  static install() {
    jest.mocked(supabase.from).mockImplementation(() => queryResult(FakeCityList.rows) as never);
  }
}

const routes = {
  _layout: RootLayout,
  '(tabs)/_layout': () => null,
  '(tabs)/index': () => null,
  '(auth)/_layout': AuthLayout,
  '(auth)/welcome': WelcomeScreen,
  '(auth)/sign-in': SignInScreen,
  '(auth)/sign-up': SignUpScreen,
  about: AboutScreen,
};

beforeEach(() => FakeCityList.install());

afterEach(async () => {
  jest.clearAllMocks();
  await act(() => i18n.changeLanguage('en'));
});

function openLanding() {
  renderRouter(routes, { initialUrl: '/welcome' });
}

describe('landing page (D-072)', () => {
  it('says what Travelist does in the hero', async () => {
    openLanding();
    expect(
      await screen.findByRole('header', { name: 'Turn any city into your personal travel list' }),
    ).toBeOnTheScreen();
    expect(screen.getByText('Loved by travellers worldwide')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Plan your trip in minutes' })).toBeOnTheScreen();
  });

  it('"Get started" opens sign-up', async () => {
    openLanding();
    await userEvent.press((await screen.findAllByRole('button', { name: 'Get started' }))[0]!);
    expect(await screen.findByRole('header', { name: 'Create your account' })).toBeOnTheScreen();
  });

  it('"Start exploring" opens sign-up', async () => {
    openLanding();
    await userEvent.press(await screen.findByRole('button', { name: 'Start exploring' }));
    expect(await screen.findByRole('header', { name: 'Create your account' })).toBeOnTheScreen();
  });

  it('"Log in" in the menu opens sign-in', async () => {
    openLanding();
    await userEvent.press(await screen.findByRole('button', { name: 'Open menu' }));
    await userEvent.press(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('header', { name: 'Welcome back' })).toBeOnTheScreen();
  });

  it('shows the curated cities the database has, from city_list', async () => {
    openLanding();
    expect(await screen.findByTestId('destination-paris')).toBeOnTheScreen();
    expect(screen.getByTestId('destination-rome')).toBeOnTheScreen();
    expect(screen.queryByTestId('destination-amsterdam')).toBeNull();
    expect(supabase.from).toHaveBeenCalledWith('city_list');
  });

  it('a destination card leads to sign-up', async () => {
    openLanding();
    await userEvent.press(await screen.findByTestId('destination-paris'));
    expect(await screen.findByRole('header', { name: 'Create your account' })).toBeOnTheScreen();
  });

  it('"View all cities" lists every covered city', async () => {
    openLanding();
    await userEvent.press(await screen.findByRole('button', { name: 'View all 3 cities' }));
    expect(await screen.findByText(/Amsterdam/)).toBeOnTheScreen();
  });

  it('the footer links to About', async () => {
    openLanding();
    await userEvent.press(await screen.findByRole('link', { name: 'About' }));
    expect(await screen.findByText(/OpenStreetMap contributors/)).toBeOnTheScreen();
  });

  it('credits every bundled photo and the map in the footer', async () => {
    openLanding();
    expect(await screen.findByText(/Jakub Hałun \(CC BY 4\.0\)/)).toBeOnTheScreen();
    expect(screen.getByText(/Akonnchiroll \(CC BY-SA 4\.0\)/)).toBeOnTheScreen();
    expect(screen.getByText(/OpenStreetMap contributors/)).toBeOnTheScreen();
  });

  it('switches to Portuguese', async () => {
    openLanding();
    await userEvent.press(await screen.findByRole('checkbox', { name: 'Português' }));
    expect(
      await screen.findByRole('header', {
        name: 'Transforme qualquer cidade na sua lista de viagem pessoal',
      }),
    ).toBeOnTheScreen();
  });
});

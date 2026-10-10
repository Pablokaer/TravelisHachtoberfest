import { render, screen, userEvent } from '@testing-library/react-native';
import type { ChecklistRequest } from '@wayfarer/shared';
import { router } from 'expo-router';

import { checklistRequest } from '@/features/checklist/use-city-checklist';
import { BeforeYouGoSection } from '@/features/checklist/before-you-go-section';
import '@/lib/i18n';
import { layOutAsIPhone } from '@/testing/phone-width';

/** What the profile and checklist hooks return, and the requests the section made. */
class MockChecklistServer {
  static nationalities = ['BR'];
  static state: 'pending' | 'error' | 'ok' = 'ok';
  static requests: (ChecklistRequest | null)[] = [];
  static refetch = jest.fn();

  static reset() {
    MockChecklistServer.nationalities = ['BR'];
    MockChecklistServer.state = 'ok';
    MockChecklistServer.requests = [];
    MockChecklistServer.refetch = jest.fn();
  }
}

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/features/profile/api', () => ({
  useProfile: () => ({
    isPending: false,
    data: {
      nationalities: MockChecklistServer.nationalities,
      homeCountry: 'BR',
      passportExpiry: null,
      units: 'metric',
    },
  }),
}));
jest.mock('@/features/checklist/api', () => ({
  useChecklist: (request: ChecklistRequest | null) => {
    MockChecklistServer.requests.push(request);
    const state = MockChecklistServer.state;
    return {
      isPending: state === 'pending',
      isError: state === 'error',
      data: state === 'ok' ? { visa: {}, weather: {} } : undefined,
      refetch: MockChecklistServer.refetch,
    };
  },
}));
// The section cards have their own tests; here they only need to be placed.
jest.mock('@/features/checklist/sections', () => {
  const { Text: MockText } = jest.requireActual('react-native');
  const section = (name: string) => {
    const MockSection = () => <MockText>{name} section</MockText>;
    MockSection.displayName = `Mock${name}Section`;
    return MockSection;
  };
  return {
    VisaSection: section('Visa'),
    PassportSection: section('Passport'),
    WeatherSection: section('Weather'),
    PowerSection: section('Power'),
    MoneySection: section('Money'),
    SafetySection: section('Safety'),
    PracticalSection: section('Practical'),
  };
});

beforeEach(() => {
  MockChecklistServer.reset();
  jest.mocked(router.push).mockClear();
});

describe('checklistRequest', () => {
  const profile = { nationalities: ['BR'], homeCountry: 'BR', passportExpiry: null };

  test('builds the Before you go request from the profile and the dates', () => {
    expect(
      checklistRequest('lisbon', profile, { arrival: '2026-10-01', departure: null }, 'pt'),
    ).toEqual({
      city: 'lisbon',
      nationalities: ['BR'],
      homeCountry: 'BR',
      passportExpiry: null,
      arrival: '2026-10-01',
      departure: null,
      language: 'pt',
    });
  });

  test('needs a profile with at least one passport', () => {
    const dates = { arrival: '2026-10-01', departure: null };
    expect(checklistRequest('lisbon', undefined, dates, 'en')).toBeNull();
    expect(checklistRequest('lisbon', { ...profile, nationalities: [] }, dates, 'en')).toBeNull();
  });
});

describe('BeforeYouGoSection', () => {
  test('shows every Before you go section for a trip starting today', () => {
    render(<BeforeYouGoSection citySlug="lisbon" />);
    expect(screen.getByText('Before you go')).toBeOnTheScreen();
    for (const name of ['Visa', 'Passport', 'Weather', 'Power', 'Money', 'Safety', 'Practical'])
      expect(screen.getByText(`${name} section`)).toBeOnTheScreen();
    expect(MockChecklistServer.requests.at(-1)?.city).toBe('lisbon');
  });

  test('"Choose your dates" opens the full Before you go page of the city', async () => {
    render(<BeforeYouGoSection citySlug="lisbon" />);
    await userEvent.press(screen.getByRole('button', { name: 'Choose your dates' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/checklist/[city]',
      params: { city: 'lisbon' },
    });
  });

  test('without a passport in the profile, it asks for one instead', () => {
    MockChecklistServer.nationalities = [];
    render(<BeforeYouGoSection citySlug="lisbon" />);
    expect(screen.getByRole('button', { name: 'Edit profile' })).toBeOnTheScreen();
    expect(screen.queryByText('Visa section')).toBeNull();
  });

  test('a failed checklist keeps the page and offers a retry', async () => {
    MockChecklistServer.state = 'error';
    render(<BeforeYouGoSection citySlug="lisbon" />);
    expect(screen.getByText('Before you go')).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: /try again/i }));
    expect(MockChecklistServer.refetch).toHaveBeenCalled();
  });
});

// iPhone audit (D-076): under the centred "Before you go" title, its intro is centred too.
describe('BeforeYouGoSection on a phone', () => {
  layOutAsIPhone();

  test('centres the intro under the title', () => {
    render(<BeforeYouGoSection citySlug="lisbon" />);
    expect(screen.getByText(/For a trip starting today/)).toHaveStyle({ textAlign: 'center' });
  });
});

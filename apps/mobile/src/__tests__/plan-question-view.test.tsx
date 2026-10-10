import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';

import type { PlanQuestion } from '@/features/plan/plan-flow';
import { PlanQuestionView } from '@/features/plan/plan-question-view';
import '@/lib/i18n';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  getForegroundPermissionsAsync: async () => ({ granted: false }),
  requestForegroundPermissionsAsync: async () => ({ granted: false }),
  getCurrentPositionAsync: async () => ({ coords: { latitude: 0, longitude: 0 } }),
}));
jest.mock('@/features/suggested/use-city-search', () => ({
  SEARCH_MIN_LETTERS: 3,
  useCitySearch: () => ({ available: false, isSearching: false, matches: [] }),
}));

const avoid: PlanQuestion = {
  id: 'avoid',
  kind: 'countries',
  text: 'Are there countries you do not want as options?',
  options: [
    { value: 'IT', label: 'Italy' },
    { value: 'MT', label: 'Malta' },
  ],
  allowOther: true,
  source: 'core',
};

function renderAvoid(over: Partial<Parameters<typeof PlanQuestionView>[0]> = {}) {
  const props = {
    question: avoid,
    answer: undefined,
    onAnswer: jest.fn(),
    origin: null,
    onOrigin: jest.fn(),
    cities: [],
    today: '2026-10-11',
    remember: false,
    onRemember: jest.fn(),
    ...over,
  };
  render(<PlanQuestionView {...props} />);
  return props;
}

describe('PlanQuestionView, countries to avoid (D-082)', () => {
  test('picking a country answers the question with its code', async () => {
    const props = renderAvoid();
    fireEvent.changeText(screen.getByPlaceholderText('Search a country'), 'mal');
    await userEvent.press(screen.getByRole('checkbox', { name: 'Malta' }));
    expect(props.onAnswer).toHaveBeenCalledWith({ values: ['MT'], other: '' });
  });

  test('the countries can be remembered in the profile, with a box to type more', async () => {
    const props = renderAvoid({ answer: { values: ['IT'], other: '' } });
    expect(screen.getByRole('button', { name: 'Italy' })).toBeOnTheScreen();
    expect(screen.getByTestId('plan-other')).toBeOnTheScreen();
    await userEvent.press(
      screen.getByRole('checkbox', { name: 'Remember these countries in my profile' }),
    );
    expect(props.onRemember).toHaveBeenCalledWith(true);
  });
});

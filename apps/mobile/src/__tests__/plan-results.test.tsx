import { render, screen, userEvent } from '@testing-library/react-native';
import type { ScoredDestination } from '@wayfarer/shared';

import type { Proposal } from '@/features/plan/plan-flow';
import { PlanResults } from '@/features/plan/plan-results';
import { fakeCity } from '@/testing/fixtures';
import '@/lib/i18n';

jest.mock('@/features/profile/api', () => ({ useProfile: () => ({ data: undefined }) }));

const destination = (slug: string, distanceKm: number): ScoredDestination => ({
  slug,
  lat: 0,
  lng: 0,
  countryCode: 'XX',
  climate: { tempMeanC: 24.4, tempMaxC: 29, precipMm: 31.6, snowfallCm: 0, sunshineHours: 9.2 },
  facts: null,
  profile: null,
  distanceKm,
  score: 1,
  weatherScore: 1,
  interestScore: 1,
});

const cities = [
  fakeCity({ slug: 'rio', nameEn: 'Rio de Janeiro' }),
  fakeCity({ slug: 'lima', nameEn: 'Lima' }),
];
const proposals: Proposal[] = [
  { destination: destination('rio', 357.2), reason: 'Warm beaches in December.', byModel: true },
  { destination: destination('lima', 3490), reason: null, byModel: false },
];

describe('PlanResults (D-081)', () => {
  test('each destination shows why it fits, how far it is and its climate that month', () => {
    render(
      <PlanResults proposals={proposals} cities={cities} relaxed={false} onSave={jest.fn()} />,
    );
    expect(screen.getByText('Rio de Janeiro')).toBeOnTheScreen();
    expect(screen.getByText('Warm beaches in December.')).toBeOnTheScreen();
    expect(screen.getByText('357 km away')).toBeOnTheScreen();
    expect(screen.getAllByText('24 °C · 9.2 h of sun a day · 32 mm of rain')).toHaveLength(2);
    expect(screen.getByText('Chosen by the local AI')).toBeOnTheScreen();
  });

  test('without the model it says how the places were ranked', () => {
    render(
      <PlanResults
        proposals={[proposals[1]!]}
        cities={cities}
        relaxed={false}
        onSave={jest.fn()}
      />,
    );
    expect(screen.getByText(/The local AI is not running/)).toBeOnTheScreen();
  });

  test('says when the weather had to be relaxed to find enough places', () => {
    render(<PlanResults proposals={proposals} cities={cities} relaxed onSave={jest.fn()} />);
    expect(screen.getByText(/closest fits/)).toBeOnTheScreen();
  });

  test('the places that tempt are selected and saved together with the reason', async () => {
    const onSave = jest.fn();
    render(<PlanResults proposals={proposals} cities={cities} relaxed={false} onSave={onSave} />);
    expect(screen.getByRole('button', { name: 'Save 0 to Future trips' })).toBeDisabled();
    await userEvent.press(screen.getByRole('checkbox', { name: 'Select Rio de Janeiro' }));
    await userEvent.press(screen.getByRole('checkbox', { name: 'Select Lima' }));
    await userEvent.press(screen.getByRole('checkbox', { name: 'Rio de Janeiro selected' }));
    await userEvent.press(screen.getByRole('button', { name: 'Save 1 to Future trips' }));
    expect(onSave).toHaveBeenCalledWith([{ slug: 'lima', reason: null }]);
  });

  test('with no proposals it suggests relaxing the answers and starting over', async () => {
    const onRestart = jest.fn();
    render(
      <PlanResults
        proposals={[]}
        cities={cities}
        relaxed={false}
        onSave={jest.fn()}
        onRestart={onRestart}
      />,
    );
    expect(screen.getByText('No city fits all your answers')).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: 'Start over' }));
    expect(onRestart).toHaveBeenCalled();
  });
});

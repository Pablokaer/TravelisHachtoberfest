import { render, screen, userEvent } from '@testing-library/react-native';

import { AvoidedCountriesSection } from '@/features/profile/avoided-countries-section';
import '@/lib/i18n';

const nameOf = (code: string) => ({ MT: 'Malta', IT: 'Italy' })[code] ?? code;

describe('AvoidedCountriesSection (D-082)', () => {
  test('lists the countries the traveller never wants proposed', () => {
    render(<AvoidedCountriesSection codes={['MT', 'IT']} nameOf={nameOf} onChange={jest.fn()} />);
    expect(screen.getByText('Countries I do not want to visit')).toBeOnTheScreen();
    expect(screen.getByText('Malta')).toBeOnTheScreen();
    expect(screen.getByText('Italy')).toBeOnTheScreen();
  });

  test('a country can be taken off the list from the profile', async () => {
    const onChange = jest.fn();
    render(<AvoidedCountriesSection codes={['MT', 'IT']} nameOf={nameOf} onChange={onChange} />);
    await userEvent.press(screen.getByRole('button', { name: 'Stop avoiding Malta' }));
    expect(onChange).toHaveBeenCalledWith(['IT']);
  });

  test('says how to add some when there are none', () => {
    render(<AvoidedCountriesSection codes={[]} nameOf={nameOf} onChange={jest.fn()} />);
    expect(screen.getByText(/None yet/)).toBeOnTheScreen();
  });
});

import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';

import { CountryPicker } from '@/features/plan/country-picker';
import '@/lib/i18n';

const COUNTRIES = [
  { code: 'IT', name: 'Italy' },
  { code: 'MT', name: 'Malta' },
  { code: 'CI', name: "Côte d'Ivoire" },
  { code: 'NO', name: 'Norway' },
];

describe('CountryPicker (D-082)', () => {
  test('says that no country is ruled out until one is picked', () => {
    render(<CountryPicker countries={COUNTRIES} selected={[]} onChange={jest.fn()} />);
    expect(screen.getByText('No country ruled out')).toBeOnTheScreen();
  });

  test('typing finds a country, ignoring case and accents, and picking it adds it', async () => {
    const onChange = jest.fn();
    render(<CountryPicker countries={COUNTRIES} selected={['NO']} onChange={onChange} />);
    fireEvent.changeText(screen.getByPlaceholderText('Search a country'), 'cote');
    await userEvent.press(screen.getByRole('checkbox', { name: "Côte d'Ivoire" }));
    expect(onChange).toHaveBeenCalledWith(['NO', 'CI']);
  });

  test('the chosen countries are listed and each can be taken out', async () => {
    const onChange = jest.fn();
    render(<CountryPicker countries={COUNTRIES} selected={['MT', 'IT']} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Malta' })).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: 'Malta' }));
    expect(onChange).toHaveBeenCalledWith(['IT']);
  });

  test('a search with no match says so', () => {
    render(<CountryPicker countries={COUNTRIES} selected={[]} onChange={jest.fn()} />);
    fireEvent.changeText(screen.getByPlaceholderText('Search a country'), 'zzz');
    expect(screen.getByText('No city found for “zzz”.')).toBeOnTheScreen();
  });
});

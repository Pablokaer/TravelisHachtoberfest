import { render, screen } from '@testing-library/react-native';

import { PowerSection } from '@/features/checklist/sections';
import '@/lib/i18n';

jest.mock('@/lib/supabase', () => ({ supabase: {}, unwrap: jest.fn(), check: jest.fn() }));
jest.mock('@/features/profile/api', () => ({
  useCountries: () => ({ data: [] }),
  countryName: () => '',
}));

test('power section shows an illustration and name for every plug type', () => {
  render(
    <PowerSection
      data={{
        status: 'ok',
        destinationPlugs: ['G', 'C'],
        destinationVoltage: 230,
        destinationFrequencyHz: 50,
        homePlugs: ['N'],
        adapterNeeded: true,
        voltageDiffers: false,
        homeVoltage: 127,
      }}
    />,
  );
  for (const type of ['G', 'C', 'N']) {
    expect(screen.getByTestId(`plug-icon-${type}`)).toBeTruthy();
    expect(screen.getByLabelText(`Type ${type}`)).toBeTruthy();
  }
});

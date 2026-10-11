import { render, screen, userEvent, within } from '@testing-library/react-native';
import type { CityPrices } from '@wayfarer/shared';

import { cityPricesFromRow, type CityPriceEstimate } from '@/features/prices/api';
import { BudgetCard } from '@/features/prices/budget-card';
import { CityPricesSection } from '@/features/prices/city-prices-section';
import { StepSlider } from '@/features/prices/step-slider';
import '@/lib/i18n';

jest.mock('@/features/profile/api', () => ({ useProfile: () => ({ data: undefined }) }));

/** What the prices query returns for the city in each test. */
class MockPricesServer {
  static estimate: CityPriceEstimate | null = null;
}
jest.mock('@/features/prices/api', () => ({
  ...jest.requireActual('@/features/prices/api'),
  useCityPrices: () => ({
    isPending: false,
    isError: false,
    data: MockPricesServer.estimate,
  }),
}));

const PRICES: CityPrices = {
  beer: 4,
  softDrink: 2,
  cocktail: 9,
  coffee: 3,
  mealCheap: 10,
  mealMid: 22,
  localDish: 14,
  bigMac: 6.32,
  transportTicket: 1.6,
  taxi5km: 9.27,
};
const ESTIMATE: CityPriceEstimate = {
  prices: PRICES,
  currency: 'EUR',
  priceLevel: 0.65,
  bigMacIsReal: true,
  retrievedOn: '2026-10-11',
};

beforeEach(() => {
  MockPricesServer.estimate = ESTIMATE;
});

describe('cityPricesFromRow (D-088)', () => {
  test('maps a database row to an estimate', () => {
    const estimate = cityPricesFromRow({
      city_slug: 'lisbon',
      currency: 'EUR',
      price_level: 0.65,
      big_mac_is_real: true,
      beer: 4.06,
      soft_drink: 1.74,
      cocktail: 8.5,
      coffee: 2.9,
      meal_cheap: 9.85,
      meal_mid: 22.02,
      local_dish: 14.3,
      big_mac: 6.32,
      transport_ticket: 1.6,
      taxi_5km: 9.27,
      retrieved_on: '2026-10-11',
    });
    expect(estimate.prices.softDrink).toBe(1.74);
    expect(estimate.prices.taxi5km).toBe(9.27);
    expect(estimate).toMatchObject({ currency: 'EUR', priceLevel: 0.65, bigMacIsReal: true });
  });
});

describe('StepSlider', () => {
  test('shows its value and moves one step at a time with the keyboard actions', async () => {
    const onChange = jest.fn();
    render(<StepSlider label="Meals" value={2} max={6} onChange={onChange} />);
    const slider = screen.getByRole('adjustable', { name: 'Meals' });
    expect(slider).toHaveAccessibilityValue({ min: 0, max: 6, now: 2 });
    slider.props.onAccessibilityAction?.({ nativeEvent: { actionName: 'increment' } });
    expect(onChange).toHaveBeenCalledWith(3);
    slider.props.onAccessibilityAction?.({ nativeEvent: { actionName: 'decrement' } });
    expect(onChange).toHaveBeenCalledWith(1);
  });

  test('never goes below 0 or above its maximum', () => {
    const onChange = jest.fn();
    render(<StepSlider label="Meals" value={0} max={6} onChange={onChange} />);
    screen
      .getByRole('adjustable', { name: 'Meals' })
      .props.onAccessibilityAction?.({ nativeEvent: { actionName: 'decrement' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  test('pressing a step sets that value', async () => {
    const onChange = jest.fn();
    render(<StepSlider label="Meals" value={1} max={6} onChange={onChange} />);
    await userEvent.press(screen.getByTestId('step-Meals-4'));
    expect(onChange).toHaveBeenCalledWith(4);
  });
});

describe('BudgetCard (D-088)', () => {
  test('starts from a day of three meals and two drinks and totals it', () => {
    render(<BudgetCard estimate={ESTIMATE} />);
    // 3 budget meals (10) + 2 beers (4): 38
    expect(screen.getByTestId('budget-total')).toHaveTextContent(/About €38 a day/);
  });

  test('more meals and drinks raise the total', async () => {
    render(<BudgetCard estimate={ESTIMATE} />);
    await userEvent.press(screen.getByTestId('step-Meals per day-4'));
    await userEvent.press(screen.getByTestId('step-Drinks per day-5'));
    // 4 × 10 + 5 × 4 = 60
    expect(screen.getByTestId('budget-total')).toHaveTextContent(/About €60 a day/);
  });

  test('the meal style and the kind of drink change the price', async () => {
    render(<BudgetCard estimate={ESTIMATE} />);
    await userEvent.press(screen.getByRole('checkbox', { name: 'Restaurant' }));
    await userEvent.press(screen.getByRole('checkbox', { name: 'Cocktail' }));
    // 3 × 22 + 2 × 9 = 84
    expect(screen.getByTestId('budget-total')).toHaveTextContent(/About €84 a day/);
  });

  test('says what the total is made of', () => {
    render(<BudgetCard estimate={ESTIMATE} />);
    expect(screen.getByTestId('budget-breakdown')).toHaveTextContent(/Meals €30/);
    expect(screen.getByTestId('budget-breakdown')).toHaveTextContent(/Drinks €8/);
  });
});

describe('CityPricesSection (D-088)', () => {
  test('lists the everyday prices, marked as an estimate', () => {
    render(<CityPricesSection citySlug="lisbon" cityName="Lisbon" />);
    const section = screen.getByTestId('city-prices');
    expect(within(section).getByText(/Estimated prices/)).toBeOnTheScreen();
    expect(within(section).getByTestId('price-beer')).toHaveTextContent(/^€4$/);
    expect(within(section).getByTestId('price-softDrink')).toHaveTextContent(/^€2$/);
    expect(within(section).getByTestId('price-bigMac')).toHaveTextContent(/^€6\.32/);
    expect(within(section).getByTestId('price-taxi5km')).toHaveTextContent(/^€9\.27$/);
  });

  test('says how the estimate was made', () => {
    render(<CityPricesSection citySlug="lisbon" cityName="Lisbon" />);
    expect(screen.getByText(/modelled/i)).toBeOnTheScreen();
  });

  test('marks a Big Mac price that comes from the index', () => {
    render(<CityPricesSection citySlug="lisbon" cityName="Lisbon" />);
    expect(screen.getByTestId('price-bigMac')).toHaveTextContent(/Big Mac index/);
  });

  test('does not claim the index for a modelled Big Mac price', () => {
    MockPricesServer.estimate = { ...ESTIMATE, bigMacIsReal: false };
    render(<CityPricesSection citySlug="lisbon" cityName="Lisbon" />);
    expect(screen.getByTestId('price-bigMac')).not.toHaveTextContent(/Big Mac index/);
  });

  test('has no section for a city without an estimate', () => {
    MockPricesServer.estimate = null;
    render(<CityPricesSection citySlug="nowhere" cityName="Nowhere" />);
    expect(screen.queryByTestId('city-prices')).toBeNull();
  });
});

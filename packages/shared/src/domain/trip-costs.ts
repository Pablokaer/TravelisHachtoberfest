// What a day of eating and drinking costs in a city (D-088), from its estimated prices. The prices
// are modelled (see the data pipeline's `prices` module); this only adds them up.

/** Estimated prices of everyday things in a city, in one currency (euros today). */
export type CityPrices = {
  /** 0.5 L beer in a bar or restaurant. */
  beer: number;
  /** 0.33 L Coca-Cola in a restaurant. */
  softDrink: number;
  cocktail: number;
  /** A cappuccino. */
  coffee: number;
  /** A meal at an inexpensive restaurant, one person. */
  mealCheap: number;
  /** A three-course meal at a mid-range restaurant, one person. */
  mealMid: number;
  /** A typical local dish in an ordinary restaurant. */
  localDish: number;
  /** McDonald's Big Mac. */
  bigMac: number;
  /** One-way ticket on local public transport. */
  transportTicket: number;
  /** A taxi or ride-hailing trip of about 5 km. */
  taxi5km: number;
};

export type MealStyle = 'budget' | 'restaurant' | 'local';
export type DrinkKind = 'beer' | 'softDrink' | 'cocktail' | 'coffee';

export type DayPlan = {
  meals: number;
  drinks: number;
  mealStyle: MealStyle;
  drinkKind: DrinkKind;
};

/** Most meals and drinks the sliders offer in a day. */
export const MAX_MEALS = 6;
export const MAX_DRINKS = 10;

const MEAL_ITEM = { budget: 'mealCheap', restaurant: 'mealMid', local: 'localDish' } as const;

const cents = (amount: number) => Math.round(amount * 100) / 100;

/**
 * A whole number from 0 to `max`; anything else (a stale value, NaN) becomes the nearest bound.
 * @example clampCount(2.6, MAX_DRINKS) // 3
 */
export function clampCount(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(0, Math.round(value)));
}

/**
 * What the meals and the drinks of one day add up to.
 * @example dailyCost(prices, { meals: 3, drinks: 2, mealStyle: 'budget', drinkKind: 'beer' }).total
 */
export function dailyCost(
  prices: CityPrices,
  plan: DayPlan,
): { meals: number; drinks: number; total: number } {
  const meals = cents(clampCount(plan.meals, MAX_MEALS) * prices[MEAL_ITEM[plan.mealStyle]]);
  const drinks = cents(clampCount(plan.drinks, MAX_DRINKS) * prices[plan.drinkKind]);
  return { meals, drinks, total: cents(meals + drinks) };
}

/**
 * A typical day for a visitor, to compare cities at a glance: two cheap meals, one mid-range
 * meal and two beers.
 * @example typicalDayCost(prices) // 50
 */
export function typicalDayCost(prices: CityPrices): number {
  return cents(2 * prices.mealCheap + prices.mealMid + 2 * prices.beer);
}

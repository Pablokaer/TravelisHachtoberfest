import { describe, expect, it } from 'vitest';

import {
  clampCount,
  dailyCost,
  MAX_DRINKS,
  MAX_MEALS,
  typicalDayCost,
  type CityPrices,
} from './trip-costs.ts';

const PRICES: CityPrices = {
  beer: 4,
  softDrink: 2,
  cocktail: 9,
  coffee: 3,
  mealCheap: 10,
  mealMid: 22,
  localDish: 14,
  bigMac: 6,
  transportTicket: 1.6,
  taxi5km: 9,
};

describe('dailyCost', () => {
  it('adds the meals and the drinks of the day', () => {
    const cost = dailyCost(PRICES, { meals: 3, drinks: 2, mealStyle: 'budget', drinkKind: 'beer' });
    expect(cost).toEqual({ meals: 30, drinks: 8, total: 38 });
  });

  it('prices each meal style and drink kind with its own item', () => {
    const base = { meals: 1, drinks: 1 } as const;
    expect(dailyCost(PRICES, { ...base, mealStyle: 'restaurant', drinkKind: 'cocktail' })).toEqual({
      meals: 22,
      drinks: 9,
      total: 31,
    });
    expect(dailyCost(PRICES, { ...base, mealStyle: 'local', drinkKind: 'softDrink' }).meals).toBe(
      14,
    );
    expect(dailyCost(PRICES, { ...base, mealStyle: 'budget', drinkKind: 'coffee' }).drinks).toBe(3);
  });

  it('is zero for no meals and no drinks', () => {
    expect(
      dailyCost(PRICES, { meals: 0, drinks: 0, mealStyle: 'budget', drinkKind: 'beer' }).total,
    ).toBe(0);
  });

  it('rounds to cents, not to floating-point noise', () => {
    const prices = { ...PRICES, beer: 3.33 };
    expect(
      dailyCost(prices, { meals: 0, drinks: 3, mealStyle: 'budget', drinkKind: 'beer' }).total,
    ).toBe(9.99);
  });

  it('keeps the counts inside the sliders, so a stale value cannot overcharge', () => {
    const cost = dailyCost(PRICES, {
      meals: 99,
      drinks: -4,
      mealStyle: 'budget',
      drinkKind: 'beer',
    });
    expect(cost.meals).toBe(MAX_MEALS * 10);
    expect(cost.drinks).toBe(0);
  });
});

describe('clampCount', () => {
  it('is a whole number from 0 to the maximum', () => {
    expect(clampCount(2.6, MAX_DRINKS)).toBe(3);
    expect(clampCount(-1, MAX_DRINKS)).toBe(0);
    expect(clampCount(50, MAX_DRINKS)).toBe(MAX_DRINKS);
    expect(clampCount(Number.NaN, MAX_DRINKS)).toBe(0);
  });
});

describe('typicalDayCost', () => {
  it('is two cheap meals, one mid-range meal and two beers', () => {
    expect(typicalDayCost(PRICES)).toBe(2 * 10 + 22 + 2 * 4);
  });
});

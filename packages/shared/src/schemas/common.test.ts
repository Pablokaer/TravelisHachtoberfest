import { describe, expect, it } from 'vitest';

import { countryCodeSchema, isoDateSchema, latLngSchema } from './common.ts';

describe('common schemas', () => {
  it('accepts uppercase ISO alpha-2 country codes only', () => {
    expect(countryCodeSchema.safeParse('PT').success).toBe(true);
    expect(countryCodeSchema.safeParse('pt').success).toBe(false);
    expect(countryCodeSchema.safeParse('PRT').success).toBe(false);
  });

  it('validates ISO dates', () => {
    expect(isoDateSchema.safeParse('2026-10-01').success).toBe(true);
    expect(isoDateSchema.safeParse('01/10/2026').success).toBe(false);
  });

  it('bounds coordinates', () => {
    expect(latLngSchema.safeParse({ lat: 38.7, lng: -9.1 }).success).toBe(true);
    expect(latLngSchema.safeParse({ lat: 91, lng: 0 }).success).toBe(false);
  });
});

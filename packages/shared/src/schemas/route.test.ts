import { describe, expect, it } from 'vitest';

import { routeRequestSchema } from './route.ts';

const stop = (i: number) => ({ id: `s${i}`, lat: 38.7, lng: -9.2 + i / 1000, visitMinutes: 30 });

describe('routeRequestSchema', () => {
  it('accepts 2 to 20 stops', () => {
    expect(routeRequestSchema.safeParse({ stops: [stop(0), stop(1)] }).success).toBe(true);
    const twenty = Array.from({ length: 20 }, (_, i) => stop(i));
    expect(routeRequestSchema.safeParse({ stops: twenty }).success).toBe(true);
  });

  it('rejects more than 20 stops', () => {
    const many = Array.from({ length: 21 }, (_, i) => stop(i));
    expect(routeRequestSchema.safeParse({ stops: many }).success).toBe(false);
  });

  it('still needs two distinct stops', () => {
    expect(routeRequestSchema.safeParse({ stops: [stop(0)] }).success).toBe(false);
    expect(routeRequestSchema.safeParse({ stops: [stop(0), stop(0)] }).success).toBe(false);
  });
});

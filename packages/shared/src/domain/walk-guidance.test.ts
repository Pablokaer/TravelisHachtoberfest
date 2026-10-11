import { describe, expect, it } from 'vitest';

import type { LineString } from '../schemas/route.ts';
import {
  ARRIVAL_RADIUS_M,
  distanceToLineM,
  guidanceTo,
  isOffRoute,
  OFF_ROUTE_M,
  stopAfterArrival,
} from './walk-guidance.ts';

/** A point `eastM` metres east and `northM` north of a spot in Lisbon. */
const near = (eastM: number, northM = 0) => ({
  lat: 38.7 + northM / 111_200,
  lng: -9.2 + eastM / 86_800,
});
const stopAt = (id: string, eastM: number) => ({ id, ...near(eastM) });

/** A street running east from the origin for 1 km. */
const street: LineString = {
  type: 'LineString',
  coordinates: [
    [near(0).lng, near(0).lat],
    [near(1000).lng, near(1000).lat],
  ],
};

describe('distanceToLineM', () => {
  it('is the perpendicular distance to the middle of a segment', () => {
    expect(distanceToLineM(near(500, 30), street)).toBeCloseTo(30, 0);
  });

  it('is the distance to the nearest end beyond a segment', () => {
    expect(distanceToLineM(near(1100, 0), street)).toBeCloseTo(100, 0);
  });

  it('is zero on the line', () => {
    expect(distanceToLineM(near(250), street)).toBeCloseTo(0, 0);
  });

  it('is Infinity for a line without points', () => {
    expect(distanceToLineM(near(0), { type: 'LineString', coordinates: [] })).toBe(Infinity);
  });
});

describe('isOffRoute', () => {
  it('is false within the threshold and true beyond it', () => {
    expect(isOffRoute(near(500, OFF_ROUTE_M - 15), street)).toBe(false);
    expect(isOffRoute(near(500, OFF_ROUTE_M + 15), street)).toBe(true);
  });

  it('is false when there is no line to be off (the straight-line fallback has none)', () => {
    expect(isOffRoute(near(500, 900), null)).toBe(false);
  });
});

describe('stopAfterArrival', () => {
  const stops = [stopAt('a', 0), stopAt('b', 500), stopAt('c', 1000)];

  it('stays on the stop while the traveller is farther than the arrival radius', () => {
    expect(stopAfterArrival(near(ARRIVAL_RADIUS_M + 20), stops, 0)).toBe(0);
  });

  it('moves on to the next stop on arriving at the current one', () => {
    expect(stopAfterArrival(near(ARRIVAL_RADIUS_M - 10), stops, 0)).toBe(1);
  });

  it('skips every stop the traveller is already at, in order', () => {
    const together = [stopAt('a', 0), stopAt('b', 5), stopAt('c', 1000)];
    expect(stopAfterArrival(near(0), together, 0)).toBe(2);
  });

  it('is the number of stops once the last one is reached', () => {
    expect(stopAfterArrival(near(1000), stops, 2)).toBe(3);
  });

  it('never goes back, and an index past the end stays there', () => {
    expect(stopAfterArrival(near(0), stops, 1)).toBe(1);
    expect(stopAfterArrival(near(0), stops, 3)).toBe(3);
  });
});

describe('guidanceTo', () => {
  it('gives the straight-line metres and an estimate of the walk', () => {
    const { distanceM, walkingSeconds } = guidanceTo(near(0), stopAt('b', 500));
    expect(distanceM).toBeCloseTo(500, -1);
    expect(walkingSeconds).toBeGreaterThan(300);
    expect(walkingSeconds).toBeLessThan(900);
  });
});

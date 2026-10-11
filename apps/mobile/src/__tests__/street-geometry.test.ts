import type { LineString } from '@wayfarer/shared';

import { streetGeometryOf } from '@/features/trips/street-geometry';

const PATH: LineString = {
  type: 'LineString',
  coordinates: [
    [-9.2, 38.7],
    [-9.19, 38.71],
    [-9.18, 38.7],
  ],
};

describe('streetGeometryOf (D-087)', () => {
  test('a street route is drawn as it is', () => {
    expect(streetGeometryOf({ geometry: PATH, isFallback: false })).toBe(PATH);
  });

  test('a straight-line estimate saved before the rule is never drawn', () => {
    expect(streetGeometryOf({ geometry: PATH, isFallback: true })).toBeNull();
  });

  test('a trip without a path has none', () => {
    expect(streetGeometryOf({ geometry: null, isFallback: false })).toBeNull();
  });
});

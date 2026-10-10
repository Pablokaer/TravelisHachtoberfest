import type { RouteResponse } from '@wayfarer/shared';

import { routesToOptimize } from '@/features/route/api';

// Only presence matters to routesToOptimize, so a bare object stands in for a server answer.
const result = {} as RouteResponse;

describe('routesToOptimize', () => {
  test('sends only the routes without a result for their current order', () => {
    expect(routesToOptimize([result, null, result, null])).toEqual([1, 3]);
  });

  test('sends every route again when all are already optimised', () => {
    expect(routesToOptimize([result, result])).toEqual([0, 1]);
  });

  test('sends a single unoptimised route', () => {
    expect(routesToOptimize([null])).toEqual([0]);
  });
});

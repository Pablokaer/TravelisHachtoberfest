import { assertEquals, assertThrows } from 'jsr:@std/assert@1';

import { decodePolyline } from './polyline.ts';

Deno.test('polyline: decodes the reference example into [lng, lat] pairs', () => {
  // Example from Google's encoded polyline algorithm documentation.
  assertEquals(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@'), [
    [-120.2, 38.5],
    [-120.95, 40.7],
    [-126.453, 43.252],
  ]);
});

Deno.test('polyline: empty string is an empty line', () => {
  assertEquals(decodePolyline(''), []);
});

Deno.test('polyline: a truncated string throws with the position', () => {
  assertThrows(() => decodePolyline('_p~iF~ps|'), Error, 'truncated polyline');
});

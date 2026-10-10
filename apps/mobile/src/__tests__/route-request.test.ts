import { routeRequestBody } from '@/features/route/api';
import type { AttractionSummary } from '@/features/destinations/api';

const place = (id: string): AttractionSummary => ({
  id,
  citySlug: 'lisbon',
  nameEn: id,
  namePt: null,
  category: 'museum',
  lat: 38.7,
  lng: -9.2,
  popularity: 1,
  avgVisitMinutes: 30,
  imageUrl: null,
  isUnesco: false,
});

test('the route request keeps the first stop, and keeps the whole order when asked (D-046)', () => {
  const stops = [place('a'), place('b')];
  expect(routeRequestBody(stops, { keepOrder: false })).toEqual({
    keepFirst: true,
    keepOrder: false,
    stops: [
      { id: 'a', lat: 38.7, lng: -9.2, visitMinutes: 30 },
      { id: 'b', lat: 38.7, lng: -9.2, visitMinutes: 30 },
    ],
  });
  expect(routeRequestBody(stops, { keepOrder: true }).keepOrder).toBe(true);
});

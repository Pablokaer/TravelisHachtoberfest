import { routeBounds } from '@/features/offline/map-bounds';
import { withOfflineFallback } from '@/features/offline/offline-fallback';

describe('withOfflineFallback (D-092)', () => {
  test('uses the network answer when there is one', async () => {
    const fromDevice = jest.fn(async () => 'saved');
    const answer = await withOfflineFallback(async () => 'live', fromDevice);
    expect(answer).toBe('live');
    expect(fromDevice).not.toHaveBeenCalled();
  });

  test('falls back to the copy on the device when the network fails', async () => {
    const answer = await withOfflineFallback(
      async () => {
        throw new Error('Network request failed');
      },
      async () => 'saved',
    );
    expect(answer).toBe('saved');
  });

  test('with no copy the network error is the error', async () => {
    await expect(
      withOfflineFallback(
        async () => {
          throw new Error('Network request failed');
        },
        async () => null,
      ),
    ).rejects.toThrow('Network request failed');
  });

  test('a copy that cannot be read does not hide the network error', async () => {
    await expect(
      withOfflineFallback(
        async () => {
          throw new Error('Network request failed');
        },
        async () => {
          throw new Error('disk unreadable');
        },
      ),
    ).rejects.toThrow('Network request failed');
  });
});

describe('routeBounds', () => {
  const points = [
    { lat: 38.7, lng: -9.2 },
    { lat: 38.72, lng: -9.15 },
  ];

  test('holds every point with the margin on each side', () => {
    const [west, south, east, north] = routeBounds(points, 0.01);
    expect(west).toBeCloseTo(-9.21, 5);
    expect(south).toBeCloseTo(38.69, 5);
    expect(east).toBeCloseTo(-9.14, 5);
    expect(north).toBeCloseTo(38.73, 5);
  });

  test('a single point still gets an area around it', () => {
    const [west, south, east, north] = routeBounds([{ lat: 38.7, lng: -9.2 }], 0.01);
    expect(east - west).toBeCloseTo(0.02, 5);
    expect(north - south).toBeCloseTo(0.02, 5);
  });

  test('no points is an error naming what is expected', () => {
    expect(() => routeBounds([], 0.01)).toThrow(/at least one point/);
  });
});

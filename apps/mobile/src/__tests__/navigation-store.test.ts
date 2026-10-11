import type { LatLng, LineString } from '@wayfarer/shared';

import { useNavigationStore } from '@/features/navigation/navigation-store';
import type {
  PositionListener,
  PositionWatcher,
  WatchResult,
} from '@/features/navigation/position-watcher';

/** A point `eastM` metres east of a spot in Lisbon. */
const near = (eastM: number, northM = 0): LatLng => ({
  lat: 38.7 + northM / 111_200,
  lng: -9.2 + eastM / 86_800,
});
const stop = (id: string, eastM: number) => ({ id, ...near(eastM) });
const STOPS = [stop('a', 0), stop('b', 500), stop('c', 1000)];
const LINE: LineString = {
  type: 'LineString',
  coordinates: [
    [near(0).lng, near(0).lat],
    [near(1000).lng, near(1000).lat],
  ],
};
const TRIP = { id: 'trip-1', stops: STOPS, geometry: LINE };

/** A position source the test drives by hand; remembers whether it was stopped. */
class FakeWatcher implements PositionWatcher {
  listener: PositionListener | null = null;
  stopped = 0;
  constructor(private readonly result: WatchResult | null = null) {}

  async watch(onPosition: PositionListener): Promise<WatchResult> {
    this.listener = onPosition;
    return this.result ?? { ok: true, stop: () => (this.stopped += 1) };
  }

  moveTo(position: LatLng) {
    this.listener?.(position);
  }
}

beforeEach(() => useNavigationStore.getState().stop());

describe('starting navigation (D-086)', () => {
  test('tracks the position once the watcher is granted', async () => {
    await useNavigationStore.getState().start(TRIP, new FakeWatcher());
    const state = useNavigationStore.getState();
    expect(state.status).toBe('tracking');
    expect(state.tripId).toBe('trip-1');
    expect(state.index).toBe(0);
  });

  test('a refused permission is reported and nothing is tracked', async () => {
    const watcher = new FakeWatcher({ ok: false, reason: 'denied', message: 'no permission' });
    await useNavigationStore.getState().start(TRIP, watcher);
    expect(useNavigationStore.getState().status).toBe('denied');
    expect(useNavigationStore.getState().tripId).toBeNull();
  });

  test('a failing GPS is reported with its message', async () => {
    const watcher = new FakeWatcher({ ok: false, reason: 'error', message: 'GPS is off' });
    await useNavigationStore.getState().start(TRIP, watcher);
    expect(useNavigationStore.getState()).toMatchObject({ status: 'error', message: 'GPS is off' });
  });

  test('starting again stops the previous watch first', async () => {
    const first = new FakeWatcher();
    await useNavigationStore.getState().start(TRIP, first);
    await useNavigationStore.getState().start(TRIP, new FakeWatcher());
    expect(first.stopped).toBe(1);
  });
});

describe('while walking', () => {
  test('keeps the latest position', async () => {
    const watcher = new FakeWatcher();
    await useNavigationStore.getState().start(TRIP, watcher);
    watcher.moveTo(near(200));
    expect(useNavigationStore.getState().position).toEqual(near(200));
  });

  test('moves to the next stop on arriving at the current one', async () => {
    const watcher = new FakeWatcher();
    await useNavigationStore.getState().start(TRIP, watcher);
    watcher.moveTo(near(10));
    expect(useNavigationStore.getState().index).toBe(1);
  });

  test('is finished after the last stop', async () => {
    const watcher = new FakeWatcher();
    await useNavigationStore.getState().start(TRIP, watcher);
    watcher.moveTo(near(0));
    watcher.moveTo(near(500));
    watcher.moveTo(near(1000));
    expect(useNavigationStore.getState().index).toBe(3);
    expect(useNavigationStore.getState().status).toBe('finished');
  });

  test('flags a position far from the walking line, and clears it on returning', async () => {
    const watcher = new FakeWatcher();
    await useNavigationStore.getState().start(TRIP, watcher);
    watcher.moveTo(near(300, 400));
    expect(useNavigationStore.getState().offRoute).toBe(true);
    watcher.moveTo(near(300, 5));
    expect(useNavigationStore.getState().offRoute).toBe(false);
  });

  test('Skip moves on to the next stop without arriving', async () => {
    await useNavigationStore.getState().start(TRIP, new FakeWatcher());
    useNavigationStore.getState().skip();
    expect(useNavigationStore.getState().index).toBe(1);
  });

  test('Skip never goes past the end', async () => {
    await useNavigationStore.getState().start(TRIP, new FakeWatcher());
    for (let i = 0; i < 6; i++) useNavigationStore.getState().skip();
    expect(useNavigationStore.getState().index).toBe(3);
  });
});

describe('stopping navigation', () => {
  test('releases the watcher and forgets the trip', async () => {
    const watcher = new FakeWatcher();
    await useNavigationStore.getState().start(TRIP, watcher);
    useNavigationStore.getState().stop();
    expect(watcher.stopped).toBe(1);
    expect(useNavigationStore.getState()).toMatchObject({
      status: 'idle',
      tripId: null,
      position: null,
    });
  });

  test('a position that arrives after stopping is ignored', async () => {
    const watcher = new FakeWatcher();
    await useNavigationStore.getState().start(TRIP, watcher);
    useNavigationStore.getState().stop();
    watcher.moveTo(near(10));
    expect(useNavigationStore.getState().position).toBeNull();
  });
});

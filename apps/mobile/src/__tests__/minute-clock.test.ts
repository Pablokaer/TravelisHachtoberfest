import { MinuteClock } from '@/lib/minute-clock';

/** Manual time, timers and app state: `advance` moves the time and fires the due timers. */
class FakeClockWorld {
  time = Date.parse('2026-10-01T10:00:30Z');
  timers = new Map<number, { at: number; fn: () => void }>();
  appListeners = new Set<(state: string) => void>();
  private nextId = 1;

  deps = {
    now: () => this.time,
    setTimer: (fn: () => void, ms: number) => {
      const id = this.nextId++;
      this.timers.set(id, { at: this.time + ms, fn });
      return id;
    },
    clearTimer: (id: unknown) => void this.timers.delete(id as number),
    appState: {
      addEventListener: (_: 'change', listener: (state: string) => void) => {
        this.appListeners.add(listener);
        return { remove: () => void this.appListeners.delete(listener) };
      },
    },
  };

  advance(ms: number) {
    const end = this.time + ms;
    for (;;) {
      const due = [...this.timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at);
      if (!due.length) break;
      const [id, timer] = due[0]!;
      this.timers.delete(id);
      this.time = timer.at;
      timer.fn();
    }
    this.time = end;
  }

  setAppState(state: string) {
    this.appListeners.forEach((listener) => listener(state));
  }
}

function setup() {
  const world = new FakeClockWorld();
  const clock = new MinuteClock(world.deps);
  const listener = jest.fn();
  return { world, clock, listener };
}

describe('MinuteClock (D-062)', () => {
  test('nobody listening: no timer at all', () => {
    const { world, clock } = setup();
    expect(clock.getSnapshot().toISOString()).toBe('2026-10-01T10:00:30.000Z');
    expect(world.timers.size).toBe(0);
  });

  test('ticks on the minute, then every 60 s, with one timer for every listener', () => {
    const { world, clock, listener } = setup();
    const other = jest.fn();
    clock.subscribe(listener);
    clock.subscribe(other);
    expect(world.timers.size).toBe(1);
    world.advance(29_999);
    expect(listener).not.toHaveBeenCalled();
    world.advance(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(other).toHaveBeenCalledTimes(1);
    world.advance(60_000);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  test('the time read stays the same object within a minute, and moves on the next', () => {
    const { world, clock } = setup();
    const first = clock.getSnapshot();
    world.advance(20_000);
    expect(clock.getSnapshot()).toBe(first);
    world.advance(10_000);
    expect(clock.getSnapshot().toISOString()).toBe('2026-10-01T10:01:00.000Z');
  });

  test('the last listener leaving stops the timer', () => {
    const { world, clock, listener } = setup();
    const unsubscribe = clock.subscribe(listener);
    unsubscribe();
    expect(world.timers.size).toBe(0);
    expect(world.appListeners.size).toBe(0);
  });

  test('pauses while the app is in the background and catches up when it returns', () => {
    const { world, clock, listener } = setup();
    clock.subscribe(listener);
    world.setAppState('background');
    expect(world.timers.size).toBe(0);
    world.advance(5 * 60_000);
    expect(listener).not.toHaveBeenCalled();
    world.setAppState('active');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(clock.getSnapshot().toISOString()).toBe('2026-10-01T10:05:30.000Z');
    expect(world.timers.size).toBe(1);
  });
});

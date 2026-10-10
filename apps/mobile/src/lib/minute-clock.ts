// One clock for every countdown on screen (D-062): meetup rows used to run a 30 s timer each.
// It ticks on the minute (countdowns show minutes only), only while someone listens and the
// app is in the foreground; useNow reads it through useSyncExternalStore.
import type { AppStateLike } from './query-client';

const MINUTE_MS = 60_000;

export type MinuteClockDeps = {
  now: () => number;
  setTimer: (tick: () => void, ms: number) => unknown;
  clearTimer: (timer: unknown) => void;
  appState: AppStateLike;
};

const minuteOf = (ms: number) => Math.floor(ms / MINUTE_MS);

/**
 * The current time, changing once a minute; an external store for useSyncExternalStore.
 * @example const clock = new MinuteClock(deps); useSyncExternalStore(clock.subscribe, clock.getSnapshot)
 */
export class MinuteClock {
  private listeners = new Set<() => void>();
  private snapshot: Date;
  private timer: unknown = null;
  private foreground = true;
  private appSubscription: { remove: () => void } | null = null;

  constructor(private deps: MinuteClockDeps) {
    this.snapshot = new Date(deps.now());
  }

  /** The same Date within a minute (so React sees no change), a new one after it. */
  getSnapshot = (): Date => {
    const now = this.deps.now();
    if (minuteOf(now) !== minuteOf(this.snapshot.getTime())) this.snapshot = new Date(now);
    return this.snapshot;
  };

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    this.appSubscription ??= this.deps.appState.addEventListener('change', this.onAppState);
    this.schedule();
    return () => this.unsubscribe(listener);
  };

  private unsubscribe(listener: () => void) {
    this.listeners.delete(listener);
    if (this.listeners.size) return;
    this.stop();
    this.appSubscription?.remove();
    this.appSubscription = null;
  }

  private onAppState = (state: string) => {
    this.foreground = state === 'active';
    if (!this.foreground) return this.stop();
    // Back from the background: catch up at once, then tick on the minute again.
    this.notify();
    this.schedule();
  };

  /** Next tick at the start of the next minute, so every countdown turns over together. */
  private schedule() {
    if (this.timer !== null || !this.foreground || !this.listeners.size) return;
    const untilNextMinute = MINUTE_MS - (this.deps.now() % MINUTE_MS);
    this.timer = this.deps.setTimer(this.tick, untilNextMinute);
  }

  private tick = () => {
    this.timer = null;
    this.notify();
    this.schedule();
  };

  private notify() {
    this.listeners.forEach((listener) => listener());
  }

  private stop() {
    if (this.timer !== null) this.deps.clearTimer(this.timer);
    this.timer = null;
  }
}

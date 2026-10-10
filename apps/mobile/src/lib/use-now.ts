import { useIsFocused } from 'expo-router';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { MinuteClock } from './minute-clock';

// Read lazily, so tests' fake timers (installed after this module loads) drive the clock too.
const minuteClock = new MinuteClock({
  now: () => Date.now(),
  setTimer: (tick, ms) => setTimeout(tick, ms),
  clearTimer: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
  appState: AppState,
});

/** A screen out of focus keeps the time it last read and makes the clock no work. */
const paused = () => () => undefined;

/**
 * The current time, refreshed on the minute by one shared clock (countdowns only need minutes),
 * and only while the screen is focused and the app in the foreground (D-062).
 * @example const now = useNow(); countdown(meetup.startsAt, now)
 */
export function useNow(): Date {
  const focused = useIsFocused();
  return useSyncExternalStore(focused ? minuteClock.subscribe : paused, minuteClock.getSnapshot);
}

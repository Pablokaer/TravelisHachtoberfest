import { appStateFocus } from '@/lib/query-client';

/** Stand-in for React Native's AppState: records the listener and replays state changes. */
class FakeAppState {
  listener: ((state: string) => void) | null = null;
  removed = false;
  addEventListener(_event: 'change', listener: (state: string) => void) {
    this.listener = listener;
    return { remove: () => (this.removed = true) };
  }
}

test('the app coming back to the foreground counts as focus for the queries that ask for it', () => {
  const appState = new FakeAppState();
  const setFocused = jest.fn();
  const stop = appStateFocus(appState)(setFocused);
  appState.listener!('active');
  appState.listener!('background');
  expect(setFocused.mock.calls).toEqual([[true], [false]]);
  stop();
  expect(appState.removed).toBe(true);
});

import { act, render, screen } from '@testing-library/react-native';
import { useIsFocused } from 'expo-router';
import { Text } from 'react-native';

import { useNow } from '@/lib/use-now';

jest.mock('expo-router', () => ({ useIsFocused: jest.fn(() => true) }));

/** Rendered by every reader on each of its renders: its call count is the render count. */
const RenderSpy = jest.fn(({ now }: { now: string }) => <Text testID="now">{now}</Text>);

function NowReader() {
  return <RenderSpy now={useNow().toISOString()} />;
}

beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2026-10-01T10:00:30Z') });
  RenderSpy.mockClear();
});
afterEach(() => jest.useRealTimers());

test('every reader moves on together at the start of each minute, not every 30 s', () => {
  render(
    <>
      <NowReader />
      <NowReader />
    </>,
  );
  const rendered = RenderSpy.mock.calls.length;
  act(() => jest.advanceTimersByTime(29_000));
  expect(RenderSpy.mock.calls.length).toBe(rendered);
  act(() => jest.advanceTimersByTime(1_000));
  expect(screen.getAllByTestId('now')[0]).toHaveTextContent('2026-10-01T10:01:00.000Z');
  expect(RenderSpy.mock.calls.length).toBe(rendered + 2);
  expect(jest.getTimerCount()).toBe(1);
});

test('a screen out of focus does not re-render its countdowns', () => {
  jest.mocked(useIsFocused).mockReturnValue(false);
  render(<NowReader />);
  const rendered = RenderSpy.mock.calls.length;
  act(() => jest.advanceTimersByTime(5 * 60_000));
  expect(RenderSpy.mock.calls.length).toBe(rendered);
  expect(jest.getTimerCount()).toBe(0);
});

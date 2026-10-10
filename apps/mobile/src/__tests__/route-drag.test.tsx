import { fireEvent, render, screen } from '@testing-library/react-native';
import { changeLanguage } from 'i18next';
import { act } from 'react';

import type { AttractionSummary } from '@/features/destinations/api';
import { RouteStopList } from '@/features/route/route-plan';
import '@/lib/i18n';

/** Counts how often a stop row renders: rows are the expensive part of the list. */
class MockRowRenders {
  static count = 0;
}

jest.mock('@/features/destinations/components', () => {
  const actual = jest.requireActual('@/features/destinations/components');
  return {
    ...actual,
    AttractionRow: (props: object) => {
      MockRowRenders.count++;
      return actual.AttractionRow(props);
    },
  };
});

const place = (id: string, km: number): AttractionSummary => ({
  id,
  citySlug: 'lisbon',
  nameEn: `Place ${id}`,
  namePt: `Lugar ${id}`,
  category: 'museum',
  lat: 38.7,
  lng: -9.2 + km / 86.8,
  popularity: 1,
  avgVisitMinutes: 30,
  imageUrl: null,
  isUnesco: false,
});

/**
 * A single-finger touch history, as the responder system hands it to PanResponder. Each one gets
 * a later timestamp: PanResponder ignores moves that are not newer than the last it handled, and
 * Date.now() repeats within a millisecond (which made the drag tests flaky).
 */
class FakeTouchHistory {
  static clock = 0;
  numberActiveTouches = 1;
  indexOfSingleActiveTouch = 0;
  mostRecentTimeStamp = 0;
  touchBank: Record<string, number | boolean>[];

  constructor(startY: number, currentY: number) {
    this.mostRecentTimeStamp = ++FakeTouchHistory.clock;
    const touch = { startPageX: 0, currentPageX: 0, previousPageX: 0, startPageY: startY };
    this.touchBank = [
      {
        ...touch,
        touchActive: true,
        currentPageY: currentY,
        previousPageY: startY,
        currentTimeStamp: this.mostRecentTimeStamp,
        previousTimeStamp: this.mostRecentTimeStamp,
        startTimeStamp: this.mostRecentTimeStamp,
      },
    ];
  }
}

type ListCallbacks = { onMoveTo?: jest.Mock; onDragActive?: jest.Mock };

function stopList(ids: string[], { onMoveTo, onDragActive }: ListCallbacks) {
  return (
    <RouteStopList
      route={ids.map((id, i) => place(id, i))}
      routeIndex={0}
      routeCount={1}
      splittable={false}
      units="metric"
      onMove={jest.fn()}
      onMoveTo={onMoveTo ?? jest.fn()}
      onRemove={jest.fn()}
      onSplitAt={jest.fn()}
      onDragActive={onDragActive}
    />
  );
}

/** Reports a 96 px row every 100 px, as onLayout would. */
function layOut(count: number) {
  for (let i = 0; i < count; i++) {
    fireEvent(screen.getByTestId(`route-0-stop-${i}`), 'layout', {
      nativeEvent: { layout: { x: 0, y: i * 100, width: 300, height: 96 } },
    });
  }
}

function renderList(onMoveTo: jest.Mock, onDragActive: jest.Mock) {
  render(stopList(['a', 'b', 'c'], { onMoveTo, onDragActive }));
  layOut(3);
}

const touch = (dy: number) => ({ touchHistory: new FakeTouchHistory(0, dy), nativeEvent: {} });

function dragStop(index: number, dy: number) {
  const handle = screen.getByTestId(`drag-stop-${index}`);
  fireEvent(handle, 'responderGrant', touch(0));
  fireEvent(handle, 'responderMove', touch(dy));
  fireEvent(handle, 'responderRelease', touch(dy));
}

test('dragging the first stop below the last makes it the last stop', () => {
  const onMoveTo = jest.fn();
  const onDragActive = jest.fn();
  renderList(onMoveTo, onDragActive);
  dragStop(0, 230);
  expect(onMoveTo).toHaveBeenCalledWith('a', 2);
  expect(onDragActive.mock.calls).toEqual([[true], [false]]);
});

test('a short drag leaves the order alone', () => {
  const onMoveTo = jest.fn();
  renderList(onMoveTo, jest.fn());
  dragStop(1, 30);
  expect(onMoveTo).not.toHaveBeenCalled();
});

test('the grip is labelled with the stop name', () => {
  renderList(jest.fn(), jest.fn());
  expect(screen.getByLabelText('Drag Place b to reorder')).toBeTruthy();
});

test('after a stop is removed, a stop can still be dragged to the new last place', () => {
  const onMoveTo = jest.fn();
  render(stopList(['a', 'b', 'c'], { onMoveTo }));
  layOut(3);
  screen.rerender(stopList(['a', 'b'], { onMoveTo }));
  layOut(2);
  dragStop(0, 500);
  expect(onMoveTo).toHaveBeenCalledWith('a', 1);
});

test('an interrupted drag (the system takes the gesture) leaves the order alone', () => {
  const onMoveTo = jest.fn();
  const onDragActive = jest.fn();
  renderList(onMoveTo, onDragActive);
  const handle = screen.getByTestId('drag-stop-0');
  fireEvent(handle, 'responderGrant', touch(0));
  fireEvent(handle, 'responderMove', touch(230));
  fireEvent(handle, 'responderTerminate', touch(230));
  expect(onMoveTo).not.toHaveBeenCalled();
  expect(onDragActive).toHaveBeenLastCalledWith(false);
});

test('moving the pointer within the same slot does not re-render the rows', () => {
  render(stopList(['a', 'b', 'c'], {}));
  layOut(3);
  const handle = screen.getByTestId('drag-stop-0');
  fireEvent(handle, 'responderGrant', touch(0));
  const afterGrant = MockRowRenders.count;
  [5, 10, 20, 30].forEach((dy) => fireEvent(handle, 'responderMove', touch(dy)));
  expect(MockRowRenders.count).toBe(afterGrant);
  fireEvent(handle, 'responderMove', touch(150)); // now over the next stop: it slides up
  expect(screen.getByTestId('route-0-stop-1')).toHaveStyle({ transform: [{ translateY: -100 }] });
});

test('the remove button names the stop in the app language', async () => {
  await act(() => changeLanguage('pt'));
  render(stopList(['a'], {}));
  expect(screen.getByLabelText('Remover Lugar a')).toBeTruthy();
  await act(() => changeLanguage('en'));
});

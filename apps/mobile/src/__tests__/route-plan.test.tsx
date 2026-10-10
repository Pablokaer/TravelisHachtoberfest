import { render, screen, userEvent } from '@testing-library/react-native';

import type { AttractionSummary } from '@/features/destinations/api';
import { RouteStopList, SplitPanel } from '@/features/route/route-plan';
import { useRouteStore } from '@/features/route/store';
import '@/lib/i18n';

/** An attraction `km` kilometres east (and `northKm` north) of a Lisbon origin. */
function placeAt(id: string, km: number, northKm = 0): AttractionSummary {
  return {
    id,
    citySlug: 'lisbon',
    nameEn: `Place ${id}`,
    namePt: null,
    category: 'museum',
    lat: 38.7 + northKm / 111.2,
    lng: -9.2 + km / 86.8,
    popularity: 1,
    avgVisitMinutes: 30,
    imageUrl: null,
    isUnesco: false,
  };
}

const store = () => useRouteStore.getState();
const order = () => store().stops.map((s) => s.id);
const routeIds = () => store().routes.map((r) => r.map((s) => s.id));
const addAll = (...places: AttractionSummary[]) => places.forEach((p) => store().add(p));

beforeEach(() => store().clear());

describe('automatic order', () => {
  test('the first pick is the start and the nearer place comes next (1 → 3 → 2)', () => {
    addAll(placeAt('1', 0), placeAt('2', 5), placeAt('3', 2));
    expect(order()).toEqual(['1', '3', '2']);
    expect(store().manualOrder).toBe(false);
  });

  test('minimises the whole walk, not the distance from the start', () => {
    addAll(placeAt('A', 0), placeAt('D', -3), placeAt('B', 1), placeAt('C', -1.5));
    expect(order()).toEqual(['A', 'B', 'C', 'D']);
  });

  test('removing the start makes the next stop the start and keeps the walk short', () => {
    addAll(placeAt('1', 0), placeAt('2', 5), placeAt('3', 2));
    store().remove('1');
    expect(order()).toEqual(['3', '2']);
  });
});

describe('manual order', () => {
  test('moving a stop keeps the user order; new stops are slotted in, not re-sorted', () => {
    addAll(placeAt('1', 0), placeAt('2', 1), placeAt('3', 2));
    store().move('3', -1);
    expect(order()).toEqual(['1', '3', '2']);
    expect(store().manualOrder).toBe(true);
    store().add(placeAt('4', 2.1));
    expect(order().filter((id) => id !== '4')).toEqual(['1', '3', '2']);
    expect(order()).toHaveLength(4);
  });

  test('dragging a stop moves it to the drop position within its route', () => {
    addAll(placeAt('1', 0), placeAt('2', 1), placeAt('3', 2), placeAt('4', 3));
    store().moveTo('4', 1);
    expect(order()).toEqual(['1', '4', '2', '3']);
    expect(store().manualOrder).toBe(true);
    store().moveTo('1', 3);
    expect(order()).toEqual(['4', '2', '3', '1']);
  });

  test('a drop outside the route or on the same place changes nothing', () => {
    addAll(placeAt('1', 0), placeAt('2', 1), placeAt('3', 2));
    store().moveTo('2', 1);
    store().moveTo('2', 7);
    store().moveTo('missing', 0);
    expect(order()).toEqual(['1', '2', '3']);
    expect(store().manualOrder).toBe(false);
  });

  test('"reorder automatically" restores the shortest walk', () => {
    addAll(placeAt('1', 0), placeAt('2', 1), placeAt('3', 2));
    store().move('3', -1);
    store().autoOrder();
    expect(order()).toEqual(['1', '2', '3']);
    expect(store().manualOrder).toBe(false);
  });
});

describe('splitting', () => {
  const line = () => addAll(...[0, 1, 2, 3, 4, 5].map((km) => placeAt(`s${km}`, km)));

  test('"split here" creates two independent routes of at least two stops', () => {
    line();
    store().splitAt(0, 3);
    expect(routeIds()).toEqual([
      ['s0', 's1', 's2'],
      ['s3', 's4', 's5'],
    ]);
    store().splitAt(1, 1); // would leave a single stop: ignored
    expect(store().routes).toHaveLength(2);
  });

  test('the suggested split keeps nearby places together', () => {
    // Picked alternating between two neighbourhoods 10 km apart.
    addAll(
      placeAt('w1', 0),
      placeAt('e1', 10),
      placeAt('w2', 0.3),
      placeAt('e2', 10.3),
      placeAt('w3', 0.6, 0.2),
      placeAt('e3', 10.1, 0.3),
    );
    store().suggestSplit(2);
    const [first, second] = routeIds();
    expect(first![0]).toBe('w1');
    expect([...first!].sort()).toEqual(['w1', 'w2', 'w3']);
    expect([...second!].sort()).toEqual(['e1', 'e2', 'e3']);
  });

  test('a new place joins the route it is closest to', () => {
    line();
    store().splitAt(0, 3);
    store().add(placeAt('near-end', 5.2));
    expect(routeIds()[1]).toContain('near-end');
  });

  test('a split route left with one stop is folded into the other', () => {
    line();
    store().splitAt(0, 4);
    store().remove('s5');
    expect(store().routes).toHaveLength(1);
    expect(order()).toHaveLength(5);
  });

  test('merge joins the routes back into one walk from the original start', () => {
    line();
    store().splitAt(0, 3);
    store().merge();
    expect(routeIds()).toEqual([['s0', 's1', 's2', 's3', 's4', 's5']]);
  });
});

describe('SplitPanel', () => {
  test('stays hidden below five stops', () => {
    render(<SplitPanel stopCount={4} routeCount={1} onSuggest={jest.fn()} onMerge={jest.fn()} />);
    expect(screen.queryByTestId('split-panel')).toBeNull();
  });

  test('suggests a split into the chosen number of routes', async () => {
    const onSuggest = jest.fn();
    render(<SplitPanel stopCount={6} routeCount={1} onSuggest={onSuggest} onMerge={jest.fn()} />);
    await userEvent.press(screen.getByText('3'));
    await userEvent.press(screen.getByTestId('suggest-split'));
    expect(onSuggest).toHaveBeenCalledWith(3);
    expect(screen.queryByTestId('merge-routes')).toBeNull();
  });
});

describe('walk between stops along the streets (D-046)', () => {
  const noop = () => undefined;
  const list = (
    legs?: { fromId: string; toId: string; distanceM: number; durationS: number }[],
  ) => (
    <RouteStopList
      route={[placeAt('a', 0), placeAt('b', 1)]}
      routeIndex={0}
      routeCount={1}
      splittable={false}
      units="metric"
      legs={legs}
      onMove={noop}
      onMoveTo={noop}
      onRemove={noop}
      onSplitAt={noop}
    />
  );

  test('before the route is computed, the walk is a straight-line estimate', () => {
    render(list());
    expect(screen.getByText(/^≈ .* on foot$/)).toBeOnTheScreen();
  });

  test('once computed, each leg shows the street distance and time, not an estimate', () => {
    render(list([{ fromId: 'a', toId: 'b', distanceM: 1500, durationS: 1080 }]));
    expect(screen.getByText('1.5 km · 18 min on foot')).toBeOnTheScreen();
    expect(screen.queryByText(/^≈/)).toBeNull();
  });
});

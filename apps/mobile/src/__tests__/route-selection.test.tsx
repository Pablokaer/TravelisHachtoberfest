import { render, screen, userEvent } from '@testing-library/react-native';
import { t as translate } from 'i18next';

import type { AttractionSummary } from '@/features/destinations/api';
import { AttractionCard } from '@/features/destinations/attraction-card';
import { routeNotice } from '@/features/route/notice';
import { useRouteStore } from '@/features/route/store';
import '@/lib/i18n';

/** Builds a minimal attraction for route tests. */
function fakeAttraction(id: string, citySlug = 'lisbon'): AttractionSummary {
  return {
    id,
    citySlug,
    nameEn: `Place ${id}`,
    namePt: null,
    category: 'museum',
    lat: 38.7,
    lng: -9.1,
    popularity: 1,
    avgVisitMinutes: 60,
    imageUrl: null,
    isUnesco: false,
  };
}

const store = () => useRouteStore.getState();

beforeEach(() => store().clear());

describe('route toggle', () => {
  test('adds a stop, then removes it on the second toggle', () => {
    expect(store().toggle(fakeAttraction('a'))).toBe('added');
    expect(store().stops.map((s) => s.id)).toEqual(['a']);
    expect(store().toggle(fakeAttraction('a'))).toBe('removed');
    expect(store().stops).toEqual([]);
    expect(store().citySlug).toBeNull();
  });

  test('a place from another city starts a new route', () => {
    store().toggle(fakeAttraction('a'));
    store().toggle(fakeAttraction('b'));
    expect(store().toggle(fakeAttraction('p', 'porto'))).toBe('startedNewCity');
    expect(store().citySlug).toBe('porto');
    expect(store().stops.map((s) => s.id)).toEqual(['p']);
  });

  test('up to 20 places are added; a full route is left unchanged', () => {
    for (let i = 0; i < 20; i++) expect(store().toggle(fakeAttraction(`s${i}`))).toBe('added');
    expect(store().toggle(fakeAttraction('extra'))).toBe('full');
    expect(store().stops).toHaveLength(20);
  });
});

describe('routeNotice', () => {
  const t = translate;

  test('explains a full route and a new city; stays quiet otherwise', () => {
    expect(routeNotice('full', t)).toBe('Your route already has 20 stops.');
    expect(routeNotice('startedNewCity', t)).toBe('Started a new route in this city.');
    expect(routeNotice('added', t)).toBeNull();
    expect(routeNotice('removed', t)).toBeNull();
  });
});

describe('attraction card checkbox', () => {
  test('toggles the route without opening the attraction', async () => {
    const onPress = jest.fn();
    const onToggleRoute = jest.fn();
    render(
      <AttractionCard item={fakeAttraction('a')} onPress={onPress} onToggleRoute={onToggleRoute} />,
    );
    const checkbox = screen.getByRole('checkbox', { name: 'Include Place a in the route' });
    expect(checkbox).not.toBeChecked();

    await userEvent.press(checkbox);
    expect(onToggleRoute).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
  });

  test('is checked and shows the stop number when the place is in the route', () => {
    render(<AttractionCard item={fakeAttraction('a')} order={3} onToggleRoute={jest.fn()} />);
    expect(screen.getByRole('checkbox', { name: 'Include Place a in the route' })).toBeChecked();
    expect(screen.getByText('3')).toBeOnTheScreen();
  });
});

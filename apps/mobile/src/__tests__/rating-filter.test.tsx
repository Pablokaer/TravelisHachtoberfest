import { render, screen, userEvent } from '@testing-library/react-native';

import type { AttractionSummary } from '@/features/destinations/api';
import { useExploreStore } from '@/features/destinations/store';
import { RATING_FILTER_OPTIONS, withMinRating } from '@/features/reviews/rating-filter';
import { RatingFilterTabs } from '@/features/reviews/rating-filter-tabs';
import '@/lib/i18n';

function place(id: string): AttractionSummary {
  return {
    id,
    citySlug: 'lisbon',
    nameEn: id,
    namePt: null,
    category: 'monument',
    lat: 38.69,
    lng: -9.21,
    popularity: 50,
    avgVisitMinutes: 45,
    imageUrl: null,
    isUnesco: false,
  };
}

const places = [place('three'), place('four-half'), place('five'), place('unrated')];
const ratings = new Map([
  ['three', { count: 2, average: 3 }],
  ['four-half', { count: 4, average: 4.5 }],
  ['five', { count: 1, average: 5 }],
]);
const ids = (items: AttractionSummary[]) => items.map((a) => a.id);

describe('withMinRating', () => {
  test('no minimum keeps every place, rated or not', () => {
    expect(ids(withMinRating(places, ratings, null))).toEqual(ids(places));
  });

  test('keeps the places whose average is at least the minimum', () => {
    expect(ids(withMinRating(places, ratings, 3))).toEqual(['three', 'four-half', 'five']);
    expect(ids(withMinRating(places, ratings, 4))).toEqual(['four-half', 'five']);
    expect(ids(withMinRating(places, ratings, 5))).toEqual(['five']);
  });

  test('a minimum hides places without reviews', () => {
    expect(ids(withMinRating(places, undefined, 3))).toEqual([]);
  });
});

describe('RatingFilterTabs', () => {
  test('offers 3+, 4+ and 5+', () => {
    expect(RATING_FILTER_OPTIONS).toEqual([3, 4, 5]);
    render(<RatingFilterTabs value={null} onChange={jest.fn()} />);
    expect(screen.getByRole('radio', { name: '3 stars or more' })).not.toBeChecked();
    expect(screen.getByText('4+')).toBeOnTheScreen();
    expect(screen.getByText('5+')).toBeOnTheScreen();
  });

  test('picking a tab sets the minimum', async () => {
    const onChange = jest.fn();
    render(<RatingFilterTabs value={null} onChange={onChange} />);
    await userEvent.press(screen.getByRole('radio', { name: '4 stars or more' }));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  test('pressing the active tab again clears the minimum', async () => {
    const onChange = jest.fn();
    render(<RatingFilterTabs value={4} onChange={onChange} />);
    expect(screen.getByRole('radio', { name: '4 stars or more' })).toBeChecked();
    await userEvent.press(screen.getByRole('radio', { name: '4 stars or more' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});

describe('explore store minimum rating', () => {
  test('starts without a minimum and keeps the one picked', () => {
    expect(useExploreStore.getState().minRating).toBeNull();
    useExploreStore.getState().setMinRating(4);
    expect(useExploreStore.getState().minRating).toBe(4);
    useExploreStore.getState().setMinRating(null);
  });
});

import { render, screen } from '@testing-library/react-native';

import type { AttractionSummary } from '@/features/destinations/api';
import { AttractionCard } from '@/features/destinations/attraction-card';
import { ratingsByAttraction } from '@/features/reviews/api';
import '@/lib/i18n';

const place: AttractionSummary = {
  id: 'a1',
  citySlug: 'lisbon',
  nameEn: 'Belém Tower',
  namePt: null,
  category: 'monument',
  lat: 38.69,
  lng: -9.21,
  popularity: 90,
  avgVisitMinutes: 45,
  imageUrl: null,
  isUnesco: false,
};

describe('ratingsByAttraction', () => {
  test('indexes the rated places of a city by attraction id', () => {
    const ratings = ratingsByAttraction([
      { attraction_id: 'a1', review_count: 2, rating_avg: 3.5 },
      { attraction_id: 'a2', review_count: 1, rating_avg: 5 },
    ]);
    expect(ratings.get('a1')).toEqual({ count: 2, average: 3.5 });
    expect(ratings.get('a2')).toEqual({ count: 1, average: 5 });
    expect(ratings.get('a3')).toBeUndefined();
  });
});

describe('AttractionCard rating', () => {
  test('shows the average with one decimal and a star next to the name', () => {
    render(<AttractionCard item={place} rating={{ count: 2, average: 3.5 }} />);
    const rating = screen.getByTestId('card-rating');
    expect(rating).toHaveTextContent('3.5 ★');
    expect(rating).toHaveProp('accessibilityLabel', 'Rated 3.5 out of 5 from 2 reviews');
  });

  test('the card announces its rating to screen readers with the name', () => {
    render(<AttractionCard item={place} rating={{ count: 1, average: 4 }} onPress={jest.fn()} />);
    expect(
      screen.getByRole('button', { name: /Belém Tower.*Rated 4\.0 out of 5 from 1 review/ }),
    ).toBeTruthy();
  });

  test('a place without reviews shows no rating', () => {
    render(<AttractionCard item={place} />);
    expect(screen.queryByTestId('card-rating')).toBeNull();
    render(<AttractionCard item={place} rating={{ count: 0, average: null }} />);
    expect(screen.queryByTestId('card-rating')).toBeNull();
  });
});

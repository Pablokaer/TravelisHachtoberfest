import { render, screen, userEvent } from '@testing-library/react-native';

import { formatRating } from '@/lib/format';
import {
  reviewFromRow,
  reviewKeys,
  summaryFromRow,
  targetParams,
  type RatingSummary,
  type Review,
  type ReviewTarget,
} from '@/features/reviews/api';
import { RatingSummaryLine, ReviewCard } from '@/features/reviews/components';
import { RatingDistribution } from '@/features/reviews/rating-distribution';
import { ReviewForm } from '@/features/reviews/review-form';
import { ReviewsSection } from '@/features/reviews/reviews-section';
import { StarRating } from '@/features/reviews/star-rating';
import '@/lib/i18n';
import { layOutAsIPhone } from '@/testing/phone-width';

/** In-memory stand-in for the reviews API hooks: what the server returned and what was sent. */
class MockReviewsBackend {
  static reviews: Review[] = [];
  static summary: RatingSummary = { count: 0, average: null };
  static saved: { rating: number; comment: string }[] = [];
  static deleted = 0;

  static reset() {
    MockReviewsBackend.reviews = [];
    MockReviewsBackend.summary = { count: 0, average: null };
    MockReviewsBackend.saved = [];
    MockReviewsBackend.deleted = 0;
  }
}

jest.mock('@/features/reviews/api', () => {
  const actual = jest.requireActual('@/features/reviews/api');
  const idle = { isPending: false, error: null };
  return {
    ...actual,
    useReviews: () => ({ data: MockReviewsBackend.reviews, isPending: false }),
    useRatingSummary: () => ({ data: MockReviewsBackend.summary }),
    useSaveReview: () => ({
      ...idle,
      mutate: (form: { rating: number; comment: string }) => MockReviewsBackend.saved.push(form),
    }),
    useDeleteReview: () => ({ ...idle, mutate: () => MockReviewsBackend.deleted++ }),
  };
});

const review = (over: Partial<Review> = {}): Review => ({
  id: 'r1',
  rating: 4,
  comment: 'Great views from the top',
  createdAt: '2026-09-29T10:00:00Z',
  updatedAt: '2026-09-29T10:00:00Z',
  authorName: 'Carla',
  isOwn: false,
  authorAvatarUrl: null,
  authorPublicId: null,
  ...over,
});

const placeTarget: ReviewTarget = { kind: 'attraction', id: 'a1' };
const cityTarget: ReviewTarget = { kind: 'city', id: 'lisbon' };

beforeEach(() => MockReviewsBackend.reset());

describe('review targets (D-034)', () => {
  test('each target is sent to the RPCs as its own parameter', () => {
    expect(targetParams(placeTarget)).toEqual({ p_attraction_id: 'a1' });
    expect(targetParams(cityTarget)).toEqual({ p_city_slug: 'lisbon' });
    expect(targetParams({ kind: 'trip', id: 't1' })).toEqual({ p_trip_id: 't1' });
  });

  test('a city and an attraction with the same id never share cached reviews', () => {
    const city = { kind: 'city', id: 'x' } as const;
    const place = { kind: 'attraction', id: 'x' } as const;
    expect(reviewKeys.list(city)).not.toEqual(reviewKeys.list(place));
    expect(reviewKeys.summary(city)).not.toEqual(reviewKeys.summary(place));
    // The city page cards' ratings are cached apart from the city's own reviews.
    expect(reviewKeys.cards('x')).not.toEqual(reviewKeys.list(city));
  });
});

describe('mapping server rows', () => {
  test('a review row keeps rating, comment, dates, author and ownership', () => {
    const row = {
      id: 'r1',
      rating: 5,
      comment: null,
      created_at: '2026-09-29T10:00:00Z',
      updated_at: '2026-09-30T10:00:00Z',
      author_name: null,
      is_own: true,
      author_avatar_path: null,
    };
    expect(reviewFromRow(row)).toEqual({
      id: 'r1',
      rating: 5,
      comment: null,
      createdAt: '2026-09-29T10:00:00Z',
      updatedAt: '2026-09-30T10:00:00Z',
      authorName: null,
      isOwn: true,
      authorAvatarUrl: null,
      authorPublicId: null,
    });
  });

  test('the summary is 0 reviews and no average when the attraction has none', () => {
    expect(summaryFromRow(null)).toEqual({ count: 0, average: null });
    expect(summaryFromRow({ review_count: 128, rating_avg: 4.56 })).toEqual({
      count: 128,
      average: 4.56,
    });
  });

  test('the count per star comes along when the summary has it', () => {
    expect(
      summaryFromRow({ review_count: 3, rating_avg: 4, rating_counts: [0, 0, 1, 0, 2] }),
    ).toEqual({ count: 3, average: 4, distribution: [0, 0, 1, 0, 2] });
  });
});

describe('RatingSummaryLine', () => {
  test('shows the average with one decimal, a star and the number of reviews', () => {
    render(<RatingSummaryLine summary={{ count: 128, average: 4.56 }} />);
    expect(screen.getByTestId('rating-summary')).toHaveTextContent('4.6 ★ · 128 reviews');
  });

  test('uses the singular for one review and says when there are none', () => {
    render(<RatingSummaryLine summary={{ count: 1, average: 5 }} />);
    expect(screen.getByTestId('rating-summary')).toHaveTextContent('5.0 ★ · 1 review');
    screen.rerender(<RatingSummaryLine summary={{ count: 0, average: null }} />);
    expect(screen.getByTestId('rating-summary')).toHaveTextContent('No reviews yet');
  });

  test('formats the average in the app language', () => {
    expect(formatRating(4.56, 'pt')).toBe('4,6');
    expect(formatRating(4, 'en')).toBe('4.0');
  });
});

describe('RatingDistribution', () => {
  test('one bar per star, 5 first, each with its count', () => {
    render(<RatingDistribution distribution={[1, 0, 0, 2, 7]} />);
    const rows = screen.getAllByTestId(/^rating-bar-/);
    expect(rows.map((r) => r.props.testID)).toEqual([
      'rating-bar-5',
      'rating-bar-4',
      'rating-bar-3',
      'rating-bar-2',
      'rating-bar-1',
    ]);
    expect(screen.getByLabelText('5 stars: 7 reviews')).toBeOnTheScreen();
    expect(screen.getByLabelText('1 star: 1 review')).toBeOnTheScreen();
  });
});

describe('StarRating', () => {
  test('pressing a star picks that rating', async () => {
    const onChange = jest.fn();
    render(<StarRating value={0} onChange={onChange} />);
    await userEvent.press(screen.getByLabelText('4 stars'));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  test('the chosen star is announced as selected', () => {
    render(<StarRating value={3} onChange={jest.fn()} />);
    expect(screen.getByLabelText('3 stars')).toBeChecked();
    expect(screen.getByLabelText('4 stars')).not.toBeChecked();
  });
});

describe('ReviewCard', () => {
  test('shows author, stars, comment and publication date', () => {
    render(<ReviewCard review={review()} />);
    const card = screen.getByTestId('review-r1');
    expect(card).toHaveTextContent(/Carla/);
    expect(card).toHaveTextContent(/Great views from the top/);
    expect(card).toHaveTextContent(/29 Sept 2026|Sep 29, 2026/);
    expect(screen.getByLabelText('Rated 4 out of 5')).toBeTruthy();
  });

  test('an author without a public name is shown as a traveller; own reviews say so', () => {
    render(<ReviewCard review={review({ authorName: null, isOwn: true })} />);
    expect(screen.getByTestId('review-r1')).toHaveTextContent(/Traveller/);
    expect(screen.getByTestId('review-r1')).toHaveTextContent(/Your review/);
  });

  test('says when a review was edited after publication', () => {
    render(<ReviewCard review={review({ updatedAt: '2026-10-02T10:00:00Z' })} />);
    expect(screen.getByTestId('review-r1')).toHaveTextContent(/edited/);
  });
});

describe('ReviewForm', () => {
  test('publishes a rating and a comment; the rating is required', async () => {
    const onSave = jest.fn();
    render(<ReviewForm initial={null} onSave={onSave} onDelete={jest.fn()} />);
    await userEvent.press(screen.getByTestId('save-review'));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Choose from 1 to 5 stars')).toBeTruthy();

    await userEvent.press(screen.getByLabelText('5 stars'));
    await userEvent.type(screen.getByLabelText('Your comment (optional)'), 'Worth the climb');
    await userEvent.press(screen.getByTestId('save-review'));
    expect(onSave).toHaveBeenCalledWith({ rating: 5, comment: 'Worth the climb' });
  });

  test('a comment is optional', async () => {
    const onSave = jest.fn();
    render(<ReviewForm initial={null} onSave={onSave} onDelete={jest.fn()} />);
    await userEvent.press(screen.getByLabelText('2 stars'));
    await userEvent.press(screen.getByTestId('save-review'));
    expect(onSave).toHaveBeenCalledWith({ rating: 2, comment: '' });
  });

  test('an existing review is edited: fields are filled in and it can be deleted', async () => {
    const onSave = jest.fn();
    const onDelete = jest.fn();
    render(
      <ReviewForm initial={{ rating: 3, comment: 'Fine' }} onSave={onSave} onDelete={onDelete} />,
    );
    expect(screen.getByLabelText('3 stars')).toBeChecked();
    expect(screen.getByDisplayValue('Fine')).toBeTruthy();
    await userEvent.press(screen.getByLabelText('4 stars'));
    await userEvent.press(screen.getByText('Update review'));
    expect(onSave).toHaveBeenCalledWith({ rating: 4, comment: 'Fine' });

    await userEvent.press(screen.getByTestId('delete-review'));
    expect(onDelete).not.toHaveBeenCalled(); // asks first
    await userEvent.press(screen.getByText('Delete review'));
    expect(onDelete).toHaveBeenCalled();
  });

  test('a new review cannot be deleted', () => {
    render(<ReviewForm initial={null} onSave={jest.fn()} onDelete={jest.fn()} />);
    expect(screen.queryByTestId('delete-review')).toBeNull();
  });
});

describe('ReviewsSection', () => {
  test('lists every review of the attraction with the summary', () => {
    MockReviewsBackend.reviews = [review(), review({ id: 'r2', authorName: 'Dan', rating: 5 })];
    MockReviewsBackend.summary = { count: 2, average: 4.5 };
    render(<ReviewsSection target={placeTarget} />);
    expect(screen.getByTestId('review-r1')).toBeTruthy();
    expect(screen.getByTestId('review-r2')).toBeTruthy();
    expect(screen.getAllByTestId('rating-summary')[0]).toHaveTextContent('4.5 ★ · 2 reviews');
  });

  test('with no review of mine, the form publishes a new one', async () => {
    render(<ReviewsSection target={placeTarget} />);
    expect(screen.getByText('Publish review')).toBeTruthy();
    await userEvent.press(screen.getByLabelText('5 stars'));
    await userEvent.press(screen.getByTestId('save-review'));
    expect(MockReviewsBackend.saved).toEqual([{ rating: 5, comment: '' }]);
  });

  test('with a review of mine, the form edits it and offers to delete it', async () => {
    MockReviewsBackend.reviews = [review({ isOwn: true, rating: 2, comment: 'Crowded' })];
    render(<ReviewsSection target={placeTarget} />);
    expect(screen.getByDisplayValue('Crowded')).toBeTruthy();
    expect(screen.getByLabelText('2 stars')).toBeChecked();
    await userEvent.press(screen.getByTestId('delete-review'));
    await userEvent.press(screen.getByText('Delete review'));
    expect(MockReviewsBackend.deleted).toBe(1);
  });

  test('a city is rated with its own title, and its distribution is shown', () => {
    MockReviewsBackend.summary = { count: 2, average: 4, distribution: [0, 0, 1, 0, 1] };
    render(<ReviewsSection target={cityTarget} />);
    expect(screen.getByText('Rate this city')).toBeOnTheScreen();
    expect(screen.getByTestId('rating-bar-5')).toBeOnTheScreen();
  });

  test('without the right to review (own walk list), only the reviews are shown', () => {
    MockReviewsBackend.reviews = [review()];
    render(<ReviewsSection target={{ kind: 'trip', id: 't1' }} canReview={false} />);
    expect(screen.queryByTestId('review-form')).toBeNull();
    expect(screen.getByText('Travellers who open your list can rate it here.')).toBeOnTheScreen();
    expect(screen.getByTestId('review-r1')).toBeOnTheScreen();
  });

  test("other people's reviews offer no edit or delete controls", () => {
    MockReviewsBackend.reviews = [review({ isOwn: false })];
    render(<ReviewsSection target={placeTarget} />);
    expect(screen.queryByTestId('delete-review')).toBeNull();
    expect(screen.getByText('Publish review')).toBeTruthy();
  });
});

// iPhone audit (D-076): the whole Reviews area is centred on phones.
describe('Reviews on a phone', () => {
  layOutAsIPhone();

  test('centres the title, the average and the bars per star', () => {
    MockReviewsBackend.summary = { count: 2, average: 4.5, distribution: [0, 0, 0, 1, 1] };
    render(<ReviewsSection target={cityTarget} />);
    expect(screen.getByRole('header', { name: 'Reviews' })).toHaveStyle({ textAlign: 'center' });
    expect(screen.getByTestId('rating-summary')).toHaveStyle({ textAlign: 'center' });
    expect(screen.getByTestId('rating-distribution')).toHaveStyle({ alignSelf: 'center' });
  });

  test('centres the form: title, stars and buttons', () => {
    render(<ReviewForm initial={null} onSave={jest.fn()} onDelete={jest.fn()} kind="city" />);
    expect(screen.getByText('Rate this city')).toHaveStyle({ textAlign: 'center' });
    expect(screen.getByTestId('star-rating')).toHaveStyle({ justifyContent: 'center' });
    expect(screen.getByTestId('review-form-actions')).toHaveStyle({ justifyContent: 'center' });
    expect(screen.getByText('Your comment (optional)')).toHaveStyle({ textAlign: 'center' });
  });

  test('centres each review: author above, then stars and comment', () => {
    render(<ReviewCard review={review()} />);
    expect(screen.getByTestId('review-author')).toHaveStyle({
      flexDirection: 'column',
      alignItems: 'center',
    });
    expect(screen.getByTestId('review-stars')).toHaveStyle({ justifyContent: 'center' });
    expect(screen.getByText('Great views from the top')).toHaveStyle({ textAlign: 'center' });
  });

  // Regression: Badge sets alignSelf: flex-start, which beat the centred column.
  test("centres the 'Your review' badge of the user's own review", () => {
    render(<ReviewCard review={review({ isOwn: true })} />);
    expect(screen.getByTestId('review-own-badge')).toHaveStyle({ alignSelf: 'center' });
  });
});

describe('Reviews on a tablet', () => {
  test('keep the author beside the avatar and the comment at the start of the line', () => {
    render(<ReviewCard review={review()} />);
    expect(screen.getByTestId('review-author')).toHaveStyle({ flexDirection: 'row' });
    expect(screen.getByText('Great views from the top')).not.toHaveStyle({ textAlign: 'center' });
  });
});

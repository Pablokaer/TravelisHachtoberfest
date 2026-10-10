import { render, screen } from '@testing-library/react-native';

import { CardRating, RatingSummaryLine } from '@/features/reviews/components';
import { StarRating, Stars } from '@/features/reviews/star-rating';
import '@/lib/i18n';
import { palette } from '@/theme/colors';

const gold = palette.light.star;
// The glyphs are aria-hidden on purpose (the rating is spoken by the label), so include them.
const hidden = { includeHiddenElements: true };

describe('star colour', () => {
  test('filled stars are gold; empty stars stay grey', () => {
    render(<StarRating value={2} onChange={jest.fn()} />);
    expect(screen.getAllByTestId('star-glyph-filled', hidden)).toHaveLength(2);
    screen
      .getAllByTestId('star-glyph-filled', hidden)
      .forEach((s) => expect(s).toHaveStyle({ color: gold }));
    screen
      .getAllByTestId('star-glyph-empty', hidden)
      .forEach((s) => expect(s).toHaveStyle({ color: palette.light.borderStrong }));
  });

  test('read-only stars of a review are gold', () => {
    render(<Stars rating={3} />);
    screen
      .getAllByTestId('star-glyph-filled', hidden)
      .forEach((s) => expect(s).toHaveStyle({ color: gold }));
  });

  test('the star beside an average is gold, the number keeps the text colour', () => {
    render(<CardRating summary={{ count: 2, average: 3.5 }} />);
    expect(screen.getByTestId('card-rating')).toHaveTextContent('3.5 ★');
    expect(screen.getByTestId('rating-star')).toHaveStyle({ color: gold });
    screen.unmount();
    render(<RatingSummaryLine summary={{ count: 2, average: 3.5 }} />);
    expect(screen.getByTestId('rating-summary')).toHaveTextContent('3.5 ★ · 2 reviews');
    expect(screen.getByTestId('rating-star')).toHaveStyle({ color: gold });
  });

  test('both themes define a star colour', () => {
    expect(palette.light.star).toMatch(/^#[0-9A-F]{6}$/i);
    expect(palette.dark.star).toMatch(/^#[0-9A-F]{6}$/i);
  });
});

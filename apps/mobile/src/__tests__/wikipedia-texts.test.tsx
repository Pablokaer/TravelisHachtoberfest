import { render, screen } from '@testing-library/react-native';

import { WikipediaTextBlock } from '@/features/destinations/wikipedia-texts';
import '@/lib/i18n';
import { layOutAsIPhone } from '@/testing/phone-width';

const texts = {
  summary: 'Amsterdam is the capital of the Netherlands.',
  history: 'Amsterdam began as a fishing village.',
  sourceUrl: 'https://en.wikipedia.org/wiki/Amsterdam',
};

// iPhone audit (D-076): the "History" sub-heading is centred on phones; the paragraphs stay at
// the start of the line, easier to read.
describe('WikipediaTextBlock on a phone', () => {
  layOutAsIPhone();

  test('centres the History heading but not the paragraphs', () => {
    render(<WikipediaTextBlock texts={texts} />);
    expect(screen.getByRole('header', { name: 'History' })).toHaveStyle({ textAlign: 'center' });
    expect(screen.getByText(texts.history)).not.toHaveStyle({ textAlign: 'center' });
  });

  test("centres the source and 'Read the full article on Wikipedia'", () => {
    render(<WikipediaTextBlock texts={texts} />);
    expect(screen.getByTestId('wikipedia-source')).toHaveStyle({ justifyContent: 'center' });
    expect(screen.getByText('From Wikipedia · CC BY-SA 4.0')).toHaveStyle({ textAlign: 'center' });
  });
});

describe('WikipediaTextBlock on a tablet', () => {
  test('keeps the History heading at the start of the line', () => {
    render(<WikipediaTextBlock texts={texts} />);
    expect(screen.getByRole('header', { name: 'History' })).not.toHaveStyle({
      textAlign: 'center',
    });
  });
});

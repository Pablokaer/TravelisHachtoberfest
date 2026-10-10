import { act, renderHook } from '@testing-library/react-native';

import { useDebouncedValue } from '@/lib/use-debounced-value';
import { preferredArticle, wikipediaTextsFor, wikipediaUrl } from '@/lib/wikipedia';

describe('Wikipedia links', () => {
  test('an article URL uses underscores and encodes the title', () => {
    expect(wikipediaUrl({ language: 'pt', title: 'Torre de Belém' })).toBe(
      'https://pt.wikipedia.org/wiki/Torre_de_Bel%C3%A9m',
    );
  });

  test('the article in the app language is preferred, then the other one', () => {
    expect(preferredArticle('pt', 'Lisbon', 'Lisboa')).toEqual({ language: 'pt', title: 'Lisboa' });
    expect(preferredArticle('pt', 'Lisbon', null)).toEqual({ language: 'en', title: 'Lisbon' });
    expect(preferredArticle('en', null, 'Lisboa')).toEqual({ language: 'pt', title: 'Lisboa' });
    expect(preferredArticle('en', null, null)).toBeNull();
  });
});

describe('wikipediaTextsFor (D-070)', () => {
  const texts = {
    summaryEn: 'The oldest church in Lisbon.',
    summaryPt: 'A igreja mais antiga de Lisboa.',
    historyEn: 'Built in 1147 on the site of the main mosque.',
    historyPt: null,
    wikipediaEn: 'Lisbon Cathedral',
    wikipediaPt: 'Sé de Lisboa',
  };

  test('introduction, history and source link all come from the app language article', () => {
    expect(wikipediaTextsFor(texts, 'pt')).toEqual({
      summary: 'A igreja mais antiga de Lisboa.',
      history: null,
      sourceUrl: 'https://pt.wikipedia.org/wiki/S%C3%A9_de_Lisboa',
    });
  });

  test('without a text in the app language, the other article is shown with its own link', () => {
    expect(wikipediaTextsFor({ ...texts, summaryPt: null }, 'pt')).toEqual({
      summary: 'The oldest church in Lisbon.',
      history: 'Built in 1147 on the site of the main mosque.',
      sourceUrl: 'https://en.wikipedia.org/wiki/Lisbon_Cathedral',
    });
  });

  test('a place without any text has nothing to show', () => {
    const none = { ...texts, summaryEn: null, summaryPt: null, historyEn: null };
    expect(wikipediaTextsFor(none, 'en')).toEqual({
      summary: null,
      history: null,
      sourceUrl: null,
    });
  });
});

describe('useDebouncedValue', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('follows the value once it stops changing for the delay', () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useDebouncedValue(value, 300),
      {
        initialProps: { value: 'c' },
      },
    );
    rerender({ value: 'ca' });
    rerender({ value: 'can' });
    expect(result.current).toBe('c');
    act(() => jest.advanceTimersByTime(300));
    expect(result.current).toBe('can');
  });
});

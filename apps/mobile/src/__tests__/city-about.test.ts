import { cityAboutFromRow } from '@/features/destinations/city-about-api';

const row = {
  summary_en: 'Lisbon is the capital of Portugal.',
  summary_pt: 'Lisboa é a capital de Portugal.',
  wikipedia_en: 'Lisbon',
  wikipedia_pt: 'Lisboa',
  history_en: 'Lisbon was taken from the Moors in 1147.',
  history_pt: 'Lisboa foi conquistada aos mouros em 1147.',
};

describe('cityAboutFromRow (D-036)', () => {
  test('the summary and its source article follow the app language', () => {
    expect(cityAboutFromRow(row, 'pt')).toEqual({
      summary: 'Lisboa é a capital de Portugal.',
      history: 'Lisboa foi conquistada aos mouros em 1147.',
      sourceUrl: 'https://pt.wikipedia.org/wiki/Lisboa',
    });
    expect(cityAboutFromRow(row, 'en').sourceUrl).toBe('https://en.wikipedia.org/wiki/Lisbon');
  });

  test('without a summary in the app language, the other one is shown with its own source', () => {
    expect(cityAboutFromRow({ ...row, summary_pt: null, history_pt: null }, 'pt')).toEqual({
      summary: 'Lisbon is the capital of Portugal.',
      history: 'Lisbon was taken from the Moors in 1147.',
      sourceUrl: 'https://en.wikipedia.org/wiki/Lisbon',
    });
  });

  test('a city without a summary has nothing to show', () => {
    const empty = {
      summary_en: null,
      summary_pt: null,
      wikipedia_en: null,
      wikipedia_pt: null,
      history_en: null,
      history_pt: null,
    };
    const nothing = { summary: null, history: null, sourceUrl: null };
    expect(cityAboutFromRow(empty, 'en')).toEqual(nothing);
    expect(cityAboutFromRow(null, 'en')).toEqual(nothing);
  });
});

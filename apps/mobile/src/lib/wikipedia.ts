// Links to Wikipedia articles and the article texts shown on city and attraction pages (D-036,
// D-070).

export type WikipediaArticle = { language: 'en' | 'pt'; title: string };

/**
 * @example wikipediaUrl({ language: 'pt', title: 'Torre de Belém' })
 * // 'https://pt.wikipedia.org/wiki/Torre_de_Bel%C3%A9m'
 */
export function wikipediaUrl(article: WikipediaArticle): string {
  const path = encodeURIComponent(article.title.replace(/ /g, '_'));
  return `https://${article.language}.wikipedia.org/wiki/${path}`;
}

/**
 * The article in the app language when there is one, else the other language's.
 * @example preferredArticle('pt', 'Lisbon', null) // { language: 'en', title: 'Lisbon' }
 */
export function preferredArticle(
  language: string,
  titleEn: string | null,
  titlePt: string | null,
): WikipediaArticle | null {
  if (language === 'pt' && titlePt) return { language: 'pt', title: titlePt };
  if (titleEn) return { language: 'en', title: titleEn };
  return titlePt ? { language: 'pt', title: titlePt } : null;
}

/** Introduction and History excerpt of the articles in both languages, as the pipeline stores them. */
export type WikipediaTextColumns = {
  summaryEn: string | null;
  summaryPt: string | null;
  historyEn: string | null;
  historyPt: string | null;
  wikipediaEn: string | null;
  wikipediaPt: string | null;
};

/** What a page shows: texts from one article, and the link to that article (CC BY-SA). */
export type WikipediaTexts = {
  summary: string | null;
  history: string | null;
  sourceUrl: string | null;
};

function textsOf(c: WikipediaTextColumns, language: 'en' | 'pt'): WikipediaTexts {
  const [summary, history, title] =
    language === 'pt'
      ? [c.summaryPt, c.historyPt, c.wikipediaPt]
      : [c.summaryEn, c.historyEn, c.wikipediaEn];
  return { summary, history, sourceUrl: title ? wikipediaUrl({ language, title }) : null };
}

const hasText = (t: WikipediaTexts) => !!(t.summary || t.history);

/**
 * The app language's texts when its article has any, else the other language's — never mixed,
 * so the link always leads to the article the texts come from.
 * @example wikipediaTextsFor(place, 'pt').sourceUrl // 'https://pt.wikipedia.org/wiki/S%C3%A9_de_Lisboa'
 */
export function wikipediaTextsFor(columns: WikipediaTextColumns, language: string): WikipediaTexts {
  const [first, second] = language === 'pt' ? (['pt', 'en'] as const) : (['en', 'pt'] as const);
  const preferred = textsOf(columns, first);
  if (hasText(preferred)) return preferred;
  const other = textsOf(columns, second);
  return hasText(other) ? other : { summary: null, history: null, sourceUrl: null };
}

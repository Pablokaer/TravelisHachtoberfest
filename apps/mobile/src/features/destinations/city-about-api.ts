// The city page "About" text (D-036): the introduction of the city's Wikipedia article and an
// excerpt of its History section (D-070), stored on `cities` by the data pipeline, shown with
// its CC BY-SA source link.
import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { wikipediaTextsFor, type WikipediaTexts } from '@/lib/wikipedia';

type CityAboutRow = {
  summary_en: string | null;
  summary_pt: string | null;
  history_en: string | null;
  history_pt: string | null;
  wikipedia_en: string | null;
  wikipedia_pt: string | null;
};

/** The texts to show and the article they come from (always the same language). */
export type CityAbout = WikipediaTexts;

/**
 * The texts in the app language, else the other one; the source link matches them.
 * @example cityAboutFromRow(row, 'pt').sourceUrl // 'https://pt.wikipedia.org/wiki/Lisboa'
 */
export function cityAboutFromRow(row: CityAboutRow | null, language: string): CityAbout {
  if (!row) return { summary: null, history: null, sourceUrl: null };
  return wikipediaTextsFor(
    {
      summaryEn: row.summary_en,
      summaryPt: row.summary_pt,
      historyEn: row.history_en,
      historyPt: row.history_pt,
      wikipediaEn: row.wikipedia_en,
      wikipediaPt: row.wikipedia_pt,
    },
    language,
  );
}

/** The About text of a city in the app language. */
export function useCityAbout(citySlug: string | undefined, language: string) {
  return useQuery({
    queryKey: ['cityAbout', citySlug ?? ''],
    enabled: !!citySlug,
    staleTime: 3600_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cities')
        .select('summary_en, summary_pt, history_en, history_pt, wikipedia_en, wikipedia_pt')
        .eq('slug', citySlug!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
    select: (row) => cityAboutFromRow(row, language),
  });
}

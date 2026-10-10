// A city's notable people (D-071): historical figures, writers, musicians and artists born or
// died there, written by the data pipeline (Wikidata + Commons) and read by the city page.
import { useQuery } from '@tanstack/react-query';

import type { Database } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

export const PEOPLE_CATEGORIES = ['history', 'writer', 'music', 'art'] as const;
export type PeopleCategory = (typeof PEOPLE_CATEGORIES)[number];
export type PeopleFilter = PeopleCategory | 'all';

export type NotablePerson = {
  wikidataId: string;
  nameEn: string;
  namePt: string | null;
  descriptionEn: string | null;
  descriptionPt: string | null;
  categories: PeopleCategory[];
  birthYear: number | null;
  deathYear: number | null;
  bornHere: boolean;
  diedHere: boolean;
  imageUrl: string | null;
  imageAuthor: string | null;
  imageLicense: string | null;
  wikipediaEn: string | null;
  wikipediaPt: string | null;
};

type NotablePersonRow = Database['public']['Tables']['notable_people']['Row'];

const isCategory = (value: string): value is PeopleCategory =>
  (PEOPLE_CATEGORIES as readonly string[]).includes(value);

/**
 * @example notablePersonFromRow(row).categories // ['history', 'writer']
 */
export function notablePersonFromRow(r: NotablePersonRow): NotablePerson {
  return {
    wikidataId: r.wikidata_id,
    nameEn: r.name_en,
    namePt: r.name_pt,
    descriptionEn: r.description_en,
    descriptionPt: r.description_pt,
    categories: r.categories.filter(isCategory),
    birthYear: r.birth_year,
    deathYear: r.death_year,
    bornHere: r.born_here,
    diedHere: r.died_here,
    imageUrl: r.image_url,
    imageAuthor: r.image_author,
    imageLicense: r.image_license,
    wikipediaEn: r.wikipedia_en,
    wikipediaPt: r.wikipedia_pt,
  };
}

/**
 * The categories at least one person has, in display order: only those get a filter.
 * @example categoriesPresent(people) // ['history', 'music']
 */
export function categoriesPresent(people: NotablePerson[]): PeopleCategory[] {
  return PEOPLE_CATEGORIES.filter((cat) => people.some((p) => p.categories.includes(cat)));
}

/**
 * @example peopleInCategory(people, 'writer')
 */
export function peopleInCategory(people: NotablePerson[], filter: PeopleFilter): NotablePerson[] {
  return filter === 'all' ? people : people.filter((p) => p.categories.includes(filter));
}

/** A city's notable people, best known first (the pipeline keeps at most 40). */
export function useNotablePeople(citySlug: string) {
  return useQuery({
    queryKey: ['notablePeople', citySlug],
    staleTime: 3600_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notable_people')
        .select('*')
        .eq('city_slug', citySlug)
        .order('sitelinks', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []).map(notablePersonFromRow);
    },
  });
}

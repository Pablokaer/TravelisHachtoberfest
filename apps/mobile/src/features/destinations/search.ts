import { cityName, localizedName, type AttractionSummary, type City } from './api';

/** Lower-case, accent-free text for matching ("Jerónimos" → "jeronimos"). */
export function normalizeSearch(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** What separates the words of a name ("Torre de Belém", "Saint-Germain", "Joe's (Bar)"). */
const WORD_SEPARATORS = /[\s\-'’(),.]+/;

/** A name normalised once for matching, with its words. */
export type IndexedName = { text: string; words: string[] };

/** The names that are present, normalised and split into words. */
function indexNames(names: readonly (string | null)[]): IndexedName[] {
  return names
    .filter((n): n is string => !!n)
    .map((name) => {
      const text = normalizeSearch(name);
      return { text, words: text.split(WORD_SEPARATORS) };
    });
}

/** 0 = name starts with the query, 1 = a word starts with it, 2 = contains it, null = no match. */
function matchRank(name: IndexedName, query: string): number | null {
  if (name.text.startsWith(query)) return 0;
  if (name.words.some((word) => word.startsWith(query))) return 1;
  return name.text.includes(query) ? 2 : null;
}

/** Best rank over several names (e.g. the English and Portuguese ones). */
function bestRank(names: readonly IndexedName[], query: string): number | null {
  const ranks = names.map((n) => matchRank(n, query)).filter((r): r is number => r !== null);
  return ranks.length ? Math.min(...ranks) : null;
}

// One collator per language: `localeCompare(b, language)` builds a new one on every call, and a
// sort of a city's 300 places makes thousands of calls. Same order (the spec defines
// localeCompare as Intl.Collator(locales).compare).
const collators = new Map<string, Intl.Collator>();

function collatorFor(language: string): Intl.Collator {
  let collator = collators.get(language);
  if (!collator) collators.set(language, (collator = new Intl.Collator(language)));
  return collator;
}

/** A city's places with their names normalised once, for searching on every keystroke. */
export type AttractionSearchIndex = readonly { item: AttractionSummary; names: IndexedName[] }[];

/**
 * Normalises every place's names once (NFD, accents and case dropped, split into words), so a
 * keystroke only normalises the query. Build it when the places change, not per search.
 * @example const index = useMemo(() => buildSearchIndex(places), [places]);
 */
export function buildSearchIndex(items: readonly AttractionSummary[]): AttractionSearchIndex {
  return items.map((item) => ({ item, names: indexNames([item.nameEn, item.namePt]) }));
}

/**
 * The places of `index` whose name (EN or PT, accents ignored) matches `query`: names starting
 * with it first, then a word starting with it, then any substring; ties by popularity, then by
 * the localised name. An empty query matches nothing.
 * @example searchIndex(buildSearchIndex(lisbon), 'jer', 'en', 8) // [Jerónimos Monastery, …]
 */
export function searchIndex(
  index: AttractionSearchIndex,
  query: string,
  language: string,
  limit = Infinity,
): AttractionSummary[] {
  const q = normalizeSearch(query);
  if (!q) return [];
  const collator = collatorFor(language);
  return index
    .map(({ item, names }) => ({ item, rank: bestRank(names, q) }))
    .filter((m): m is { item: AttractionSummary; rank: number } => m.rank !== null)
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        b.item.popularity - a.item.popularity ||
        collator.compare(localizedName(a.item, language), localizedName(b.item, language)),
    )
    .slice(0, limit)
    .map((m) => m.item);
}

/**
 * Same as searchIndex for a one-off search; screens that search on every keystroke keep a
 * buildSearchIndex of their places instead.
 * @example searchAttractions(lisbon, 'jer', 'en', 8) // [Jerónimos Monastery, …]
 */
export function searchAttractions(
  items: readonly AttractionSummary[],
  query: string,
  language: string,
  limit = Infinity,
): AttractionSummary[] {
  return searchIndex(buildSearchIndex(items), query, language, limit);
}

/** Country matches rank after every city-name match ("ita" → Italian cities after "Ita…"). */
const COUNTRY_RANK_OFFSET = 3;

function cityRank(city: City, query: string): number | null {
  const byName = bestRank(indexNames([city.nameEn, city.namePt]), query);
  if (byName !== null) return byName;
  const byCountry = bestRank(indexNames([city.countryNameEn, city.countryNamePt]), query);
  return byCountry === null ? null : byCountry + COUNTRY_RANK_OFFSET;
}

/**
 * Cities whose name or country (EN or PT, accents ignored) matches `query`, best matches first
 * (same ranking as attractions; country matches last), ties by the localised name. An empty
 * query matches nothing.
 * @example searchCities(cities, 'amst', 'en') // [Amsterdam]
 */
export function searchCities(cities: readonly City[], query: string, language: string): City[] {
  const q = normalizeSearch(query);
  if (!q) return [];
  return cities
    .map((city) => ({ city, rank: cityRank(city, q) }))
    .filter((m): m is { city: City; rank: number } => m.rank !== null)
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        cityName(a.city, language).localeCompare(cityName(b.city, language), language),
    )
    .map((m) => m.city);
}

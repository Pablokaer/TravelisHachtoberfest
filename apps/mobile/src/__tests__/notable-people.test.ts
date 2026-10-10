import i18n from '@/lib/i18n';
import {
  categoriesPresent,
  notablePersonFromRow,
  peopleInCategory,
  type NotablePerson,
} from '@/features/people/api';
import { connectionKey, lifeYears } from '@/features/people/format';

const row = {
  city_slug: 'lisbon',
  wikidata_id: 'Q1',
  name_en: 'Fernando Pessoa',
  name_pt: null,
  description_en: 'Portuguese poet',
  description_pt: 'poeta português',
  categories: ['history', 'writer'],
  birth_year: 1888,
  death_year: 1935,
  born_here: true,
  died_here: true,
  image_url: null,
  image_author: null,
  image_license: null,
  image_license_url: null,
  image_page_url: null,
  wikipedia_en: 'Fernando Pessoa',
  wikipedia_pt: null,
  sitelinks: 106,
  created_at: '',
  updated_at: '',
};

const person = (over: Partial<NotablePerson>): NotablePerson => ({
  ...notablePersonFromRow(row),
  ...over,
});

describe('notable people (D-071)', () => {
  test('a row maps to a person, unknown categories dropped', () => {
    const p = notablePersonFromRow({ ...row, categories: ['writer', 'sport'] });
    expect(p.categories).toEqual(['writer']);
    expect(p.wikidataId).toBe('Q1');
  });

  test('life years: span, still living, and years before the common era', () => {
    const t = i18n.t;
    expect(lifeYears(person({}), t)).toBe('1888–1935');
    expect(lifeYears(person({ deathYear: null }), t)).toBe('born 1888');
    expect(lifeYears(person({ birthYear: -500, deathYear: -430 }), t)).toBe('500 BC–430 BC');
    expect(lifeYears(person({ birthYear: null, deathYear: null }), t)).toBeNull();
  });

  test('how the person is tied to the city', () => {
    expect(connectionKey(person({}))).toBe('people.bornAndDiedHere');
    expect(connectionKey(person({ diedHere: false }))).toBe('people.bornHere');
    expect(connectionKey(person({ bornHere: false }))).toBe('people.diedHere');
  });

  test('filters: only categories someone has, and everyone under All', () => {
    const list = [person({}), person({ wikidataId: 'Q2', categories: ['music'] })];
    expect(categoriesPresent(list)).toEqual(['history', 'writer', 'music']);
    expect(peopleInCategory(list, 'music').map((p) => p.wikidataId)).toEqual(['Q2']);
    expect(peopleInCategory(list, 'all')).toHaveLength(2);
  });
});

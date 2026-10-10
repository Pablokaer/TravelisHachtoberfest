// How a notable person's card words their life and their tie to the city (D-071).
import type { TFunction } from 'i18next';

import type { NotablePerson } from './api';

type ConnectionKey = 'people.bornHere' | 'people.diedHere' | 'people.bornAndDiedHere';

function yearLabel(year: number, t: TFunction): string {
  return year < 0 ? t('people.bce', { year: String(-year) }) : String(year);
}

/**
 * "1888–1935", "born 1949" for the living (or an unknown death), "500 BC–430 BC"; null when
 * the birth year is unknown.
 * @example lifeYears(pessoa, t) // '1888–1935'
 */
export function lifeYears(p: NotablePerson, t: TFunction): string | null {
  if (p.birthYear === null) return null;
  if (p.deathYear === null) return t('people.born', { year: yearLabel(p.birthYear, t) });
  return `${yearLabel(p.birthYear, t)}–${yearLabel(p.deathYear, t)}`;
}

/**
 * The translation key of "Born here" / "Died here" / "Born and died here".
 * @example t(connectionKey(pessoa)) // 'Born and died here'
 */
export function connectionKey(p: NotablePerson): ConnectionKey {
  if (p.bornHere && p.diedHere) return 'people.bornAndDiedHere';
  return p.bornHere ? 'people.bornHere' : 'people.diedHere';
}

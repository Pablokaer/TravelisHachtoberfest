import { describe, expect, it } from 'vitest';

import { ATTRACTION_CATEGORIES, DEFAULT_VISIT_MINUTES } from './index.ts';
import { resources } from '../i18n/index.ts';

describe('attraction categories', () => {
  it('lists nature right after park, matching the database enum order (D-068)', () => {
    expect(ATTRACTION_CATEGORIES.indexOf('nature')).toBe(ATTRACTION_CATEGORIES.indexOf('park') + 1);
  });

  it('a nature visit (a beach, a trail, a waterfall) defaults to an hour and a half', () => {
    expect(DEFAULT_VISIT_MINUTES.nature).toBe(90);
  });

  it('every category has a tab label in EN and PT', () => {
    for (const lang of [resources.en, resources.pt]) {
      const labels = (lang.translation as { category: Record<string, string> }).category;
      expect(Object.keys(labels).sort()).toEqual([...ATTRACTION_CATEGORIES].sort());
    }
  });
});

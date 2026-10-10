import { describe, expect, it } from 'vitest';

import { flattenKeys, resources } from './index.ts';

const interpolations = (s: string) => [...s.matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1]).sort();

describe('i18n resources', () => {
  const en = resources.en.translation as Record<string, unknown>;
  const pt = resources.pt.translation as Record<string, unknown>;

  it('EN and PT have exactly the same keys', () => {
    expect(flattenKeys(pt).sort()).toEqual(flattenKeys(en).sort());
  });

  it('no translation is empty', () => {
    for (const lang of [en, pt]) {
      for (const key of flattenKeys(lang)) {
        const value = key
          .split('.')
          .reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], lang);
        expect(typeof value === 'string' && value.trim().length > 0, key).toBe(true);
      }
    }
  });

  it('interpolation variables match between languages', () => {
    for (const key of flattenKeys(en)) {
      const get = (o: Record<string, unknown>) =>
        key
          .split('.')
          .reduce<unknown>((acc, k) => (acc as Record<string, unknown>)[k], o) as string;
      expect(interpolations(get(pt)), key).toEqual(interpolations(get(en)));
    }
  });
});

import en from './en.json' with { type: 'json' };
import pt from './pt.json' with { type: 'json' };

import type { Language } from '../constants/index.ts';

export type TranslationResource = typeof en;

export const resources = {
  en: { translation: en },
  pt: { translation: pt satisfies TranslationResource },
} as const satisfies Record<Language, { translation: TranslationResource }>;

/** Flattens a nested resource into dot-separated keys ("tabs.explore"). */
export function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value !== null && typeof value === 'object'
      ? flattenKeys(value as Record<string, unknown>, path)
      : [path];
  });
}

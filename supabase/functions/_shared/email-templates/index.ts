// Localized Travelist emails (D-066): pick the copy for a kind and language, render HTML + text.
import { DEFAULT_LANGUAGE, type Language, languageSchema } from '@wayfarer/shared';

import type { CopyBook, EmailKind, EmailVars } from './copy.ts';
import { EN } from './en.ts';
import { type RenderedEmail, renderHtml, renderText } from './layout.ts';
import { PT } from './pt.ts';

export { EMAIL_KINDS, type EmailKind, type EmailVars } from './copy.ts';
export type { RenderedEmail } from './layout.ts';

const COPY: Record<Language, CopyBook> = { en: EN, pt: PT };

/**
 * A supported language, or English for anything else (missing metadata, an old client...).
 * @example resolveEmailLanguage('fr') // 'en'
 */
export function resolveEmailLanguage(value: unknown): Language {
  const parsed = languageSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_LANGUAGE;
}

/**
 * Renders one email in one language.
 * @example renderEmail('recovery', 'pt', { actionUrl }) // { subject, html, text }
 */
export function renderEmail(kind: EmailKind, language: Language, vars: EmailVars): RenderedEmail {
  const content = COPY[language][kind](vars);
  return {
    subject: content.subject,
    html: renderHtml(content, language),
    text: renderText(content),
  };
}

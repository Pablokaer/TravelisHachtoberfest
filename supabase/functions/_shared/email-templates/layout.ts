// One branded layout for every email, as HTML (inline styles: mail clients drop <style>) and as
// plain text. Every interpolated string is escaped here, so copy files stay plain text.
import type { Language } from '@wayfarer/shared';

/** The localized words of one email; the layout decides how they look. */
export type EmailContent = {
  subject: string;
  heading: string;
  paragraphs: string[];
  action?: { label: string; url: string };
  code?: { label: string; value: string };
  /** Small print under the body (e.g. "ignore this if it wasn't you"). */
  footnote: string;
};

export type RenderedEmail = { subject: string; html: string; text: string };

export const BRAND_NAME = 'Travelist';

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escapes text for HTML content and double-quoted attributes.
 * @example escapeHtml('<b>') // '&lt;b&gt;'
 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]!);
}

/** The app's primary colour (apps/mobile/src/theme/colors.ts), so emails look like Travelist. */
const BRAND_COLOR = '#D7383B';
const FONT = 'font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif';

function actionHtml(action: EmailContent['action']): string {
  if (!action) return '';
  const style =
    `display:inline-block;padding:12px 20px;border-radius:999px;background:${BRAND_COLOR};` +
    'color:#ffffff;text-decoration:none;font-weight:600';
  return `<p style="margin:24px 0"><a href="${escapeHtml(action.url)}" style="${style}">` +
    `${escapeHtml(action.label)}</a></p>`;
}

function codeHtml(code: EmailContent['code']): string {
  if (!code) return '';
  return `<p style="margin:16px 0">${escapeHtml(code.label)} ` +
    `<strong style="font-size:20px;letter-spacing:4px">${escapeHtml(code.value)}</strong></p>`;
}

function bodyHtml(content: EmailContent): string {
  const paragraphs = content.paragraphs.map((p) =>
    `<p style="margin:0 0 12px">${escapeHtml(p)}</p>`
  );
  return [
    `<h1 style="font-size:22px;margin:0 0 16px">${escapeHtml(content.heading)}</h1>`,
    ...paragraphs,
    actionHtml(content.action),
    codeHtml(content.code),
    `<p style="margin:24px 0 0;color:#6b7280;font-size:13px">${escapeHtml(content.footnote)}</p>`,
  ].join('\n');
}

/** The HTML part: a centred card with the brand name on top. */
export function renderHtml(content: EmailContent, language: Language): string {
  return `<!doctype html>
<html lang="${language}"><head><meta charset="utf-8"><title>${
    escapeHtml(content.subject)
  }</title></head>
<body style="margin:0;padding:24px;background:#f5f5f4;${FONT};color:#1c1917;line-height:1.5">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px">
<p style="margin:0 0 24px;font-weight:700;font-size:18px;color:${BRAND_COLOR}">${BRAND_NAME}</p>
${bodyHtml(content)}
</div></body></html>`;
}

/** The plain-text part, for clients that do not render HTML (and for spam scores). */
export function renderText(content: EmailContent): string {
  return [
    BRAND_NAME,
    '',
    content.heading,
    '',
    ...content.paragraphs.flatMap((p) => [p, '']),
    ...(content.action ? [`${content.action.label}: ${content.action.url}`, ''] : []),
    ...(content.code ? [`${content.code.label} ${content.code.value}`, ''] : []),
    content.footnote,
  ].join('\n');
}

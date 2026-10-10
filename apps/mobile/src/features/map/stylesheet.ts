// Loads a stylesheet from public/ at run time. Expo's static export links every CSS file Metro
// bundles — async chunks included — from every page, so maplibre's 83 kB sheet is served as a
// plain file instead and only the map adds it (D-062).

type StylesheetLink = {
  rel: string;
  href: string;
  onload: (() => void) | null;
  onerror: (() => void) | null;
};

/** What loadStylesheet needs of `document`, so tests can pass a fake. */
export type StylesheetDocument = {
  createElement(tag: 'link'): StylesheetLink;
  head: { appendChild(link: StylesheetLink): unknown };
};

// One request per page and sheet, however many maps open.
const requests = new WeakMap<StylesheetDocument, Map<string, Promise<void>>>();

function requestsOf(doc: StylesheetDocument): Map<string, Promise<void>> {
  let byHref = requests.get(doc);
  if (!byHref) requests.set(doc, (byHref = new Map()));
  return byHref;
}

/**
 * Adds `<link rel="stylesheet" href>` once and resolves when it has loaded — or failed, so a
 * missing sheet never keeps the map from opening.
 * @example await loadStylesheet('/maplibre/maplibre-gl.css');
 */
export function loadStylesheet(
  href: string,
  doc: StylesheetDocument = document as unknown as StylesheetDocument,
): Promise<void> {
  const byHref = requestsOf(doc);
  const known = byHref.get(href);
  if (known) return known;
  const request = new Promise<void>((resolve) => {
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = link.onerror = () => resolve();
    doc.head.appendChild(link);
  });
  byHref.set(href, request);
  return request;
}

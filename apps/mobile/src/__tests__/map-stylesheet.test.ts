import { loadStylesheet, type StylesheetDocument } from '@/features/map/stylesheet';

type FakeLink = {
  rel: string;
  href: string;
  onload: (() => void) | null;
  onerror: (() => void) | null;
};

/** The bits of `document` loadStylesheet touches: links it adds are kept, and can "load". */
class FakeStylesheetDocument implements StylesheetDocument {
  links: FakeLink[] = [];
  head = { appendChild: (link: FakeLink) => void this.links.push(link) };
  createElement(): FakeLink {
    return { rel: '', href: '', onload: null, onerror: null };
  }
}

const HREF = '/maplibre/maplibre-gl.css';

test('adds the stylesheet once and resolves when it has loaded', async () => {
  const doc = new FakeStylesheetDocument();
  const loaded = jest.fn();
  void loadStylesheet(HREF, doc).then(loaded);
  expect(doc.links).toEqual([expect.objectContaining({ rel: 'stylesheet', href: HREF })]);
  await Promise.resolve();
  expect(loaded).not.toHaveBeenCalled();
  doc.links[0]!.onload!();
  await Promise.resolve();
  expect(loaded).toHaveBeenCalled();
});

test('a second map reuses the same request', async () => {
  const doc = new FakeStylesheetDocument();
  const first = loadStylesheet(HREF, doc);
  const second = loadStylesheet(HREF, doc);
  expect(second).toBe(first);
  expect(doc.links).toHaveLength(1);
});

test('a stylesheet that fails to load does not hold the map back', async () => {
  const doc = new FakeStylesheetDocument();
  const done = loadStylesheet(HREF, doc);
  doc.links[0]!.onerror!();
  await expect(done).resolves.toBeUndefined();
});

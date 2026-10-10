// maplibre-gl v6 loads its Web Worker from a separate ES module that Metro does not bundle.
// Copy the worker (and the chunk it imports) into public/ so Expo serves it at /maplibre/.
// The stylesheet too: the map adds it when it opens, because a CSS import would be linked from
// every exported page (D-062).
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const dist = dirname(require.resolve('maplibre-gl/dist/maplibre-gl.mjs'));
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'maplibre');
mkdirSync(out, { recursive: true });
for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs', 'maplibre-gl.css']) {
  copyFileSync(join(dist, file), join(out, file));
}

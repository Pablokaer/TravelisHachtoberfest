// Serves the exported web app (D-093): its files, the page exported for a route (`/about` →
// `about.html`, `/short/lisbon` → `short/[slug].html`) and, for any other route, the app itself,
// which routes on the client. Nothing outside the site folder is ever served.
import { createReadStream, readdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.mjs': 'text/javascript; charset=utf-8',
  '.map': 'application/json',
  '.wasm': 'application/wasm',
};

/** The real file system, for `pageFor`. */
const realFs = {
  isFile: (path) => {
    try {
      return statSync(path).isFile();
    } catch {
      return false;
    }
  },
  list: (folder) => {
    try {
      return readdirSync(folder);
    } catch {
      return [];
    }
  },
};

function pathnameOf(url) {
  const raw = url.split('?')[0].split('#')[0];
  try {
    return decodeURIComponent(raw);
  } catch {
    return '/';
  }
}

/**
 * The file that answers a request, always inside `root`.
 * @param {string} root
 * @param {string} url
 * @param {{ isFile: (path: string) => boolean, list: (folder: string) => string[] }} fs
 * @example pageFor('/site', '/short/lisbon', fs) // '/site/short/[slug].html'
 */
export function pageFor(root, url, fs = realFs) {
  const index = join(root, 'index.html');
  const wanted = resolve(root, `.${pathnameOf(url)}`);
  if (wanted !== root && !wanted.startsWith(root + sep)) return index;
  if (fs.isFile(wanted)) return wanted;
  if (fs.isFile(`${wanted}.html`)) return `${wanted}.html`;
  const folder = resolve(wanted, '..');
  const template = fs.list(folder).find((name) => name.startsWith('[') && name.endsWith('].html'));
  return template ? join(folder, template) : index;
}

/**
 * @param {string} root
 * @returns {import('node:http').Server}
 */
export function createWebServer(root) {
  const base = resolve(root);
  return createServer((request, response) => {
    const file = pageFor(base, request.url ?? '/');
    response.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
    createReadStream(file)
      .on('error', () => {
        response.statusCode = 404;
        response.end('not found');
      })
      .pipe(response);
  });
}

// The page shown while the stack starts, and when it fails (D-093). Plain HTML in a data: URL.
const STEP_TEXT = {
  docker: 'Checking Docker…',
  provision: 'Preparing your data folder…',
  database: 'Starting the database (the first time downloads images, it can take several minutes)…',
  functions: 'Starting the route functions…',
  service: 'Starting the city service…',
  web: 'Starting the app…',
  ready: 'Ready',
};

const escapeHtml = (text) =>
  text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

const PAGE = (body) =>
  `<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;background:#0f1b2d;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;padding:24px;text-align:center"><h2>Travelist</h2>${body}`;

/** @param {string} step @param {string} [lastLine] @returns {string} a data: URL */
export function progressPage(step, lastLine = '') {
  const text = STEP_TEXT[step] ?? step;
  const detail = lastLine ? `<p style="opacity:.6;font-size:12px">${escapeHtml(lastLine)}</p>` : '';
  return `data:text/html;charset=utf-8,${encodeURIComponent(PAGE(`<p>${escapeHtml(text)}</p>${detail}`))}`;
}

/** @param {string} message @returns {string} a data: URL */
export function errorPage(message) {
  const body = `<p>Travelist could not start.</p><pre style="white-space:pre-wrap;text-align:left;max-width:640px">${escapeHtml(message)}</pre><p style="opacity:.6">Close this window and open the app again once it is fixed.</p>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(PAGE(body))}`;
}

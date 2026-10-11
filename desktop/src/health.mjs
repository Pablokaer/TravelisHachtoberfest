// Waiting for a program that is starting (D-093).
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Calls `check` every `intervalMs` until it is truthy. A check that throws counts as "not yet"
 * (a server that is not listening). Rejects naming `label` and the time waited.
 * @param {() => Promise<unknown>} check
 * @param {{ timeoutMs: number, intervalMs: number, label: string, sleep?: (ms: number) => Promise<void>, now?: () => number }} options
 * @example await waitUntil(() => httpOk('http://127.0.0.1:8787/health'), { timeoutMs: 30000, intervalMs: 500, label: 'the city service' })
 */
export async function waitUntil(
  check,
  { timeoutMs, intervalMs, label, sleep = defaultSleep, now = Date.now },
) {
  const deadline = now() + timeoutMs;
  for (;;) {
    if (await check().catch(() => false)) return;
    if (now() >= deadline) throw new Error(`${label} was not ready after ${timeoutMs} ms`);
    await sleep(intervalMs);
  }
}

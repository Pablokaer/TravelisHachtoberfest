// Small JSON-over-HTTP helper for third-party providers.

export const USER_AGENT = 'wayfarer/0.1 (+https://github.com/Pablokaer/travelist)';
export const DEFAULT_TIMEOUT_MS = 8000;

export class HttpError extends Error {
  constructor(
    readonly url: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(`HTTP ${status} from ${new URL(url).host}`);
    this.name = 'HttpError';
  }
}

export type FetchJsonOptions = {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  /** Serialised as JSON. */
  body?: unknown;
  timeoutMs?: number;
};

export type FetchJson = <T = unknown>(url: string, options?: FetchJsonOptions) => Promise<T>;

/** Fetches and parses JSON. Throws `HttpError` on non-2xx and a TimeoutError on timeout. */
export const fetchJson: FetchJson = async <T>(url: string, options: FetchJsonOptions = {}) => {
  const headers: Record<string, string> = {
    'User-Agent': USER_AGENT,
    Accept: 'application/json',
    ...options.headers,
  };
  if (options.body !== undefined) headers['Content-Type'] ??= 'application/json';
  const res = await fetch(url, {
    method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new HttpError(url, res.status, text.slice(0, 500));
  }
  return (await res.json()) as T;
};

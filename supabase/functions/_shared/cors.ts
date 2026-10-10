import { z } from 'zod';

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...corsHeaders, ...init.headers },
  });
}

export function handleOptions(req: Request): Response | null {
  return req.method === 'OPTIONS' ? new Response('ok', { headers: corsHeaders }) : null;
}

/** Error body shape shared by all functions: `{ error: <code>, message?: <details> }`. */
export function errorResponse(status: number, error: string, message?: string): Response {
  return json(message === undefined ? { error } : { error, message }, { status });
}

export const badRequest = (message: string): Response => errorResponse(400, 'bad_request', message);

export const notFound = (error: string, message?: string): Response =>
  errorResponse(404, error, message);

export const methodNotAllowed = (allowed: string[] = ['POST']): Response =>
  json(
    { error: 'method_not_allowed' },
    { status: 405, headers: { Allow: [...allowed, 'OPTIONS'].join(', ') } },
  );

export function internalError(err: unknown): Response {
  console.error(err);
  return errorResponse(500, 'internal_error');
}

/**
 * Reads a JSON body and validates it with a zod schema. Returns the parsed value or a ready
 * 400 response (with `z.prettifyError` details).
 */
export async function parseJsonBody<S extends z.ZodType>(
  req: Request,
  schema: S,
): Promise<{ ok: true; data: z.output<S> } | { ok: false; response: Response }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, response: badRequest('body must be valid JSON') };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, response: badRequest(z.prettifyError(parsed.error)) };
  return { ok: true, data: parsed.data };
}

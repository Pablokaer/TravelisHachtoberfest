// Health check used to verify the Edge Functions runtime locally and in CI.
//   curl http://127.0.0.1:54321/functions/v1/health
import { handleOptions, json } from '../_shared/cors.ts';

export function handler(req: Request): Response {
  return (
    handleOptions(req) ?? json({ ok: true, service: 'wayfarer', time: new Date().toISOString() })
  );
}

if (import.meta.main) {
  Deno.serve(handler);
}

// Entry point: wires ORS (when ORS_API_KEY is set) and the api_cache store.
//   POST /functions/v1/route-optimize  { stops: [{ id, lat, lng, visitMinutes }], keepFirst? }
import { requireUser, supabaseUserVerifier } from '../_shared/auth.ts';
import { createCached, supabaseCacheStore } from '../_shared/cache.ts';
import { env } from '../_shared/env.ts';
import { fetchJson } from '../_shared/http.ts';
import { serviceClient } from '../_shared/supabase.ts';
import { createHandler } from './handler.ts';
import { createOrsRouting } from './routing.ts';

export function defaultHandler(): (req: Request) => Promise<Response> {
  const client = serviceClient();
  const apiKey = env.orsApiKey();
  return requireUser(
    supabaseUserVerifier(client),
    createHandler({
      ors: apiKey ? createOrsRouting({ apiKey, fetchJson }) : null,
      cached: createCached(supabaseCacheStore(client)),
    }),
  );
}

if (import.meta.main) {
  Deno.serve(defaultHandler());
}

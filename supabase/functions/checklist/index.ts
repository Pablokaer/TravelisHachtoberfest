// Entry point: wires the real providers. Logic lives in handler.ts (tested with fakes).
//   POST /functions/v1/checklist  { city, nationalities, homeCountry?, arrival?, departure?, ... }
import { requireUser, supabaseUserVerifier } from '../_shared/auth.ts';
import { createCached, supabaseCacheStore } from '../_shared/cache.ts';
import { env } from '../_shared/env.ts';
import { fetchJson } from '../_shared/http.ts';
import { serviceClient } from '../_shared/supabase.ts';
import { supabaseChecklistDb } from './db.ts';
import { createHandler } from './handler.ts';
import { createFx, createGacAdvisory, createOpenMeteo } from './providers.ts';

export function defaultHandler(): (req: Request) => Promise<Response> {
  const client = serviceClient();
  const cached = createCached(supabaseCacheStore(client));
  return requireUser(
    supabaseUserVerifier(client),
    createHandler({
      db: supabaseChecklistDb(client),
      weather: createOpenMeteo({ fetchJson, cached }),
      fx: createFx({ fetchJson, cached, frankfurterBaseUrl: env.exchangeRatesBaseUrl() }),
      advisory: createGacAdvisory({ fetchJson, cached }),
      now: () => new Date(),
    }),
  );
}

if (import.meta.main) {
  Deno.serve(defaultHandler());
}

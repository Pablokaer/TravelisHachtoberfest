# Wayfarer — Architecture

Wayfarer is a cross-platform travel companion (iOS, Android, Web from one codebase). This document describes how the pieces fit together. Decisions and their alternatives live in [DECISIONS.md](./DECISIONS.md); data provenance and licences in [DATA_SOURCES.md](./DATA_SOURCES.md).

## 1. System overview

```
┌──────────────────────────── apps/mobile (Expo, Expo Router) ────────────────────────────┐
│  iOS · Android · Web                                                                     │
│  UI (React Native) ── TanStack Query (server state) ── Zustand (client state)            │
│  i18next (EN/PT) · react-hook-form + zod · <MapView> (.native → MapLibre RN,             │
│                                                        .web    → maplibre-gl)            │
└───────────────┬───────────────────────────────┬──────────────────────────────────────────┘
                │ supabase-js (anon key + JWT)   │ map style / tiles (public URL)
                ▼                                ▼
┌──────────────────────────── Supabase ───────────────────┐   ┌──────────────────────────┐
│ Auth (email, magic link, Apple, Google)                  │   │ OpenFreeMap / MapTiler    │
│ Postgres + PostGIS  ── RLS on every table                │   └──────────────────────────┘
│   · reference data (countries, cities, attractions,      │
│     visa_requirements, travel_advisories) read-only      │
│   · user data (profiles, nationalities, trips) owner-only│
│   · RPC attractions_in_view(...)                         │
│ Edge Functions (Deno) ── api_cache table                 │──►  OpenRouteService (routing)
│   · route-optimize · checklist · weather                 │──►  Open-Meteo (weather)
│                                                          │──►  FX rates, travel advisories
│ Storage (reserved; images are hot-linked from Commons)   │
└──────────────────────────▲───────────────────────────────┘
                           │ service role (upserts)
┌──────────────────────────┴───── data-pipeline (Python) ─────────────────────────────────┐
│ cities.yaml → Wikidata SPARQL + Overpass + Wikipedia Pageviews → dedupe → score → upsert │
│ country seed CSV · passport-index visa CSV · per-city quality report                      │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

## 2. Repository layout

| Path                  | Purpose                                                                                                                                                                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/mobile`         | Expo app. Routes in `src/app` (Expo Router); everything else in `src/{components,features,lib,hooks,theme}`.                                                                                                                     |
| `packages/shared`     | Pure TypeScript shared by the app and Edge Functions: zod schemas, domain types, constants, i18n resources, pure domain logic (visa best option, passport validity, opening hours, route fallback…). No React, no platform APIs. |
| `packages/ui`         | Reserved for shared UI primitives if a second app appears. Not created yet (keep lean).                                                                                                                                          |
| `supabase/migrations` | Ordered SQL migrations (schema, PostGIS, RLS, indexes, RPCs).                                                                                                                                                                    |
| `supabase/functions`  | Deno Edge Functions. `_shared/` holds CORS, caching and env helpers.                                                                                                                                                             |
| `supabase/seed`       | Seed SQL/CSV (countries, plugs, visa data).                                                                                                                                                                                      |
| `supabase/tests`      | pgTAP tests (RLS policies, RPCs), run with `supabase test db`.                                                                                                                                                                   |
| `data-pipeline`       | Python ingestion package + `cities.yaml`.                                                                                                                                                                                        |
| `docs`                | Architecture, data sources, decisions.                                                                                                                                                                                           |

## 3. App architecture

**Routing (Expo Router).**

```
src/app/
  _layout.tsx            root providers (i18n, theme, TanStack Query, auth gate from M1)
  (tabs)/_layout.tsx     Explore · Trips · Profile
  (tabs)/index.tsx       Explore: destination picker + map (M2), checklist drawer (M3)
  (tabs)/trips.tsx       My Trips (M4)
  (tabs)/profile.tsx     profile, language, about
  about.tsx              About / Data sources (attribution)
  (auth)/…               sign-in, sign-up, magic link, onboarding (M1)
```

**Feature folders.** Non-route code is grouped by feature under `src/features/<feature>/` (`auth`, `profile`, `destinations`, `map`, `checklist`, `route`, `trips`), each with its own `api.ts` (queries/mutations), components and hooks. Cross-cutting code lives in `src/lib/` (`env`, `supabase`, `i18n`, `observability`, `query-client`).

**State.**

- _Server state_ → TanStack Query. Query keys are namespaced per feature. From M2 the cache is persisted with MMKV (last city's attractions + saved trips) for offline-lite.
- _Client state_ → Zustand stores (route tray, selected city, map filters). Stores never hold server data.
- _Forms_ → react-hook-form + zod resolvers using schemas from `@wayfarer/shared`.

**Platform splits.** Platform-specific files use Metro's extension resolution (`MapView.native.tsx` / `MapView.web.tsx`, `BottomSheet.native.tsx` / side panel on web). The shared component contract lives in a `.types.ts` file next to them.

**Theming & accessibility.** Light/dark tokens in `src/theme`; all interactive elements get `accessibilityRole` + `accessibilityLabel`, min 44 pt touch targets, text scales with system font size.

**i18n.** Resources live in `packages/shared/src/i18n/{en,pt}.json` so Edge Functions can localise messages too. A unit test enforces key parity between languages. Language = profile preference → device locale → `en`.

**Configuration.** Only `EXPO_PUBLIC_*` variables reach the client, validated at startup by a zod schema (`src/lib/env.ts`). Missing optional keys (Sentry, PostHog) turn the integration into a no-op.

## 4. Backend architecture

**Database.** Postgres with PostGIS. Every table has RLS enabled. Reference tables are `select`-able by `anon` and `authenticated`; writes only via the service role (pipeline). User tables are restricted to `auth.uid()` ownership. `updated_at` is maintained by a shared trigger (`public.set_updated_at`). Spatial queries use `geography(Point, 4326)` with GiST indexes; the map loads attractions by viewport through `attractions_in_view(...)`.

**Edge Functions.** All third-party calls with secrets or rate limits (ORS, weather, FX, advisories) go through Edge Functions:

1. validate input with the shared zod schema,
2. look up `api_cache` (key = hash of normalised input),
3. call the provider, normalise the response, store it with a TTL,
4. return a typed payload; on provider failure, return a degraded but valid answer where the spec defines one (e.g. nearest-neighbour route fallback).

TTLs: weather 3 h, advisories 24 h, FX 24 h, routes 30 days (input-hashed, deterministic).

**Providers behind interfaces.** `VisaProvider` (passport-index CSV now, Sherpa/Timatic later), routing (`RoutingProvider` → ORS), weather, FX. Swapping a provider must not change the app.

## 5. Data pipeline

`data-pipeline/cities.yaml` is the single source of truth for launch cities. The pipeline (M2) is idempotent and resumable:

1. **Wikidata SPARQL** by city area/bbox and category → labels (en/pt), coordinates, description, Commons image, UNESCO, website, OSM id.
2. **Overpass** for `tourism=*` / `historic=*` → opening hours, fee.
3. **Wikipedia Pageviews** (12 months, en+pt) → log-scaled 0–100 popularity per city.
4. **Deduplicate** (OSM id link, else name similarity + < 75 m).
5. **Commons metadata** → image author + licence.
6. Default `avg_visit_minutes` per category.
7. **Upsert** by `wikidata_id` with the service role; print a per-city quality report.

Raw responses are cached on disk (`data-pipeline/.cache`) during development; requests carry a descriptive User-Agent and are rate-limited.

## 6. Security & privacy

- Client holds only the anon key and a public map style URL. All secrets live in Edge Function env.
- Tokens stored with `expo-secure-store` on native; Supabase's default storage on web.
- No passport numbers or document scans are ever stored. Passport expiry is optional.
- Account deletion removes the profile and all owned rows (FK `on delete cascade` from `auth.users`).
- Analytics events carry no personal data; Sentry scrubs PII.

## 7. Testing strategy

| Layer             | Tool                                              | Where                   |
| ----------------- | ------------------------------------------------- | ----------------------- |
| Shared pure logic | Vitest                                            | `packages/shared`       |
| React components  | Jest (`jest-expo`) + React Native Testing Library | `apps/mobile`           |
| RLS / SQL / RPC   | pgTAP via `supabase test db`                      | `supabase/tests`        |
| Edge Functions    | `deno test`                                       | `supabase/functions/**` |
| Pipeline          | pytest + ruff                                     | `data-pipeline`         |
| E2E (web)         | Playwright                                        | `apps/mobile/e2e`       |

CI (GitHub Actions) runs format check, lint, typecheck, unit tests and a web export on every push; a separate job runs the database tests against a local Supabase stack; a Python job lints and tests the pipeline.

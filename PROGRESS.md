# Progress

Milestones from the MVP brief. Each milestone ends with lint, typecheck and all tests green, an update here, and a Conventional Commit.

| Milestone                        | Scope                                                                                                           | Status               |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------- |
| **M0 – Scaffold**                | Monorepo, Expo app on iOS/Android/Web, local Supabase, CI, `.env.example`                                       | ✅ Done (2026-09-26) |
| **M1 – Auth and profile**        | Email/password, magic link, Apple, Google; onboarding; profile CRUD; RLS + tests                                | ✅ Done (2026-09-28) |
| **M2 – Data and map**            | Migrations, ingestion (Lisbon first, then 12 cities), country seed, map + filters + detail sheet, city switcher | ✅ Done (2026-09-28) |
| **M3 – Checklist drawer**        | Visa, power, weather, money, safety, practical; edge functions + caching                                        | ✅ Done (2026-09-28) |
| **M4 – Route builder and trips** | `route-optimize`, route UI, save/list trips, navigation deep links                                              | ✅ Done (2026-09-28) |
| M5 – Polish and QA               | i18n completeness, accessibility, empty/error states, E2E, README                                               | 🟡 Mostly done       |

## M0 — Done

- pnpm workspaces + Turborepo (`lint`, `typecheck`, `test`, `build:web`), Prettier, EditorConfig, Node 22.
- `apps/mobile`: Expo SDK 57, Expo Router, typed routes, React Compiler; tabs (Explore / My Trips / Profile) + About (data sources) + 404; light/dark theme tokens; EN/PT via i18next with device-locale detection and a working language switch; zod-validated public env; TanStack Query provider; observability facade (no-op without keys).
- `packages/shared`: constants (categories, default visit minutes, visa enum, route limits), base zod schemas, EN/PT resources with key-parity tests.
- `supabase/`: CLI config (redirect URLs for web + `wayfarer://`), migration enabling PostGIS + `set_updated_at()`, pgTAP smoke tests (incl. "RLS enabled on every public table"), `health` Edge Function with Deno tests.
- `data-pipeline/`: Python package, validated `cities.yaml` with all 12 launch cities (ids/centres/bboxes from Wikidata + Nominatim), CLI (`validate-config`, `ingest` stub), pytest + ruff.
- CI: app (format, lint, typecheck, unit, web export, Playwright), database (migrations, pgTAP, `db lint`), functions (deno lint/fmt/test), pipeline (ruff, pytest).
- Security CI (D-049): CodeQL (TS/JS, Python), dependency review, gitleaks, pnpm audit + pip-audit, actionlint — on every PR, on `main` and weekly.
- Docs: README, ARCHITECTURE, DECISIONS (D-001…D-010), DATA_SOURCES.

**Verified locally (cloud dev container):** `pnpm check` green (Jest 5 tests, Vitest 6 tests), `expo export -p web` OK, Playwright 4/4 (desktop + mobile viewport), `supabase start` + `supabase test db` 4/4, `health` function responds via the local gateway, `supabase db lint` clean, pytest 8/8, deno test 2/2.

**Not verified here:** iOS simulator and Android emulator runs (need macOS/Android tooling) — run `pnpm dev` and press `i` / `a`.

## M1–M4 — Done (2026-09-28)

- **Database:** reference tables (countries, cities, attractions with PostGIS, visa rules, api_cache) and user tables (profiles, nationalities, trips, trip stops) with RLS; RPCs `attractions_in_view`, `set_nationalities`, `save_trip`, `delete_account`; profile created on sign-up; pgTAP: 24 tests.
- **Data:** 250 countries (plugs, voltage, currency, calling code, emergency numbers, languages), 198 cities in 52 countries (12 at launch + 68 added 2026-09-28 + 118 added 2026-10-03, 197 active; list in [docs/CITIES.md](./docs/CITIES.md)), 39,402 visa rules, 22,756 attractions (≤ 300 per city) with images, licences, opening hours and popularity. Committed as SQL seeds (D-011).
- **Edge Functions:** `checklist` (visa, passport validity, power, Open-Meteo weather, FX, Canada advisories, practical info, each degrading independently, cached) and `route-optimize` (ORS + fallback). Both require a signed-in user (D-015). Deno: 40 tests.
- **App:** email/password, magic link + 6-digit code, Google/Apple (PKCE; native Apple on iOS), protected routes, 3-step onboarding, profile edit, language/units, account deletion; Explore with MapLibre map (web + native), city switcher, category filters, accessible list view, attraction detail with image credit; checklist screen; route tray (≤ 12 stops at the time; 20 since D-030), optimisation, totals, save trip; My Trips list/detail/delete with Google/Apple Maps walking links. Jest: 12 tests. Playwright: smoke + full journey (sign-up → onboarding → checklist → route → saved trip) on desktop and mobile viewports.
- **Verified locally (macOS, 2026-09-28):** `pnpm check`, `pnpm db:test`, `supabase db lint`, Deno lint/fmt/test, pytest (76) + ruff, `pnpm build:web`, `E2E_BACKEND=1 pnpm e2e` 6/6, map rendering on web (screenshots), live checklist for Lisbon with real providers.

## 2026-09-28 — 20 more cities

Berlin, Venice, Florence, Munich, Dublin, Athens, Budapest, Edinburgh, Brussels, Copenhagen, Stockholm, Nice, Seville, Kraków, Warsaw, Naples, Valencia, Zurich, Antalya, Oslo (same limits and filters as the launch cities). Fixes found on the way: YAML `NO` → `false` (quoted + test); GR/PL/SE language overrides; category roots for sculptures, parliament buildings and promenades, and archaeological ruins no longer dropped as "destroyed structures" (Parthenon); class-root cache invalidated when roots change; HTTP client wall-clock deadline (WDQS trickling responses hung ingestion for > 1 h). Cities below the 300 cap have fewer notable places in their area: Nice 64, Antalya 28.

## 2026-09-28 — 20 more cities (batch 3)

Hamburg, Frankfurt, Cologne, Geneva, Salzburg, Bruges, Antwerp, Rotterdam, Helsinki, Reykjavík, Tallinn, Riga, Vilnius, Dubrovnik, Split, Ljubljana, Bratislava, Palma, Málaga, Bologna. Hamburg and Palma use centre-based bboxes (boundaries include a North Sea island / open sea). LT and SI country overrides. Concert halls added as a category root (Elbphilharmonie); all 52 cities re-ingested under the same rules. Most of these cities are smaller: only Helsinki reaches the 300 cap; Dubrovnik has 40. Known gap: Riga's House of the Blackheads is typed only as "building" on Wikidata, too generic to include.

## 2026-09-28 — 8 more cities (batch 4: EU and UK capitals)

Sofia, Zagreb, Nicosia, Luxembourg, Valletta, Bucharest, Cardiff, Belfast — with these, every EU member state's capital and every UK nation capital is covered (asserted by `test_all_eu_and_uk_capitals_are_covered`). Valletta (1 km² municipality) and Cardiff (Nominatim returned a node) use centre-based bboxes. City halls added as a category root; all 60 cities re-ingested (+35 attractions in existing cities). CY override: 1400 is not an emergency line. Smaller cities: Nicosia 47, Belfast 76, Luxembourg 92, Sofia 98.

## 2026-09-28 — 20 more cities (batch 5: secondary cities)

Lyon, Marseille, Bordeaux, Turin, Verona, Pisa, Granada, Bilbao, Córdoba, Manchester, Liverpool, Glasgow, York, Gdańsk, Wrocław, Dresden, Innsbruck, Ghent, Bergen, Gothenburg — no new countries. Córdoba (1,250 km² mostly rural municipality) and Gothenburg (municipality includes the outer archipelago) use centre-based bboxes; Manchester, Liverpool and York OSM relations came from Nominatim (no P402 on Wikidata). Fix: items with a second Wikidata coordinate in another city are seeded where OSM confirms them (Madrid Arena). French communes are small, so counts are low: Bordeaux 58, Marseille 85. Known gaps: Bergen's Bryggen is typed "architectural ensemble" (too broad to include: its subclasses cover hamlets and schools); Marseille's Vieux-Port is a seaport.

## 2026-09-28 — UI redesign (D-020)

Design system (tokens, Inter, shared components with hover/focus/press/loading states) and every screen reworked: Explore card grid with floating Map/List switch and route tray, attraction hero with sticky CTA, desktop map-beside-list for route and trip detail, card grid for trips, grouped profile, two-column checklist, centred auth. Bottom tabs on phones, side rail on desktop. Verified on web at desktop and phone widths (unit tests + full E2E journey); native rendering not yet checked.

## 2026-09-29 — Attraction reviews (D-028)

1–5 star ratings with optional comments on every attraction, average + count next to the name, one review per user (edit / delete own only). Postgres table with RLS, `save_review` / `list_attraction_reviews` RPCs and `attraction_rating_summary` view; 24 pgTAP tests, unit/component tests and an E2E journey (publish → edit → delete) on web.

## 2026-09-29 — Photo markers on the city map (D-029)

Places on the city map are round photo markers; a first tap opens the compact List card over the map (+ adds to the route, tapping the card opens the place). Unit/component tests plus an E2E journey on desktop and phone widths.

## 2026-09-29 — Up to 20 stops per route (D-030)

Routes hold 2–20 stops (was 12): tray, `route-optimize` schema, `save_trip` and `trip_stops` (migration). Exact order up to 12 stops, nearest neighbour + 2-opt for 13–20; the split keeps ≤ 6 routes with work caps. Tests at every layer and an E2E that fills a route to 20, sees the 21st refused and saves the trip.

## 2026-09-29 — Walk list visibility and sharing (D-031)

Saved trips are private (default), public or password-protected; the owner switches between them and shares the link (`/shared?id=…`), which opens read-only for anyone allowed, signed in or not. pgTAP: 28 tests (RLS, hashes unreadable, owner-only changes, anon access); unit/component tests; an E2E that goes private → public (link copied and opened signed out) → password (wrong, then right) → private, on desktop and phone widths.

## 2026-09-29 — Rating filter on city pages (D-032)

★ 3+ / 4+ / 5+ tabs after the category tabs keep only places whose average rating reaches the minimum (grid, map, count); unrated places are hidden while one is active. Unit/component tests; verified with `pnpm check`, not yet on a device.

## 2026-09-29 — City page hub, community walk lists, city reviews (D-033 – D-036)

Home cards open the city page `/short/{slug}` (hero, Wikipedia About, community and official walk lists, Before you go, reviews); **Explore attractions** leads to the unchanged `/city/{slug}`. Reviews generalised to cities and walk lists (`reviews` table); public lists are listed, searched, sorted and saved (`list_walklists`, `saved_trips`); moderators mark lists official. pgTAP: 43 new tests (129 in all); pipeline: 6 new tests; app: unit/component/router tests (215 in all); E2E: `city-page.spec.ts` (city review, a public list found, saved and rated by a second traveller) on desktop and phone widths.

## 2026-09-29 — Demo community data (D-037)

`pnpm db:demo <city>` loads local test data for the city page feed: six friends writing in EN/ES/FR plus a "Wayfarer Team" moderator. Done: **Amsterdam**, with 6 city reviews, 35 reviews of 10 places, 9 community and 4 official walk lists, 42 list ratings and 12 saves, checked by `amsterdam.check.sql`. Next: the other cities, one `supabase/demo/<city>.sql` + `.check.sql` each.

## 2026-09-29 — Walk list cover photo (D-038)

Walk list cards (My Trips, city page, View all) show the starting point's photo with its credit, through `walklist_cover(trip)`, which `list_walklists` returns and My Trips reads as a computed column. pgTAP: 6 new tests (135 in all); app: 6 new tests (221 in all). Checked in the web app with the Amsterdam demo data.

## 2026-09-29 — Profile photo (D-039)

Users add, change and remove a profile photo on Edit profile. It is cropped to a square, resized to 512 px and uploaded to the public `avatars` bucket (per-user folder policies), and shown on the Profile screen and next to their reviews. pgTAP: 9 new tests (144 in all); app: 10 new tests (231 in all). Verified on web: upload, change (old file deleted), remove, and the photo on another user's view of the reviews. Next: check the native picker on iOS/Android; the author photo on walk list cards.

## 2026-09-29 — Walk meetups (D-041)

Walk lists can have a date and time (city time); the city page ranks the next public meetups with a countdown, `/short/{slug}/meetups` lists them by day, and travellers say "I'm going". pgTAP: 27 new tests (184 in all); shared: time-zone and countdown tests (DST included); app: 254 tests; E2E: a meetup created by one traveller and joined by another, desktop and phone widths.

## 2026-09-29 — Scheduled data refresh and data gate (D-042)

- **Monthly** refresh of countries, visa rules, city texts and attractions as a pull request, behind a data gate that restores texts, photos and facts that got worse and blocks big losses. The same gate runs in CI on every PR.
- **Weekly** live check of the weather, exchange-rate and advisory providers.
- **Tests:** pipeline 24 new (128 in all), Edge Functions 3 new.
- **Verified locally:** the gate on real data with injected damage (disambiguation text, a Q-id name, a lost photo, lost plugs, Porto −40%), a real `city-summaries` fetch with gate and seed in a scratch worktree, and the live check against the real APIs. The workflows pass `actionlint` but have not run on GitHub yet (no remote).
- **Next:** a maintained visa source; publishing merged data to the hosted project.

## 2026-09-29 — Walk list group chat (D-043)

Going to a meetup opens its group chat with the organiser and everyone else going; messages arrive instantly through Supabase Realtime (RLS-checked per subscriber). pgTAP: 21 new tests (205 in all); app: 263 tests; E2E: two browsers exchange messages without reloading, desktop and phone widths (26 E2E in all).

## 2026-09-29 — Walk list participation and chat audit (D-044)

Reproduced with three users: lost Realtime events hid messages (root cause), joining was not idempotent and failed silently, and lists without a future time could not be joined. Fixed with server reconciliation (re-read on open/focus/every 10 s), `set_walk_attendance`, joining any public list and a participants list. pgTAP: 34 new tests (239 in all); app: 275 tests; E2E: three browsers share one live chat that survives a reload (28 E2E in all); validated with Realtime restarted and stopped.

## 2026-09-29 — Public traveller profiles (D-045)

Authors' names on reviews and chat messages open their public profile (photo, name, member since, public walk lists) by a public id that is not the account id. pgTAP: 16 new tests (255 in all); app: 283 tests; E2E: a chat author and a reviewer opened by another traveller, desktop and phone widths (30 E2E in all).

## 2026-09-29 — Walking routes along the streets (D-046)

Straight-line routes reproduced (ORS optimisation over quota: 403) and fixed with a cascade: optimisation → local order + ORS foot-walking directions → straight lines only as a last resort; three real-API issues found and covered by regression tests (406 without the GeoJSON Accept, 404 for stops far from a footway, no segments without instructions). Manual order is kept. Deno: 56 tests; app: 288; E2E: a route checked on the real ORS and on the map (32 E2E in all).

## 2026-09-29 — Free and Premium plans, first version (D-047)

`plans` (the single source of the limits) and `subscriptions` (history, status, provider ids) tables; Free: 5 lists, 5 places per list, no deleting; Premium: €5/month, unlimited, deletes own lists. Enforced by database triggers and `delete_trip`; the app explains the limits (Upgrade, Plans page, Settings → Subscription). No payments yet. pgTAP: 31 new tests (286 in all); shared: plan rules; app: 312 tests; E2E: Free limits in the app and the database, then Premium (34 E2E in all).

## 2026-09-29 — Nicknames (D-048)

- **What:** a nickname at sign-up (or in onboarding and Edit profile), sign-in with **Email or nickname**, and `@nickname` on every walk chat message, yours included.
- **Tests:** pgTAP 19 new, shared 4 new, app 13 new or updated (325 in all).
- **Verified on web:** Lucía signed in as `Lucia` and Emma as `emma`; each sees their own messages as `@nickname` and the other's replies with that person's nickname.

## 2026-10-03 — Performance audit and fixes (D-050 – D-060)

- **Measured first** (production web build, local stack, rolled-back load tests in Postgres), then fixed with tests: photos at the width they are shown (Home 11.1 → 1.35 MiB before scrolling), category filters on the device, Edge Function tokens verified locally plus a memory cache and parallel reads (warm checklist 30 → 6.8 ms), rating totals kept by triggers (walk list previews 85–210 → 0.5 ms at 20k lists), incremental chat re-reads, trip pages in one request, zod locales and fonts out of the web start (bundle 2,752 → 2,383 KiB, fonts 2.28 MB → 460 KiB), a faster exact walking order with identical results, and cities ingested side by side.
- **Corrected:** the audit's map finding did not hold once measured with GPU rendering and warm tiles (300 photo markers pan at 60 fps); the 60-marker cap was reverted and only memoised markers kept (D-051).
- **Tests:** pgTAP 18 files (335), app 50 suites (359), shared 117, Edge Functions 65, pipeline 130.
- **Next:** profile iOS/Android (Hermes, MapLibre native markers) on devices; "Suggest a split" still blocks the JS thread for up to ~1.7 s at 20 stops; switch the hosted project to asymmetric JWT keys so tokens are verified locally there too.

## 2026-10-03 — Performance audit, second pass (D-061 – D-064)

- **Database:** walk list pages, sorts, saved lists, reviews and rating summaries read only what they show (offset 1000 ~100 → ~2 ms, saved 36 → 0.5 ms, a list's reviews 9 → 0.2 ms), with identical results; the chat's people update on join/leave instead of a 30 s poll.
- **App:** 60 px marker photos (~2.5 → ~1.0 MiB per city), search indexed once per city, attraction header from cache, city places preloaded, one card re-render per stop toggle, one minute clock for countdowns, MapLibre CSS only with the map.
- **Edge Functions:** cache writes after the response, a circuit breaker for ORS and failing slow sources, one forecast call per place and day.
- **Pipeline:** ~47% fewer Wikidata queries per full run (same output), 90 s Wikidata timeout, 2 parallel queries, class cache kept in CI.
- **Next:** check the chat's live join/leave announcements in a browser and on devices; decide on removing reanimated / worklets / gesture-handler with a native build (D-062).

## 2026-10-03 — Chat and paid plans hidden, limits lifted, email service (D-065, D-066)

- **Product (D-065):** walk group chat and paid plans UI hidden behind `EXPO_PUBLIC_FEATURE_*` flags (code and backend kept); Free-plan limits lifted in the database and the app — unlimited lists, 20 places per list, owners delete their lists.
- **Email (D-066):** welcome email in the user's language after onboarding; password recovery end to end (**Forgot password?** → email with link → new password → signed in); every auth email goes through our `auth-email` function (Send Email Hook) to Resend (production) or Mailpit (local). Verified locally with Playwright and Mailpit (PT welcome, EN reset, magic link with code).
- **Next:** Resend account + verified domain and the hosted Send Email Hook (LAUNCH_CHECKLIST #8); universal links so `wayfarer://` email links are clickable on iOS/Android.

## 2026-10-03 — 20 more cities (batch 6: Balkan capitals and secondary cities)

Belgrade, Sarajevo, Thessaloniki, Strasbourg, Toulouse, San Sebastián, Toledo, Santiago de Compostela, Siena, Genoa, Palermo, Coimbra, Heidelberg, Nuremberg, Lucerne, Bern, Bath, Oxford, Brașov, Utrecht — 1,939 attractions (1,859 with a photo); Serbia and Bosnia and Herzegovina are new countries (100 cities in 34 countries, 16,161 attractions). Bath and Brașov OSM relations came from Nominatim (no P402 on Wikidata); Utrecht's Wikidata country is the Kingdom of the Netherlands, so its code was set to NL. Fix: Belgrade's Cyrillic file names made a Commons request too long (HTTP 414); oversized batches are now split. Small municipalities give low counts: Lucerne 31, Brașov 43, Santiago de Compostela 48. Brașov's English Wikipedia lead is a single short sentence.

## 2026-10-03 — 7 more cities (batch 7: microstates and Eastern Europe)

Monaco, Andorra la Vella, Kyiv, Lviv, Moscow, Saint Petersburg, Minsk — Monaco, Andorra, Ukraine, Russia and Belarus are new countries (107 cities in 39 countries, 17,358 attractions; 1,197 new, 1,159 with a photo). Kyiv, Moscow and Saint Petersburg hit the 300 cap (409, 1,117 and 909 candidates). Moscow uses a centre-based bbox (the MKAD ring: since 2012 the city is 2,562 km², mostly rural); Monaco a land-only bbox (its OSM boundary reaches 25 km out to sea). Microstates are small: Monaco 28, Andorra la Vella 17; known gaps: the Monte Carlo Casino and Andorra's Casa de la Vall are not in an attraction category. The checklist's Safety section shows "Avoid all travel" for Russia, Ukraine and Belarus (Government of Canada advisory), as it should.

## 2026-10-03 — Beyond Europe: Morocco, Asia and Brazil (batches 8 and 9, D-067, D-068)

- **Batch 8 (40 cities, 12 new countries):** Marrakech 42, Fez 54, Casablanca 25, Rabat 34, Tangier 24, Yangon 43, Mandalay 24, Bangkok 300, Chiang Mai 63, Phuket 13, Phra Nakhon Si Ayutthaya 26, Phnom Penh 23, Siem Reap 51, Hanoi 62, Ho Chi Minh City 58, Huế 24, Hội An 7, Da Nang 15, Vientiane 15, Luang Prabang 18, Kuala Lumpur 77, George Town 46, Malacca 50, Jakarta 100, Yogyakarta 49, Ubud 13, Manila 128, Cebu City 20, Beijing 250, Shanghai 128, Xi'an 41, Hangzhou 51, Chengdu 35, Taipei 204, Tainan 49, Tokyo 300, Kyoto 266, Osaka 152, Nara 110, Hiroshima 38 — 3,028 attractions (2,683 with a photo).
- **Batch 9 (51 cities):** Brazil's 50 most visited cities (Ministry of Tourism / Embratur, Braztoa yearbook, top domestic destinations) and Petrolina: Rio de Janeiro 300, São Paulo 300, Foz do Iguaçu 17, Salvador 300, Florianópolis 90, Armação dos Búzios 5, Recife 90, Fortaleza 64, Natal 39, Porto Alegre 156, Brasília 62, Belo Horizonte 93, Curitiba 77, Manaus 41, Maceió 23, Porto Seguro 8, Ipojuca 9, Balneário Camboriú 4, Gramado 11, Canela 11, Campos do Jordão 11, Ouro Preto 53, Paraty 24, Bonito 4, João Pessoa 33, Aracaju 18, São Luís 57, Belém 127, Fernando de Noronha 13, Jijoca de Jericoacoara 6, Angra dos Reis 18, Arraial do Cabo 12, Cabo Frio 12, Petrópolis 23, Ilhabela 9, Ubatuba 26, Santos 64, Tiradentes 9, Olinda 31, Ilhéus 15, Maragogi 0, Caldas Novas 2, Pirenópolis 11, Bento Gonçalves 2, Lençóis 21, Barreirinhas 3, Aparecida 7, Vitória 51, Mata de São João 2, Alto Paraíso de Goiás 1, Petrolina 5 — 2,370 attractions (1,983 with a photo).
- **Nature category (D-068)** for beaches, waterfalls, national parks, caves, islands, mountains…: 505 of the new attractions (Copacabana, Sugarloaf, Corcovado, Tijuca, Noronha's marine park). Madrasas, old towns and medinas are landmarks.
- **Bounding boxes:** centre-based where municipalities are huge or reach offshore (Beijing, Shanghai, Xi'an, Tokyo, Hanoi, São Paulo, Brasília, Manaus, Vitória…), some including nearby sights visitors reach from the city (Great Wall, Terracotta Army, Angkor, Prambanan) — commented in `cities.yaml` (D-067).
- **Known gap:** Wikidata covers small tourist towns thinly (candidates need a Wikipedia article): Maragogi has none and is inactive; Alto Paraíso 1, Caldas Novas 2, Bento Gonçalves 2, Mata de São João 2, Barreirinhas 3, Bonito 4, Balneário Camboriú 4, Phuket 13, Hội An 7. A second source (OSM natural features and attractions) would fill them.

## 2026-10-05 — Wikipedia stories on city and attraction pages (D-070, Europe)

- **City pages:** the whole introduction of the city's article plus a **History** excerpt, with **Read the full article on Wikipedia**, for the 105 European cities (104 with History in English, 89 in Portuguese).
- **Attraction pages:** introduction and History excerpt instead of the one-line description for 12,947 of 17,262 European places (churches 2,075 of 3,283 with a story); the rest keep the description. New columns `cities.history_*`, `attractions.summary_*` / `history_*`.
- **Pipeline:** `city-summaries --region/--city`, new `attraction-texts` (15,428 article requests, about 80 minutes).
- **Next:** the other regions (`attraction-texts --all`); attraction texts in the monthly refresh and the data gate.

## 2026-10-05 — Famous people on the city page (D-071)

- **City page:** "Famous people of {city}" — filters All · Historical figures · Writers · Musicians · Artists over a row of cards (portrait and credit, life years, description, born/died here) that open Wikipedia.
- **Data:** 4,143 people in 179 of 198 cities (Wikidata + Commons), new table `notable_people`, pipeline command `people`. 19 small towns have nobody listed.
- **Fix:** doubled Commons credits ("Unknown author Unknown author") collapsed — 152 attraction photos.
- **Next:** people tied to a city in other ways (residence, burial), districts as birthplaces; people in the monthly refresh and the data gate.

## 2026-10-06 — Landing page (D-072)

- **Web:** signed-out visitors land on `/welcome` — header with section links, Log in and Get started (menu on narrow screens); hero with two phone mockups of the app (Discover and a Lisbon walk list on a real Belém map) over a photo of Lisbon; benefits; Popular destinations from `city_list` (View all lists all 197 cities); four steps; closing CTA; footer with About, language and credits. Native apps still open on sign-in.
- **Tests:** 22 new unit/component tests (layout, curated cities, section scroll, gradient, the screen's links, real cities, Portuguese); E2E smoke on desktop and Pixel 7 (landing, no sideways scroll, Log in → sign-in). The backend E2E helper was brought up to the 2-step onboarding of D-069; journey and sharing specs pass again.
- **Verified on web:** 1440, 1280, 960 and 390 px; no console errors, no horizontal overflow, section links land under the header, keyboard Tab/Enter reaches Log in.
- **Next:** Privacy and Terms pages (then footer links); store badges once the apps ship; check the page on real phones (Safari's frosted header, emoji flags on Windows).

## 2026-10-06 — First production deploy (D-073)

- **Live:** https://travelist.live (HTTP → HTTPS, certificate until 2027-01-04) on the VPS's Apache, next to the existing sites, which were checked before and after (unchanged).
- **Backend:** Supabase Cloud project `travelist` (Ireland): 31 migrations, 197 active cities, 250 countries, Lisbon's 300 places through the public API; Edge Functions `checklist`, `route-optimize`, `health`, `welcome-email`, `auth-email`; secrets; Auth (site URL, redirects, 6-digit codes, Send Email hook → Resend, `travelist.live` verified).
- **Verified:** the landing page in production reads `city_list` from Supabase Cloud with no console errors; Get started opens sign-up; protected functions answer 401 without a session.
- **Next:** a real sign-up end to end (confirmation email through Resend); Google / Apple sign-in; EAS builds pointing at production; backups/plan decision (free tier pauses after a week idle).

## 2026-10-07 — Continuous deployment (D-074)

- **Deploy workflow:** a push to `main` that passes CI publishes the backend (migrations, seeds, Edge Functions), then the web app to https://travelist.live, then smoke-tests both; also runnable by hand. `scripts/deploy-backend.sh` and `scripts/deploy-web.sh` are shared by CI and manual deploys (both checked with `--dry-run` against production).
- **Needs:** the GitHub environment `production` with its secrets and variables (README → "Continuous deployment").

## 2026-10-07 — Release gate dev → main (D-075)

- **Flow:** feature PRs → `dev` (CI + Security required) → **Promote** waits for approval → `main` fast-forwarded to the tested commit → Deploy. `main` only moves through the gate (rulesets). Gate logic in `scripts/release-gate.mjs`, with tests.
- **Needs:** `SUPABASE_ACCESS_TOKEN` in the `production` environment before the first release.

## 2026-10-07 — iPhone layout, second pass (D-076)

- Section titles, walk list cards and the Reviews area centred on phones; audit of 11 signed-in screens at 390 × 844: 43 off-centre titles → 2 (profile header, by design). Before/after in `artifacts/iphone-audit/`.
- Production still serves the build from before PR #18 until the first release through the gate deploys (needs `SUPABASE_ACCESS_TOKEN`).

## 2026-10-10 — Suggested routes (D-077)

- **App:** new **Routes** tab: GPS (foreground permission) or a chosen city → the city's themed historic walks, nearest first, each starting at the stop nearest to the traveller, with a Start button that loads the route builder. `expo-location` added.
- **Data / pipeline:** `suggest-routes` (rule-based planner and an Ollama planner with JSON-schema output, code-validated), tables `suggested_routes` / `suggested_route_stops`, 1,141 routes for 198 cities (33 cities with fewer than 2, 13 with none).
- **Next:** run the Ollama planner on a few cities and compare models (quality, Portuguese titles, time); decide whether to add cafés (OSM) and an on-device model for on-demand routes; add `suggest-routes` to the data refresh and gate; check the Routes tab on a phone and on the web with a real location.

- Trip planner data complete (D-081): climate for all 198 cities (12 months, 2022–2024) and facts for all 198 plus the 5 built on demand (202 of 203 with population, 136 with a foundation year, 160 with beaches). CI on the first planner commit failed only on `format:check` (unformatted `data/facts` snapshots written by long-running shards); formatted, and `data/local` is now in `.prettierignore`.
- Countries to avoid (D-082): a planner question (hard filter in code), saved in the profile on request and listed in Profile. Unit-tested (601 mobile tests); browser check below.
- Plan your next trip (D-081): ten-question interview (seven fixed, three written by the local model), shortlist by code (distance, month, weather, attractions, character), ranking and reasons by the local model, Future trips tab and table. Unit-tested (588 mobile tests, 147 shared); data coverage and the browser run are reported below.
- Any city by name and saved cities (D-080): Change city searches the world through the city builder; picked cities are saved in a drop-down on My city. Unit-tested; not yet driven in a browser.
- First question and city builder (D-079): `/start` (My city / A city elsewhere), side bar World and My city, and `wayfarer_pipeline serve` building a new city from the position (Sintra and Mafra built for real: 68 and 31 places, 7 and 3 routes). Verified in a browser: the question, the routes of a built city and the progress screen of a new one (Óbidos). Not verified: a finished build shown in the app for a brand-new city after `db reset`, and phones.
- Local mode (D-078): `EXPO_PUBLIC_LOCAL_MODE=true` opens the app without a sign-in screen; a silent anonymous session keeps My Trips, Profile and Save trip working.

## Remaining (M5 and launch)

- Desktop executables (D-093): `Travelist-<v>-win-x64-setup.exe` / `-portable.exe` and `-linux-x64.AppImage`, built by `desktop.yml`. 32 node tests for the stack; the Windows package passed `--smoke`; the full start with Docker, and anything on Linux, are not yet exercised end to end.
- Offline trips (D-092): Save for offline (stops, street path, places with their texts, photos, and a map area on a phone); with no connection a saved trip, its places and My Trips open from the copy and in-app navigation keeps working. 718 app tests; the web path was exercised in a browser with the backend cut, which also found that the app could not start offline (fixed). The phone-only parts (files, map pack) are not run on a device, and the APK of `v0.1.0` does not include any of this.
- Releases (D-091): `v0.1.0` with the Android APK (rebuilt with every feature up to prices), the Linux `.tar.gz` and the Windows `.zip` of the local stack. The Windows package's web app was served from a clean extract and checked in a browser; the launchers were syntax-checked, not run end to end, and nothing was tried on Linux or on a phone.
- My city, **City page** button (D-089): next to **Explore attractions** on the city card of My city. Unit-tested (667 app tests); not yet pressed on a phone.
- City prices (D-088): estimated everyday prices for all 198 cities (182 with the real Big Mac price), a prices card with a day's budget on the city page and a typical-day line on each planner proposal. Built from live sources (Big Mac index, World Bank, Frankfurter); modelled, not measured, and the app says so. 18 pipeline tests, 7 pgTAP, 7 shared and 20 app tests; seen working in a browser (3 meals + 2 beers in Lisbon = €37.67). Not on a phone, and the APK built earlier does not include it.
- Street-following routes (D-087): `route-optimize` never returns a straight line any more: ORS, else the OpenStreetMap foot router, else a 503. Verified live (4 stops → 529 street points; the local stack end to end, provider `osm-foot`); 139 Edge Function tests, 651 app tests. Suggested-route distances shown on cards (pipeline) are still straight-line × 1.3 figures, not drawn lines.
- In-app navigation (D-086): the button, the Navigating card, the blue dot and follow mode, the next-stop highlight and the stops that open their pages while navigating. Unit-tested (638 app tests, 165 shared); not yet walked with a real GPS in a browser or on a phone, and the APK built earlier does not include it (rebuild with `pnpm build:android`).
- Visited places (D-085): mark a place visited on its page; suggested routes leave it out of the way. Unit-tested (611 app tests, 153 shared, 445 pgTAP); not yet driven in a browser or on a phone, and the APK built earlier does not include it (rebuild with `pnpm build:android`).
- Integrations (D-084): tracing, SerpApi, ElevenLabs, MongoDB Atlas, pgvector search, hosting files and Copilot files are in; Gemma is a `--model` away. Run for real here: pgvector (migration, 436 pgTAP tests, 400 attractions embedded, a hybrid search); the rest is unit-tested with fakes. The app shows none of them yet. Owner steps: docs/INTEGRATIONS.md.
- Android APK (D-083): `pnpm build:android` produces `dist/travelist.apk` for a phone on the same Wi-Fi as the PC. Built once (61 MB, arm64, `BUILD SUCCESSFUL`), not yet installed on a device: check the map, location prompt, photo picker, route drag and drop and the planner against the PC.
- Native iOS/Android runs not verified here: this machine has no Xcode/Android SDK. Build with `expo run:ios|android` or EAS (`eas.json` included).
- Route stop drag and drop (D-027) is verified on web only; check it on iOS/Android with a development build (gesture vs page scroll).
- Map: clustering for dense areas; check photo markers and the card popup on iOS/Android (D-029).
- Walk list sharing: limit password attempts; revoke a link without going private; check the native share sheet on iOS/Android (D-031).
- Reviews: "load more" beyond the 50 newest, reporting / moderation (D-028); city and walk list reviews share the same gap (D-034).
- Plans: payment provider (checkout, webhooks writing `subscriptions`, renewal, cancellation, billing portal) (D-047); decide the plan limits before turning `EXPO_PUBLIC_FEATURE_PAID_PLANS` back on (D-065).
- Routes: rebuild trips saved earlier as straight-line estimates; a higher ORS quota for launch (D-046).
- Meetups: reminders/notifications and a time picker (D-041); chat push notifications, message reporting/moderation and older-message paging (D-043); turn the walk chat back on (`EXPO_PUBLIC_FEATURE_WALK_CHAT`, D-065).
- Walk lists: an admin screen for moderators (today: SQL), a count of lists on the city page, and a check of the city page on iOS/Android (D-033, D-035).
- Offline-lite (persisted query cache with MMKV) is not implemented yet.
- Sentry / PostHog SDKs are not wired (facade ready; needs DSN/keys).
- Native date pickers (D-019) and a map-beside-list layout for Explore on wide screens (D-007) are post-MVP polish; route and trip detail already use it (D-020).
- Owner-only items (accounts, keys, store listings): see [docs/LAUNCH_CHECKLIST.md](./docs/LAUNCH_CHECKLIST.md).

## Known issues / open questions

- **Without `ORS_API_KEY`** routes are straight-line estimates (clearly labelled in the UI).
- **Bundle id** `com.travelist.app` is a placeholder (D-001).
- Portuguese attraction names exist for ~15–55% of places outside Portugal/Rome; the English name is shown as fallback.
- Opening hours come from OSM and cover ~15–30% of places.
- Expo Go cannot load MapLibre; a development build is required.

# Decisions log

Non-trivial choices made while building Wayfarer. Format: context → decision → alternatives considered. Fixed decisions from the brief (Section 2) are not repeated here unless we had to interpret them.

---

## D-001 — Working name and identifiers

- **Context:** The brief used a `{{APP_NAME}}` placeholder.
- **Decision:** Working name **Wayfarer**. Package scope `@wayfarer/*`, Expo slug `wayfarer`, URL scheme `wayfarer`, bundle id / Android package `com.travelist.app` (placeholder until the store listings are created; renamed 2026-09-29 so no company name appears in the project).
- **Alternatives:** none; renaming touches `app.json`, package names and this file only.

## D-002 — Expo SDK 57 with the default template as a base

- **Context:** "Latest SDK" at scaffold time (2026-09-26) is SDK 57 (React Native 0.86, React 19.2, TypeScript 6.0).
- **Decision:** Generate `apps/mobile` with `create-expo-app` (default template) so dependency versions match the SDK, then strip the demo UI. Always add dependencies with `npx expo install` inside `apps/mobile`.
- **Alternatives:** hand-written package.json (risk of incompatible versions).

## D-003 — pnpm with `nodeLinker: hoisted`

- **Context:** Expo supports pnpm isolated installs since SDK 54, but the Expo docs warn some React Native libraries still break with isolated layouts. We depend on native libraries (MapLibre, Reanimated, MMKV).
- **Decision:** Use a hoisted layout (`pnpm-workspace.yaml → nodeLinker: hoisted`). Metro's monorepo support is automatic (no custom `watchFolders`).
- **Alternatives:** isolated installs (stricter, but more native build risk); npm/yarn workspaces (brief fixes pnpm).

## D-004 — Test runners: Vitest for pure TS, Jest (jest-expo) for React Native components

- **Context:** The brief lists Vitest for unit tests and React Native Testing Library for components. RNTL relies on the React Native Jest preset (module mocks, Babel transforms, platform resolution); running it under Vitest is unsupported and brittle.
- **Decision:** Vitest for `packages/shared` (and any other pure TS). `jest-expo` + RNTL for `apps/mobile` component tests. Both run through `pnpm test` / Turborepo, so CI sees a single command.
- **Alternatives:** Vitest + community RN shims (fragile across SDK upgrades).

## D-005 — `@wayfarer/shared` ships TypeScript source (no build step), with explicit `.ts` import extensions

- **Context:** The shared package is consumed by Metro (app) and Deno (Edge Functions). Deno requires explicit file extensions on relative imports.
- **Decision:** `packages/shared` exports its `src/` directly. Relative imports inside it use `.ts` extensions (`allowImportingTsExtensions`), which Metro, Vitest and Deno all resolve. The package must stay free of React/RN/Node APIs. External deps are limited to `zod`.
- **Alternatives:** a tsup/tsc build step (extra watch process, stale-build bugs); duplicating schemas in `supabase/functions/_shared` (drift).
- **Follow-up (resolved 2026-09-27):** the edge runtime cannot load files outside `supabase/functions` (verified: "Module not found" for `../../packages/shared`). `scripts/sync-shared.mjs` copies `packages/shared/src` (minus tests) into `supabase/functions/_shared/wayfarer`, which is committed and mapped as `@wayfarer/shared` in `deno.json`. `pnpm check` and CI fail when the copy is stale. The copy is excluded from `deno lint`/`deno fmt`.

## D-006 — ESLint 9 flat config

- **Context:** ESLint 10 is out, but `eslint-config-expo` depends on plugins (react, import) whose peer ranges still target ESLint ≤ 9.
- **Decision:** ESLint 9 with flat config. The app extends `eslint-config-expo/flat`; `packages/shared` uses `typescript-eslint` recommended rules. Prettier runs separately (no eslint-plugin-prettier).
- **Alternatives:** ESLint 10 with peer-dependency overrides.

## D-007 — Tabs implementation

- **Context:** The template ships `NativeTabs` (native iOS/Android tab bars, still under `unstable-` import) plus a separate hand-rolled web tab bar.
- **Decision:** Use the stable JS `Tabs` from `expo-router` for all platforms in the MVP; one implementation, predictable on web, easy to test. On wide web screens we switch to a side-panel layout in M5.
- **Alternatives:** `NativeTabs` (nicer native feel; revisit post-MVP once stable).

## D-008 — Default map style: OpenFreeMap

- **Context:** Tiles must be configurable and must not need hard-coded keys.
- **Decision:** `.env.example` defaults `EXPO_PUBLIC_MAP_STYLE_URL` to OpenFreeMap's "liberty" style (free, no key). MapTiler can be used by swapping the URL (its key is a public, domain-restricted key).
- **Alternatives:** MapTiler as default (needs an account before first run).

## D-009 — Python tooling for the pipeline

- **Context:** Python is used only in `data-pipeline`.
- **Decision:** Python ≥ 3.11, standard `pyproject.toml`, `requests` + `PyYAML` + `pydantic` for config validation, `pytest` + `ruff`. A plain venv is enough (`uv` works too, but is not required).
- **Alternatives:** Poetry (extra tool for contributors).

## D-010 — City geometry in `cities.yaml`

- **Context:** Cities need a centre point and an area for ingestion queries.
- **Decision:** Each city stores its Wikidata QID, OSM relation id, centre and bbox. Values were taken from Wikidata (P625 coordinates) and Nominatim (bbox, OSM relation) on 2026-09-26, not typed from memory. Ingestion queries by bbox first; the OSM relation is available for precise area filters.
- **Alternatives:** polygon files per city (heavier, not needed for MVP).

## D-011 — Reference data ships as committed SQL seeds

- **Context:** Ingestion hits Wikidata, Overpass and Wikimedia and takes a while; every `supabase db reset` would otherwise empty the database.
- **Decision:** The pipeline writes normalised snapshots (`data-pipeline/data/`) and deterministic, idempotent SQL seeds (`supabase/seed/10_countries.sql` … `40_attractions.sql`). Local resets and hosted `db push --include-seed` load them directly; `python -m wayfarer_pipeline seed` regenerates SQL offline.
- **Alternatives:** upsert through PostgREST with the service role (needs network + secrets on every reset).

## D-012 — Country data from Wikidata + curated overrides; advisories from Global Affairs Canada

- **Context:** Plugs, voltage, currency, calling codes and emergency numbers are needed for every possible home country, and safety levels for every destination, without paid APIs.
- **Decision:** Countries come from Wikidata SPARQL (P2853 plugs, P2884 voltage, P38 currency, P474, P2852, P1622, P37) with `data-pipeline/data/country_overrides.yaml` fixing known errors (each with a source). Safety uses the Government of Canada open-data feed (one JSON for all countries, advisory level 0–3, Open Government Licence) plus a link to GOV.UK travel advice.
- **Alternatives:** restcountries.com (v3 API was deprecated during development), GOV.UK content API (no machine-readable level).

## D-013 — FX: Frankfurter (ECB) first, ExchangeRate-API open endpoint as fallback

- **Decision:** `api.frankfurter.dev` (no key, ECB reference rates, ~30 currencies) with `open.er-api.com` (no key, attribution required) for currencies the ECB doesn't publish. `EXCHANGE_RATES_BASE_URL` can point at any Frankfurter-compatible host. Cached 24 h.

## D-014 — Route optimisation: ORS when a key exists, deterministic fallback otherwise

- **Decision:** `route-optimize` uses the ORS optimisation (VROOM) + foot-walking directions APIs when `ORS_API_KEY` is set; otherwise, or on any ORS error, it returns a nearest-neighbour + 2-opt order from `@wayfarer/shared` with straight-line legs × 1.3 at 4.5 km/h, flagged `isFallback` in the UI. Only successful ORS results are cached (30 days).

## D-015 — Edge Functions verify the user, not just the JWT

- **Context:** `verify_jwt = true` at the gateway also accepts the public anon key, because it is a validly signed JWT.
- **Decision:** Keep `verify_jwt = true` and additionally call `auth.getUser(token)` inside `checklist` and `route-optimize`; anonymous calls get 401.

## D-016 — OAuth through Supabase-hosted flows (PKCE); native Sign in with Apple on iOS

- **Decision:** Google (all platforms) and Apple (web/Android) use `signInWithOAuth` with PKCE: a full redirect on web, `WebBrowser.openAuthSessionAsync` on native, and the code exchanged on `/auth/callback`. iOS uses `expo-apple-authentication` + `signInWithIdToken`, as App Store guidelines prefer. Buttons appear only for providers listed in `EXPO_PUBLIC_AUTH_PROVIDERS`. Magic-link emails also carry a 6-digit code, so sign-in works even when the link opens on another device.
- **Alternatives:** `@react-native-google-signin` (native SDK, extra config per platform).

## D-017 — Sessions in SecureStore, chunked

- **Context:** SecureStore values are limited to ~2 KB; Supabase sessions are larger.
- **Decision:** `src/lib/secure-storage.ts` splits the session into 1.8 KB chunks in the Keychain / Keystore. Web uses Supabase's default localStorage.

## D-018 — Web: MapLibre worker served from `public/`, trip detail at `/trip/[id]`

- **Context:** maplibre-gl v6 loads its Web Worker from a separate ES module that Metro doesn't bundle, and the static export can't serve both `/trips` (tab) and a `trips/` folder.
- **Decision:** `apps/mobile/scripts/copy-maplibre-worker.mjs` copies the worker into `public/maplibre/` before `start`/`build:web`, and the map calls `setWorkerUrl('/maplibre/maplibre-gl-worker.mjs')`. Trip detail lives at `/trip/[id]`.

## D-019 — Dates are typed as ISO text in the MVP

- **Decision:** Passport expiry and travel dates use a validated `YYYY-MM-DD` text field on every platform (no native date picker dependency). A native picker is a post-MVP polish item.

## D-020 — Design system: neutral base, one accent, Inter, soft elevation

- **Context:** the MVP UI was functional but visually plain: bordered grey boxes stacked vertically, system fonts, the same weight for primary and secondary actions.
- **Decision:** a small in-house design system, inspired by the calm, image-led feel of marketplace travel apps (without copying any product's components or brand):
  - **Colour:** white surfaces, near-black text (`#222`), soft greys for secondary text, dividers and muted backgrounds, and one coral accent (`#D7383B`, 4.6:1 on white) used only for primary actions, selection, active states and route markers. Status colours (success, warning, danger, info) appear only in checklist status pills and errors. Dark tokens exist for users who pick the dark theme (D-021).
  - **Type:** Inter (`@expo-google-fonts/inter`, SIL OFL) in four weights, loaded before the splash screen hides; an 8-step scale (display, title, heading, subtitle, body, label, caption, helper). `Text` maps `fontWeight` to the matching Inter family because custom fonts ship one family per weight.
  - **Shape and depth:** radii 8–24 px, hairline borders, `boxShadow` elevation in three levels (card, raised, floating).
  - **Interaction:** a shared `Tappable` (press-in scale via RN `Animated`, hover on web, keyboard-only focus ring), spinner-in-place loading buttons.
  - **Layout:** breakpoints at 600 / 1024 px; bottom tabs on phones, side rail on desktop; modals as page sheets on phones and centred dialogs on larger screens; content widths 440 / 760 / 1200 px.
  - **Icons:** `expo-symbols` (SF Symbols on iOS, Material Symbols on Android/web) behind an `Icon` wrapper with a fixed name map.
- **Trade-offs:** one more dependency (the font package, ~1 MB of font files). No animation library beyond RN `Animated`, to keep Jest setup unchanged. Some SF Symbols are approximations for attraction categories.

## D-021 — Light by default; dark theme as a user preference

- **Context:** D-020 shipped light and dark tokens that followed the system setting. The product direction is a light, image-led look, but users asked to choose a dark theme themselves.
- **Decision:** the theme is a **profile preference** (`profiles.theme`, `light` | `dark`, default `light`), picked in Profile → Preferences next to language and units. The system dark-mode setting is not followed. `ColorSchemeContext` (set in the root layout from the profile) drives `useTheme()`, `useShadows()`, the navigation theme and the status bar; on iOS/Android `Appearance.setColorScheme` makes keyboards and system dialogs match. The change is applied optimistically to the cached profile, so the app switches at once and rolls back if the save fails.
- **Why the profile, not device storage:** it follows the user across devices like language and units, and needs no new storage dependency.
- **Trade-offs:** signed-out screens (sign-in, sign-up, magic link) are always light because there is no profile yet; the map style stays light in dark mode.

## D-022 — Routes are ordered as you pick, and can be split by proximity

- **Context:** the route kept the order in which places were picked until the user pressed Optimise, and a long selection (up to 12 stops) could only become one walk.
- **Decision:**
  - **Order on pick, on the device.** The first pick is the start; each new pick is slotted in and the route re-ordered with the same nearest-neighbour + 2-opt used by the offline fallback (`orderFromStart`, `packages/shared/src/domain/route-plan.ts`), on straight-line distance. Instant and offline; **Optimise** still asks `route-optimize` (ORS) for street distances, per route.
  - **Manual order wins once used.** Moving a stop switches to manual order: new picks go where they add the least walking (cheapest insertion) without re-sorting; "Reorder automatically" returns to the computed order.
  - **Split** from 5 stops (`ROUTE_SPLIT_MIN_STOPS`), ≥ 2 stops per route. "Split here" cuts at a chosen point; the suggestion (`splitRoute`) cuts the optimised walk where it drops the longest legs (best over every contiguous cut), then moves single stops between routes while that shortens the total. The first route keeps the start; the others start where their walk is shortest. Deterministic, ~1 ms for 12 stops.
  - **Saved as separate trips** ("{name} · Route {n}") through the existing `save_trip` RPC: no schema change.
  - **Route colours:** one per route (accent, then the status hues plus purple and teal), per colour scheme, in `features/route/route-colors.ts`.
- **Trade-offs:** reordering uses up/down buttons, not drag and drop (no gesture/animation dependency). The on-device order is straight-line based, so ORS may re-order a route slightly when optimising. Split routes are not linked to each other once saved.

## D-023 — Balanced route splits

- **Context:** D-022's "Suggest a split" minimised total walking only, so it could leave one route with most of the places (e.g. 3 + 9). Users split a selection to spread it over days or parts of a trip, so each route should be a similar amount of time out, while walks stay short.
- **Decision:** `splitRoute` minimises `splitCost = walking minutes + SPLIT_BALANCE_WEIGHT × Σ |route time − average route time|`, where a route's time is its visits (`avgVisitMinutes`, 30 min when unknown) plus straight-line walking at 4.5 km/h, and `SPLIT_BALANCE_WEIGHT = 0.5`. Search: the best contiguous cuts of the walking order (exhaustive, memoised), then hill-climbing over single-stop moves and pairwise swaps between routes. The first route keeps the user's start; every route keeps ≥ 2 stops. Deterministic, under 10 ms for 12 stops.
- **Why time, not just the number of places:** a 3-hour museum and a 15-minute viewpoint are not the same load; balancing time spreads long visits across routes (tested: two 3-hour museums end up in different routes), and with similar visits it also evens out the number of places.
- **Trade-offs:** the weight is a judgement call: at 0.5, evening out an hour of imbalance is worth 30 extra minutes of walking, so far-apart neighbourhoods (10 km) still stay separate. Straight-line walking underestimates real streets; the split is recomputed on demand, not after every pick.

## D-024 — Explore layout: one page container, compact header, width-driven grid

- **Context:** the Explore header stacked three full-width rows (city + checklist, search, category tabs, ~205 px on desktop) with no logo; the search stretched to 1200 px, the tabs were left-aligned with nothing to anchor them, and the card grid picked its columns from the window width, ignoring the 104 px desktop rail (3 wide columns at 1180 px, ~300 px of empty margin at 1920 px).
- **Decision:**
  - **One container** (`layout.page`, 1440 px + gutter) for the header rows and the card grid, so the logo, the "N places" title and the first card share a left edge and the action and the last card share a right edge.
  - **Header composition** (`features/destinations/explore-header.tsx`), chosen from the container's measured width, not the window: `[logo] [city pill + search] [Before you go]` in one row when the content is ≥ `INLINE_HEADER_MIN_WIDTH` (two 168 px side slots + gaps + a 580 px search group); otherwise logo + action on top and the city + search group below; on phones the logo mark, city pill and icon action share a row with the search below. The city + search group is centred and capped at 640 px.
  - **Category tabs** form one centred group when they fit and scroll edge to edge (starting at the gutter) when they don't.
  - **Grid columns** follow the grid's own width: as many ≥ 240 px cards as fit (`gridColumns`, `theme/grid.ts`), 24 px column gap, 32 px row gap — 1 column on phones, 2 on tablets, 3–5 on desktop.
- **Trade-offs:** the single-row decision needs one layout pass, so a desktop first frame can show the stacked header. Only Explore uses the 1440 px container; the other grid screens keep `layout.wide`.

## D-025 — Exact route ordering and a single ORS call

- **Context:** on-device ordering (D-022), split routes (D-023) and the offline fallback (D-014) used nearest neighbour + 2-opt. Measured on 300 random routes in central Amsterdam, it missed the shortest walk on 13% of 6-stop, 29% of 9-stop and 46% of 12-stop routes, by 4.7% on average and up to 21%. `route-optimize` made two ORS requests per route (VROOM optimisation, then foot-walking directions for legs and geometry). Its cache key used the stops in request order, so "Optimise" again after the app applied the optimised order missed the cache, and the route screen re-sent every route of a split when one changed.
- **Decision:**
  - **Exact ordering** (`optimizeOrder`, `optimizeOrderAnyStart` in `packages/shared/src/domain/route.ts`): Held-Karp dynamic programming over subsets on the straight-line distance matrix, O(2ⁿ·n²): at most 0.4 ms (fixed start) / 0.9 ms (any start) for 12 stops, and `splitRoute` at 12 stops in under 1 ms. A free start is one pass instead of one optimisation per candidate start. Ties are broken deterministically; with a free start, a path and its reverse tie, and the one starting from the earlier-listed stop wins.
  - **One ORS request:** `/optimization` with `options.g` returns the route geometry (encoded polyline, decoded in `route-optimize/polyline.ts`) and cumulative distance/duration per step, from which the legs are derived. Checked live on 12 Amsterdam stops: 6758 m / 4864 s against 6756.6 m / 4864.5 s from the directions call; the directions request is dropped.
  - **Canonical requests:** `normalizeRouteInput` keeps the start (when `keepFirst`) and sorts the other stops by id, for the cache key and the provider call, so the same set of places hits the cache in any order and gets the same answer.
  - **Client:** `routesToOptimize` sends only the routes without a result for their current order.
- **Kept:** VROOM for the street-network order. On the measured Amsterdam set it matched the exact optimum on the ORS walking-time matrix, so replacing it with a matrix call + local exact search would add a request without improving the result.
- **Trade-offs:** Held-Karp is exponential; fine up to `ROUTE_MAX_STOPS` (12), not beyond ~16. Without the directions call, stops are snapped with VROOM's default radius instead of `radiuses: -1`; a stop VROOM cannot snap already failed the optimisation before, so no route that worked is lost. Cached ORS entries written under the old key shape are simply not reused.

## D-026 — Home of destinations; city pages by URL

- **Context:** after sign-in the app opened straight on one city's attractions — the first city of `city_list` A–Z (Amsterdam), or the route tray's city — kept in the Explore store. There was no place to discover the cities, and a city could not be linked.
- **Decision:**
  - **Routes:** the Explore tab becomes a stack, `(tabs)/(explore)/`: `index` is the **Home** (`/`, the covered cities) and `city/[slug]` the **city page** (`/city/amsterdam`), which is the former Explore screen (moved with its history) reading the city from the URL instead of the store. Keeping both inside the tab keeps the tab bar / side rail on city pages. The store keeps only filters and view mode; switching city in the pill sets the URL param.
  - **Back to the Home** reuses what is there: the header logo becomes a link to `/`, pressing the already active Explore tab returns to the Home, and back / browser back work through the stack. No extra button.
  - **City data:** `city_list` gains `country_name_en/pt` (join with `countries`) and a **cover photo**: the image of the city's most popular attraction that has one, with its author and licence (a lateral subquery on `attractions_city_popularity_idx`). No new source or integration; every Commons image keeps its credit, shown on the card. Only rows the view returns are shown, so inactive cities (RLS) never appear and no city is added by hand.
  - **Search:** two contexts, two functions over already loaded data — `searchCities` on the Home (city names EN/PT, then countries), `searchAttractions` on the city page — sharing the matching rules and a `SearchField` component.
  - **Shared pieces:** `BrowseHeader` (logo, optional lead, search, optional action, content below) serves both pages, `CardGrid` both grids (D-024 rules), `CityCard` reuses the attraction card's image treatment (`Thumbnail`).
- **Trade-offs:** a city's cover is whatever its most popular photographed attraction looks like (e.g. an aerial photo of the Anne Frank House for Amsterdam), not a curated skyline; curating covers would need new data. The Home lists cities A–Z; no ranking or featured cities yet.

## D-027 — Drag and drop for route stops with PanResponder

- **Context:** the route builder only reordered stops with move up / move down, one place per tap; moving the last of 12 stops to the start took 11 taps.
- **Decision:**
  - A **grip** on each stop row (next to the arrows, which stay for accessibility and precise moves) starts a drag; the row follows the pointer, the rows it passes slide by its height, and the drop calls the store's new `moveTo(id, to)` (`move` is now built on it).
  - The drop position is pure maths over the rows' measured boxes (`dropIndex`, `rowShift` in `features/route/stop-drag.tsx`): the number of other rows whose centre is above the dragged row's centre.
  - Built on React Native's core **PanResponder**, not `react-native-gesture-handler` + Reanimated: it works on web, iOS and Android without adding a `GestureHandlerRootView` at the app root, and a list of at most 12 rows doesn't need UI-thread animation. The page's `ScrollView` is paused (`Screen scrollEnabled`) while a drag is active so the gesture isn't taken over by scrolling; on web the grip sets `touch-action: none`.
- **Performance:** the pointer offset is an `Animated.Value` (set directly, no re-render); the list re-renders only when the hovered slot changes, and the React Compiler keeps unchanged rows memoised. The route lists are keyed by position, not by stop order, so a reorder doesn't rebuild them.
- **Trade-offs:** the drag still runs on the JS thread (no native driver for gesture-driven values), fine for ≤ 12 rows. Stops move only within their route; dragging between split routes is not supported. No auto-scroll when dragging past the visible edge of a long list on a small screen.

## D-028 — Attraction reviews on Postgres + RLS

- **Context:** travellers wanted to rate places and read others' experiences: a 1–5 star rating and a comment per user and attraction, public, editable and deletable only by the author, with the average and count next to the attraction name.
- **Decision:**
  - **Same stack as trips:** a table (`attraction_reviews`) with RLS, a `plpgsql` RPC for the write (`save_review`, like `save_trip`), a `security_invoker` view for the aggregate (`attraction_rating_summary`) and TanStack Query hooks (`features/reviews/api.ts`). No Edge Function: nothing needs a secret or an external call.
  - **One review per user and attraction** is a unique constraint; `save_review` is an upsert on it, so "publish" and "edit" are one path and a second review cannot exist. Update and delete policies check `auth.uid() = user_id`, so a user cannot touch someone else's review, even through the REST API.
  - **Rating** is a `smallint` with a 1–5 check (a fractional JSON value fails the integer cast); **comment** is optional — the project had no rule requiring it — trimmed, blank stored as null, at most 1000 characters. The same limits are in `reviewFormSchema` (`packages/shared`) so the form explains them before the request.
  - **Author names:** profiles are owner-only under RLS, so `list_attraction_reviews` is `security definer` and returns only the display name and `is_own` — not the author's id or anything else of the profile. Authors without a display name are shown as "Traveller".
  - **Aggregate in SQL:** `round(avg(rating), 2)` and `count(*)` over every review, one row per attraction (0 and null without reviews); the UI shows one decimal. Computed on read: cheap with the `(attraction_id, user_id)` index at this scale, and never stale.
  - **UI:** stars are the ★ glyph — same rendering on every platform — in **gold** when filled (`theme.star`: `#E5A50A` light, `#F5C542` dark) and the strong border colour when empty; in "4.6 ★ · 128 reviews" and "3.5 ★" only the star is gold, the number keeps the text colour. The coral accent stays for actions (D-020). Gold on white is 2.3:1, under the 3:1 WCAG asks of graphics (only a dark goldenrod such as `#B8860B` reaches it); accepted because a rating is never shown by colour alone — the number is beside it and every star control has a spoken label ("Rated 4 out of 5", "4 stars", checked). The picker is a radio group (each star "N stars", checked when chosen). The form uses react-hook-form + zod like the other forms, and delete asks for confirmation inline, like trips.
- **City cards:** the city page reads the ratings of all its places in one request — `attraction_rating_summary` filtered by `city_slug` and `review_count > 0` (the filter reaches the attractions' city index) — instead of adding columns to the public, cached `attractions_in_view` or one request per card. The card shows "3.5 ★" as a caption beside the name, and the rating joins the card's spoken label.
- **Trade-offs:** reviews are visible to signed-in users only (every screen but About needs sign-in). The page shows the 50 newest; no "load more", reporting or moderation yet. Aggregates computed per read would need a cached column or materialized view at much larger volumes.

## D-029 — Photo markers and a card popup on the city map

- **Context:** the city map drew places as category-coloured dots and a tap opened the attraction page straight away, so the map gave no preview of a place and adding it to the route meant switching to the List.
- **Decision:**
  - **Native map annotations, not a GL layer:** `maplibre-gl`'s `Marker` (web) and MapLibre React Native's `Marker` (iOS/Android) hold React content — the web renders it through portals into the marker elements — so a marker is our `PhotoMarker` built on the existing `Thumbnail` (same photo and placeholder as the cards). A symbol layer with runtime images would scale further but needs each photo decoded into a circular sprite and a second rendering path per platform; a city has at most a few hundred places.
  - **Small images:** markers load the Commons 120 px thumbnail (`thumbnailUrl` rewrites the stored 960 px one to that standard width), ~5–10 KB each; all ~290 Lisbon thumbnails loaded with HTTP 200 in the E2E probe.
  - **Popup = the List card:** `AttractionCard` gained `compact` (narrower, own surface, rating on its own line) and is rendered in `maplibre-gl`'s `Popup` (automatic anchor keeps it inside the map; `closeOnClick` off, the page decides) or a native `Marker` anchored above the point. Its **+** is the same `RouteCheckbox`, a sibling of the pressable card so its press never opens the place, wired to the page's existing `toggleWithNotice`; the card's press is the existing `openAttraction`. No route logic or navigation changed.
  - **Selection lives in the city page** (`selectedId`); the map reports marker presses (`onPointPress`) and presses on empty spots (`onMapPress`: a click whose target is not a marker or popup and that hits no dot). A marker click stops propagating so it never reaches the map as an "empty" press.
  - **Floating UI:** the "N places" pill and the Map/List switch + route tray cover parts of the map, which maplibre cannot know; the page passes them as `overlayInsets` (the bottom one measured with `onLayout`) and the map pans an opening popup out of them (`popupPanY`).
  - **Opt-in:** `markers="photo"`; the route and trip maps keep the numbered dots.
- **Trade-offs:** no clustering (none existed): at city zoom dense areas overlap; the selected marker is drawn on top and zooming separates the rest. The native version (and its popup placement near the screen edges) is untested on this machine.

## D-030 — Up to 20 stops per route

- **Context:** a route (tray, `route-optimize`, `save_trip`, `trip_stops`) held at most 12 stops (`ROUTE_MAX_STOPS`). The owner first asked to remove the limit, then settled on 20. The old number also protected the exact ordering (Held-Karp, O(2ⁿ·n²): ~1 ms at 12 stops, ~4 s at 20) and bounded "Suggest a split".
- **Decision:**
  - **Limit 20** (`ROUTE_MAX_STOPS`), counted over the whole tray as before: the store refuses a 21st stop ("Your route already has 20 stops."), `routeRequestSchema` has `.max(20)`, `save_trip` needs 2–20 stops and `trip_stops.position` is 0–19 (migration `20261001000300`).
  - **Ordering:** exact up to `EXACT_ORDER_MAX_STOPS` (12, unchanged results); for 13–20, nearest neighbour + 2-opt — from the fixed start, or with a free start from three candidates (the first stop and the two ends of the longest stretch). Deterministic, ~1 ms.
  - **Split:** still at most 6 routes (`ROUTE_MAX_SPLIT_PARTS`, what 12 stops allowed). Two work caps bound the search: when there are more than 20 000 ways to cut the walking order, each cut is searched only near an even split; the hill climb evaluates at most 1 500 neighbouring splits. Counts, not timers, so results stay deterministic. Measured while there was no limit: ≤ 90 ms at 20 stops, ~1 s at 60, ~2 s at 100 — so raising the limit later is mostly a matter of changing the constant, the schema and `save_trip`.
  - **Unchanged:** the Google Maps link still carries origin + 9 waypoints + destination (trips offer per-leg links), and ORS failures fall back to the labelled straight-line estimate.
- **Trade-offs:** 13–20-stop routes get a near-shortest order, not a guaranteed shortest one.

## D-031 — Walk list visibility: private, public or password

- **Context:** a saved trip (walk list) was visible only to its owner. The owner asked for three states: **public** (anyone with the link), **private** (owner only) and **password** (anyone with the link who knows the password the owner gives them), a share button, and the ability to change the state later.
- **Decision:**
  - **A `visibility` column on `trips`** (`private` default, `public`, `password`; DB check) instead of a separate "shares" table: one state per list, set by its owner, is what was asked. Existing trips become private, as they were.
  - **The tables stay owner-only.** Others read a trip only through `shared_trip(id, password)`, a `security definer` RPC granted to `anon` and `authenticated` that returns `{status}`: `ok` (+ the trip, its stop ids in order and `is_owner`), `not_found`, `password_required` or `wrong_password`. Opening RLS on `trips` to others would have leaked every public trip through the REST API (listing without a link) and could not check a password. Private and missing trips are both `not_found`, so a link never reveals that a private list exists. Trip ids are random UUIDs, so links cannot be guessed.
  - **Passwords are bcrypt hashes** (`pgcrypto`'s `crypt` + `gen_salt('bf')`) in `trip_passwords`: RLS on, no policies, no grants, so no client role (owners included) can read a hash; only the two RPCs use it. 4–72 characters (bcrypt reads 72 bytes), never trimmed. `set_trip_visibility` needs a password the first time, keeps the current one when saved again with none, and a trigger deletes the hash when the list leaves `password` (so a direct `update` by the owner cannot leave a stale password behind).
  - **Null-safe owner check:** signed out, `auth.uid()` is null, so `user_id = auth.uid()` is null and `not is_owner` would skip the private and password checks; `shared_trip` uses `coalesce(…, false)`. Found by the pgTAP test that opens a protected list as `anon`.
  - **Link = `/shared?id=<trip id>`**, a static page open to everyone (outside the sign-in guards), not `/shared/[id]`: the web export is static, and dynamic pages (`shared/[id].html`) need rewrite rules on the host — `expo serve` answers 404 for them when opened directly, which is exactly how a shared link is opened. The link uses `EXPO_PUBLIC_WEB_URL` when set (links shared from phones open in any browser), else `expo-linking`'s URL (web origin, or `wayfarer://`).
  - **Share button:** React Native's `Share` on iOS/Android, `navigator.share` on web when present, else a copy to the clipboard ("Link copied."), behind a small injected interface (`features/trips/share-link.ts`). Shown only when the _saved_ visibility is public or password, so the owner never shares a link that does not open.
  - **Visitors** see the list read-only (map, totals, stops, Google / Apple Maps links) through the same `TripView` as the owner. Signed out, stops are not tappable (attraction pages need an account) and **Plan your own walks** leads to sign-up. The typed password is kept only in the screen's state and sent with each request; nothing is stored on the device.
- **Alternatives:** per-person sharing (invite by email) — more than asked, and needs accounts for visitors; a random share token separate from the trip id — would allow revoking a link without going private, at the cost of another column and flow; hashing in an Edge Function — no benefit over `pgcrypto`, one more hop.
- **Trade-offs:** no limit on password attempts (bcrypt slows each one; a rate limit needs an Edge Function or a failed-attempts table); revoking a link means going private; the native share sheet is untested on this machine.

## D-032 — Filter city pages by minimum rating

- **Context:** with reviews (D-028) and card ratings in place, users asked to see only places rated "3+, 4+ or 5+" stars, keeping the current filter row.
- **Decision:**
  - **Three radio tabs in the category row** (★ 3+, ★ 4+, ★ 5+), after a divider, drawn like the category tabs (`FilterTab`). A minimum ("at least N") rather than exact bands, so one choice is enough; pressing the active tab clears it instead of adding an "Any" tab.
  - **Filtered on the device** with `withMinRating`, over the city's averages that `useCityRatings` already loads for the cards: no new query, and it applies to the map, the grid and the count at once. Search and categories apply first.
  - **Places without reviews are hidden** while a minimum is set: they have no average to compare, and showing them would defeat "only well-rated places".
  - Kept in the explore store beside the categories, so it survives switching cities.
- **Alternatives:** filtering in `attractions_in_view` (a join with the rating view) — a second source of truth for the averages and a refetch per change; a slider or 1–5 options — "1+" and "2+" filter almost nothing.
- **Trade-offs:** "5+" means an average of exactly 5.0, so places with many reviews rarely qualify; with few reviews in a city, 3+ can leave the page nearly empty (the "No places match these filters." state explains it).

## D-033 — City page hub at `/short/[slug]`; attractions stay at `/city/[slug]`

- **Context:** a city card on the Home opened the attractions (Map / List) straight away. The owner asked for a page per city — photo, rating, About, walk lists, Before you go, reviews — with the attractions one button away, without rebuilding the attractions page or breaking its URL.
- **Decision:**
  - **`/short/[slug]`** (the owner's choice) is the hub; **`/city/[slug]`** keeps the unchanged attractions page, so old links still work. Both live in the Explore stack (tab bar, back to the Home). The hub uses the stack header (city name + back), like the attraction page.
  - **Composition, not new features:** the hub places existing pieces — the city's `city_list` cover and credit, `RatingSummaryLine`, `ReviewsSection`, the checklist sections (extracted into `ChecklistSections` + `useCityChecklist`, now shared with `/checklist/[city]`), and the walk list card shared with My Trips.
  - **Before you go inline** assumes a trip starting today; the dates live on the checklist page (**Choose your dates**), so the hub stays one screen and the Edge Function contract is unchanged.
  - **Per-section states:** each section loads, fails (retry) or is empty on its own; nothing hides the page.
- **Alternatives:** hub at `/city/[slug]` and attractions at `/city/[slug]/attractions` — cleaner URLs, but it would change what every existing `/city/…` link shows.
- **Trade-offs:** two URL families for one city; the hub makes ~6 small requests (city about, rating, two walk list previews, reviews, checklist).

## D-034 — One `reviews` table for attractions, cities and walk lists

- **Context:** cities and walk lists needed the same reviews as attractions (1–5 stars, optional comment, one per user, author-only edit/delete, public to signed-in users).
- **Decision:** rename `attraction_reviews` to `reviews` and add nullable `city_slug` and `trip_id` next to `attraction_id`, with a `num_nonnulls(...) = 1` check and a unique (target, user) constraint per column. Every target keeps a real, cascading foreign key. `save_review` and `list_reviews` take the target as one of three parameters; the `rating_summary` view adds reviews per star (`rating_counts`) for the distribution bars. Trips are reviewable only when shared and not the reviewer's own (`trip_open_to_caller` in the insert/update policies). The app's review hooks and `ReviewsSection` take a `ReviewTarget`.
- **Alternatives:** a polymorphic `(target_type, target_id text)` pair — one column but no foreign keys or cascades; a table per target — three copies of the same rules, RPCs and UI wiring.
- **Trade-offs:** one more column per future target type; `list_attraction_reviews` and the old `save_review(uuid, int, text)` signature are dropped (the app is updated in the same change).

## D-035 — Community and official walk lists are public trips; saved lists are references

- **Context:** the city page shows the best public walk lists of travellers and official lists curated by the platform; users save other people's lists and rate them. The app already had trips with `private` / `public` / `password` (D-031) and no roles.
- **Decision:**
  - **One entity:** community lists are `trips` with `visibility = 'public'`; official lists are public trips with `is_official`, set only by **moderators** (`moderators` table managed in SQL, `is_moderator()`, `set_trip_official`). A trigger rejects `is_official` from non-moderators and clears it when a list stops being public, so owners can always make their list private. Official cards say "by Travelist".
  - **Listing:** `list_walklists` (security definer; trips stay owner-only) returns card rows — author, stops, times, average, count, saved/own flags — in one query, filtered by city, official flag, name (ILIKE with the text escaped) or the caller's saved lists, sorted `top` / `lowest` / `most_reviewed` / `newest`, paged by limit/offset. Previews fetch 7 rows to know if there are more without counting.
  - **Saving** is a reference in `saved_trips` (the owner's choice), shown under My Trips → Saved and opened read-only through `/shared?id=…`; lists with a password can be saved (by someone who has the link) but are never listed on city pages.
  - **Rating** happens on the shared list page with the shared `ReviewsSection` (D-034).
- **Alternatives:** copying a list into the saver's trips (no new table, but no link to the original's rating or edits); a role claim in the JWT (needs an auth hook; a table is enough and testable in pgTAP); keyset pagination (offset is enough at this scale).
- **Trade-offs:** no admin screen for moderators; no count of lists; offset paging can repeat or skip a row when lists change between pages.

## D-036 — City "About" text from the Wikipedia lead

- **Context:** the About section needs a short BIO per city, from data, not hardcoded; cities had none.
- **Decision:** the pipeline's `city-summaries` command takes each city's en/pt Wikipedia titles from its Wikidata sitelinks and stores the plain-text `extract` of the Wikipedia REST summary in `cities.summary_en/pt` (with `wikipedia_en/pt`), through the committed `data/city_summaries.json` and `20_cities.sql` like all reference data. The app shows the app-language text (else the other one) with "From Wikipedia · CC BY-SA 4.0" and a link to that same article.
- **Alternatives:** Wikidata descriptions (CC0, but one line — "capital of the Netherlands"); hand-written text in `cities.yaml` (control, but ~160 texts to write and maintain).
- **Trade-offs:** CC BY-SA requires the attribution and link on screen; Portuguese articles mix European and Brazilian spelling; texts change only when the command is re-run.

## D-037 — Demo community data is local-only SQL, one file per city

- **Context:** the city page feed (city rating and comments, place reviews, community and official walk lists) needs realistic multi-user, multi-language data to test, city by city.
- **Decision:** hand-written SQL in `supabase/demo/`: shared `accounts.sql` (six friends plus a moderator editorial account, fixed ids, one known password), then `<city>.sql` and `<city>.check.sql` per city. `pnpm db:demo <city>` (`scripts/seed-demo.mjs`) pipes them into the local `supabase_db_<project_id>` container's `psql`. Rows are inserted as `postgres` with explicit past dates, so feeds have realistic ordering, and the transaction acts as the moderator so the official-list guard still runs. Places are found by Wikidata id, list ids come from `md5(key)` so share links survive re-runs, and the route numbers use the app's own offline fallback model. Each city file first deletes the demo accounts' content in that city, so re-runs are idempotent.
- **Alternatives:** files in `supabase/seed/` (rejected: `db push --include-seed` would put fake accounts in production, and that folder is pipeline-generated); calling the RPCs over HTTP as each user (rejected: every row would be dated "now" and it needs the API up); `supabase db query -f` (rejected: it refuses multi-statement files).
- **Trade-offs:** Docker access to the local container is required; `db:reset` removes the demo data; RLS is bypassed on insert, so the check file (`list_walklists`, `list_reviews`, `rating_summary`, no self-reviews) guards consistency.

## D-038 — Walk list cover: the starting point's photo, chosen in the database

- **Context:** walk list cards had no image, only the city flag, so a grid of lists looked all alike. Each list should be recognisable at a glance.
- **Decision:** the card shows the photo of stop 0 or, when that place has no photo, of the next stop that has one, with its Commons credit. One SQL function, `walklist_cover(trip)` (security invoker, returns `{url, author, license}` or null), is the only rule: `list_walklists` returns it as `cover`, and My Trips reads it as a PostgREST computed column (`trips?select=…,walklist_cover`). The app parses it with `walklistCoverFrom` and reuses the city card's `PhotoCredit`.
- **Alternatives:** picking the photo in the app from the embedded stops (rejected: the same rule twice, in SQL and TypeScript, and more data per card); a stored `trips.cover_*` column (rejected: goes stale when stops change or a city is re-ingested); strictly stop 0 with a placeholder otherwise (rejected: a blank card whenever the start has no photo).
- **Trade-offs:** one extra indexed lookup per listed trip; a list whose first stop has no photo shows a later stop's photo, not literally its starting point.

## D-039 — Profile photos in a public Storage bucket, resized on the device

- **Context:** users want a photo on their profile. Its main value is being seen next to their reviews by other travellers.
- **Decision:** Supabase Storage bucket `avatars`, **public read**, created by a migration with a 2 MiB limit and JPEG / PNG / WebP only. RLS on `storage.objects` lets each user write only under `<user id>/`, and `profiles.avatar_path` must point inside that folder (DB check). The app picks with `expo-image-picker`, cuts the centre square and resizes to 512 px JPEG with `expo-image-manipulator`, behind `lib/photo-picker.ts`. Each upload gets a new file name (`avatar-<ms>.jpg`) and the previous file is deleted, so no cache shows a stale photo. `list_reviews` returns the author's path, and the app builds the public URL without a request.
- **Alternatives:** a private bucket with signed URLs (rejected: one extra request per review author, and the URLs expire in caches); storing the image in `profiles` as base64 (rejected: bloats every profile read); third-party avatars such as Gravatar or OAuth pictures (rejected: not every user has one, and it leaks the email hash); server-side resizing (Image Transformation needs the Pro plan).
- **Trade-offs:** a photo is visible to anyone who has its URL. Files do not cascade with the account, so the app deletes them before `delete_account`, and deletions made outside the app leave orphans. Two new native modules need a new development build.

## D-040 — Access to a walk list does not depend on knowing its URL

- **Context:** the owner set the rule: public lists made by users can be viewed by anyone, even someone who guesses the URL, but only the owner edits them; a guessed URL of a private list must give an error — only the owner views and edits private lists.
- **Decision:**
  - **Editing** stays owner-only in the database whatever the visibility (RLS on `trips` / `trip_stops`, `set_trip_visibility`); proven for public and password lists, visitors who saved a list and signed-out users (`40_trip_visibility.test.sql`).
  - **Viewing** goes through `shared_trip` only: public → the list, password → the prompt, private or missing → `not_found` ("Walk list not available"; the same answer, so a guess never reveals that a private list exists).
  - **The owner's editing page** (`/trip/[id]`) reads `trips` with `maybeSingle`: no row means the list is not the caller's, and the page redirects to `/shared?id=…` instead of an error — so a guessed editing URL of a public list opens it read-only and one of a private list says it is not available.
  - **Reviews of a private list** were still readable by anyone who guessed its id (table, `rating_summary`, `list_reviews`). They are now visible only to the owner (`trip_visible_to_caller` in the select policy and in `list_reviews`).
- **Alternatives:** a 403-style "you are not the owner" message on `/trip/[id]` — it would tell a guesser that the id exists.
- **Trade-offs:** password lists keep their D-031 behaviour (link + password to view); their reviews stay readable by signed-in users with the id.

## D-041 — Walk meetups: a date and time on a walk list, and "I'm going"

- **Context:** the owner wants walk lists to optionally carry a date and time so travellers can walk them together: the city page ranks the next ones with a countdown, and a page lists every meetup of the coming days. Choices made with the owner: people say they are going; the owner can set or change the time after creating the list; only public lists are listed.
- **Decision:**
  - **A moment, shown in the city's time.** `trips.starts_at` is a `timestamptz`. The owner types a wall-clock date and time in the city's time zone (`cities.timezone`), converted with `Intl` (`zonedToUtc`, shared package; on the night the clocks go back the first occurrence is taken, a skipped time is read with the earlier offset). Everyone sees "Sat 4 Oct, 10:00 (Lisbon time)", wherever they are. A trigger keeps `trip_date` as the start's local day, so there is one source of truth.
  - **Same entity and listing:** a meetup is a public trip with a future `starts_at`. `list_walklists` gains `p_upcoming` and the `soonest` sort and returns `starts_at`, `attendee_count` and `is_attending` — no parallel RPC. The city page ranks 5 (6 fetched to know if there are more); `/short/[slug]/meetups` groups them by local day (Today, Tomorrow, dates) and pages with **Load more**.
  - **Going:** `walk_attendees` (trip, user). RLS: users see and delete only their own rows; insert only for public lists with a future start that are not theirs (`meetup_open_to_caller`). Counts come from the security definer RPCs, so nobody sees who else is going. The organiser is not an attendee.
  - **Setting the time:** optional date + start time when saving a route (`save_trip(p_starts_at)`), and later on the list page (`set_trip_schedule`, owner only). Both refuse a start in the past (`22023`); removing the time ends the meetup.
  - **Countdown:** computed on the device from `starts_at`, refreshed every 30 s (minutes precision).
- **Alternatives:** a separate `meetups` table pointing at a trip — a second entity for one optional field; a date plus a local `time` column — needs the zone at every read and breaks on clock changes; showing the viewer's own time — confusing when planning a walk in another city.
- **Trade-offs:** no reminders or notifications; attendees are kept when the owner moves the time; a list that becomes private or loses its time keeps its attendee rows (hidden); no list of who is going (only how many); no end time (a meetup leaves the list at its start).
- **Revised by D-044:** "I'm going" is no longer limited to future meetups: any public list of someone else can be joined (the meetup listings still show only future starts).

## D-042 — Scheduled data refresh through a pull request, behind a data gate

- **Context:** reference data (countries, visa rules, city texts, attractions) only changed when someone ran the pipeline by hand. Automating the refresh must not let a bad day at a source (an outage, a vandalised Wikidata label, a disambiguation page) replace texts and facts that were fine.
- **Decision:**
  - **Monthly GitHub Action** (`data-refresh.yml`): fetch, then `gate --base HEAD --fix`, then `seed`, then a **pull request**. Merging it is the human gate, and CI runs the gate again on the PR.
  - **The gate** compares every snapshot with the committed one. It **restores** what got worse: texts judged by rules in `gates/text.py`, photos as a group with their credit, and country facts that vanished. It lists changed safety-relevant facts **for review**. It **blocks** big losses and too many restores, since a broken source should not quietly ship stale data everywhere.
  - **Visa rules are never restored:** an old rule may be wrong today, so losses and waves of changes block and a human decides.
  - **Weekly live-provider check** (`providers-check.yml` → `checklist/live-check.ts`, the production providers with no cache): opens an issue when a source breaks.
- **Alternatives:**
  - Auto-merge or auto-deploy after the gate (rejected: reference data feeds visa and safety advice);
  - a hard failure on any regression with no repair (rejected: every month would need hand fixes for a handful of Wikidata edits);
  - keeping the old value for every changed field (rejected: it would also freeze legitimate updates);
  - pg_cron inside Supabase (rejected: the pipeline is Python with committed snapshots, and review happens in git).
- **Trade-offs:**
  - Thresholds are guesses tuned on today's data (`gates/limits.py`), and an intended big change needs the `data-gate-override` label.
  - A PR opened with `GITHUB_TOKEN` does not trigger CI, so a `DATA_REFRESH_TOKEN` secret is needed.
  - The visa source is archived, so its refresh is a no-op until it is replaced.

## D-043 — A group chat per walk list, for its organiser and everyone going

- **Context:** saying "I'm going" to a walk list (D-041) should give access to a group chat where everyone going and the organiser exchange instant messages. People who do not want the chat can just save the public list (D-035) instead; saving and rating stay open to every signed-in user.
- **Decision:**
  - **Membership is attendance:** a chat member is the list's organiser, or someone in `walk_attendees` while the list is public (`is_walk_chat_member`). "Not going" leaves the chat; a list made private keeps only its organiser in it. No separate membership table.
  - **Messages:** `walk_messages` (trip, author, body 1–1000 characters stored trimmed, time). RLS: members read and insert as themselves; nobody updates or deletes (privileges revoked). `list_walk_messages` (security definer) adds each author's public name and photo, newest first (up to 200; the app loads 100).
  - **Instant delivery: Supabase Realtime** `postgres_changes` on `walk_messages` (added to the `supabase_realtime` publication), which applies the same select policy to each subscriber, so non-members receive nothing. The app follows one chat while its screen is open and refetches on each insert and once the subscription is confirmed (a message posted between the first read and that moment was missed otherwise — found by the two-browser E2E). The client is behind a small interface (`lib/realtime.ts`) so tests use a fake.
  - **Where:** `/walk-chat?id=…` (a query parameter, like `/shared`, so static hosts need no rewrite), opened from **Open group chat** on the shared list's meetup banner (members) and on the organiser's list page. Non-members see "Only people going can chat".
- **Alternatives:** Realtime _broadcast_ channels without storing messages — no history for late joiners and no RLS; a third-party chat service — another provider, data and account model for a small feature; polling — not instant and more requests.
- **Trade-offs:** no editing, deleting, reporting or moderation of messages yet; no push notifications (messages arrive only while the chat is open); only the newest 100 messages are shown; messages stay after their author leaves the meetup.
- **Revised by D-044:** delivery no longer relies on Realtime events alone, and any public list can be joined.

## D-044 — Participation and group chat as one reliable flow

- **Context:** the owner reported the walk list participation and group chat "not working perfectly" and asked for the whole flow to be audited: "I'm going" on a public walk list makes you a participant; all participants share one chat of that list; messages persist and reach everyone.
- **Findings** (reproduced with three users against the local stack):
  - **Root cause — delivery relied on Realtime events only.** Supabase Realtime delivers `postgres_changes` at most once; after the Realtime service (re)starts, the first subscriber is told `SUBSCRIBED` before changes flow, and messages sent then never reached anyone (reproduced deterministically by restarting the service). The app re-read the chat only on its own sends and on subscribe, so a lost event left the message invisible until someone wrote again or the chat was reopened.
  - Joining was not idempotent: a repeated request failed with a duplicate key (`23505`), and the button showed no error and kept a stale state.
  - "I'm going" existed only on future meetups (D-041): public lists without a time, or whose time had passed, could not be joined, so they had no chat.
  - Members could not see who was in the chat.
  - Checked and correct: one chat per list by construction (the chat is the list, `walk_messages.trip_id`; there is no chat row that two joins could create twice), the same history for every member, isolation between lists, persistence across reloads, and denial for non-participants, participants of other lists and signed-out users (RLS, also through direct API calls). `channel()` reusing an existing topic was checked and does not lose the subscription on remount.
- **Decision:**
  - **Reconcile with the server:** the chat query is always re-read when the chat opens, on focus (on iOS/Android through React Query's focus manager wired to `AppState`, off for other queries) and every 10 s while open (`CHAT_RECONCILE_MS`), on top of Realtime and the re-read on subscribe. Realtime keeps it instant; the re-read guarantees a message shows within ~10 s when an event is lost — verified with Realtime stopped.
  - **`set_walk_attendance(trip, attending)`** (security definer): idempotent join/leave (`on conflict do nothing`; the primary key also guards simultaneous joins), returns the caller's state and the count; `42501` for private, own or missing lists. The app refreshes the list, shared page and listings after success **or** failure, and shows an error on failure, so the screen never claims a participation that did not happen.
  - **Any public list of someone else can be joined** (`walk_open_to_join`), with or without a time, before or after the start; the **Walk together** card (join, count, chat) is on every public list. Meetup listings are unchanged (future starts only).
  - **`list_walk_participants`** (members only) for "3 people: Ana (organiser), You, Cid" in the chat. The chat keeps its field above the keyboard on phones (`KeyboardAvoidingView`).
- **Alternatives:** replacing Realtime with polling alone — slower for everyone; Realtime _broadcast_ with an acknowledgement protocol — more moving parts for the same guarantee; a separate `chats` table with a unique `trip_id` — a second entity for an identity the list already has.
- **Trade-offs:** a lost event shows up to ~10 s late; each open chat makes one small request every 10 s; joining a list whose meetup has ended is allowed (harmless, keeps the chat reachable).

## D-045 — Public traveller profiles, linked from reviews and chat messages

- **Context:** the owner wants the author's name on a review or a chat message to open that person's profile: name, photo, when the account was created and their public walk lists ("playlists" in the request).
- **Decision:**
  - **A public id, not the account id:** `profiles.public_id` (random, unique) is what `list_reviews`, `list_walk_messages` and `list_walklists` return (`author_public_id`) and what `/traveller?id=…` uses, so the account id still never leaves the database (D-028).
  - **`public_profile(public_id)`** (security definer, signed-in users only, like reviews and chats) returns only name, photo path, member since (`profiles.created_at`), number of public walk lists and whether it is the caller; the profiles table stays owner-only (no nationality, passport or email). Unknown ids are `not_found`.
  - **Walk lists on the profile** reuse `list_walklists` with a new `p_author` filter: public lists only (never private or password ones), newest first, with the usual cards (View / Save) and **Load more**.
  - **Links:** one `AuthorName` component — the name as a link (role `link`) on review cards and on other people's chat messages; authors without a public id stay plain text.
- **Alternatives:** exposing the account id (simpler, but reverses D-028 and ties links to auth); a username/handle (users would have to choose one).
- **Trade-offs:** profiles need an account to view; walk list card bylines and the chat's participant list do not link yet; the profile shows no reviews or bio.

## D-046 — Walking routes always follow the streets when OpenRouteService answers

- **Context:** the owner saw routes drawn as straight lines between destinations and asked for paths that follow the streets that can be walked, like Google Maps, so the user can follow them on the map.
- **Findings** (reproduced by calling the running function):
  - Every route came back as the labelled straight-line estimate: the ORS `/optimization` endpoint answered **403 "Quota exceeded"** (its free daily quota is small and the E2E runs use it), and the route geometry came only from that call, so any optimisation failure dropped the street path too.
  - The ORS directions endpoint (separate, larger quota) was not used at all. Once used, three more real-API issues showed: the GeoJSON endpoint answers **406** to `Accept: application/json`; a stop far from any footway (Lisbon's 25 de Abril Bridge, mid-river) fails the whole route (**404, error 2010**) unless stops may snap (`radiuses: -1`); and per-leg segments only come with `instructions: true`.
  - In manual order, "Optimise" reordered the stops anyway, so the path could differ from the order the user set; the walk between stops in the list was always a straight-line estimate.
- **Decision:**
  - **A cascade that keeps the street path:** automatic order → ORS optimisation (order + path); if it fails → the local shortest straight-line order walked with **ORS foot-walking directions**; straight lines only when neither answers (labelled, not cached). Directions results are cached 30 days (`route:ors-path`) and a local-order path one day (`route:ors-local`), so the optimiser is tried again soon.
  - **`keepOrder`** in the request: an order set by hand is kept and only its path is computed (directions, cached by that order).
  - Directions requests send `Accept: application/geo+json, application/json`, `radiuses: -1` per stop (snap to the nearest walkable point) and `instructions: true` (per-leg segments). Each is covered by a regression test.
  - The stop list shows each leg's street distance and time once computed ("1.5 km · 18 min on foot"); "≈" estimates only before.
- **Alternatives:** a public OSRM/Valhalla demo server — no service agreement for production use; self-hosting a router — heavy for this stage; paying for a higher ORS quota — useful later, but the cascade is needed anyway for any outage.
- **Trade-offs:** when the optimiser is unavailable the order is shortest by straight-line distance, not by walking distance; a snapped stop's path ends at the nearest footway, not at its marker (e.g. a bridge seen from the shore); routes saved before as estimates keep their straight lines until rebuilt; the free directions quota still bounds usage.

## D-047 — Free and Premium plans, first version, without payments

- **Context:** the owner wants a first subscription layer: Free (€0: up to 5 lists, 5 places per list, no deleting lists) and Premium (€5/month: unlimited lists and places, deletes own lists), enforced by the backend, with a plans page, "Upgrade" in the top bar and Settings → Subscription — and no Stripe, checkout or billing yet, but a model ready for them.
- **Decision:**
  - **Plans are data:** a `plans` table (price in cents, currency, interval, `max_lists`, `max_items_per_list` with null = unlimited, `can_delete_lists`, one default). It is the single source for the database and the app — no limit or price is written in code or UI text; a new plan is a new row.
  - **Subscriptions apart from the user:** `subscriptions` holds one row per subscription (history), with status (`active`, `cancelled`, `expired`, `past_due`), start, end of period, cancellation time and the provider's ids — room for Stripe or another provider (User → Subscription → Plan → Payment provider). Only the service role writes it (the payment side, later webhooks); users read their own. No row = Free, so existing accounts need no migration of data.
  - **One rule for "has the plan":** `subscription_grants_plan(status, period_end)` — today only `active` and unexpired; cancelled-until-period-end, grace periods and the like change it in one place. `effective_plan(user)` and `my_subscription()` build on it.
  - **Enforced in the database for user requests:** triggers on `trips` (lists, `WF001`) and `trip_stops` (places, counted after the statement so a whole list saved at once is checked, `WF002`), the `trips` delete policy plus `delete_trip` (`WF003`). They act when the request runs as `authenticated`; admin writes (service role, seeds, migrations) are not limited. Data over a limit is never removed — only new lists, new places and deletes are refused. Account deletion still cascades.
  - **The app reads the same rules:** `@wayfarer/shared` has pure checks (`canCreateList`, `canAddItemToList`, `canDeleteList`, `itemCapacity`) over the plan from `my_subscription`, and maps `WF001`–`WF003` to `PlanLimitError`; the route tray holds as many places as the plan allows, saving checks lists and places first, and the trip page shows deleting as a Premium feature. One `PlanLimitNotice` explains each limit from the plan's values and links to the plans page.
  - **Checkout is a stub:** `startCheckout(planId)` answers "unavailable"; "Upgrade to Premium" says payments are coming soon. The next round replaces it with the provider's checkout and writes subscriptions from its webhooks.
  - **Premium's "unlimited places"** stays within the walking route limit of 20 places (D-030), a routing limit on every plan (said on the plans page).
- **Alternatives:** a `plan` column on `profiles` — no history, status or provider ids, and users could update their own profile row; limits as constants in the shared package — a second source the database could disagree with; enforcing in the app only — bypassable with a direct API call.
- **Trade-offs:** each list/place insert reads the plan (cheap, indexed); limits are checked per request, so two simultaneous saves at the edge of a limit could both pass (acceptable for a first version); Premium is not purchasable yet.

## D-048 — Nicknames: sign in with a handle, checked in the database before Supabase Auth

- **Context:** users want a nickname at sign-up, to sign in with it instead of the email and to be recognised in the walk chat (own messages included, instead of "You"). Supabase Auth signs in only by email or phone.
- **Decision:**
  - **The nickname** is `profiles.nickname`: unique, lowercase `a-z 0-9 _`, 3–20 characters, never containing `@`. That makes the sign-in field unambiguous (Email or nickname).
  - **Signing in with a nickname** calls `login_email_for_nickname(nickname, password)`. It checks the password against `auth.users` (bcrypt) and only then returns that account's email. The app then calls Supabase Auth's normal password sign-in, so sessions, rate limits and email confirmation stay Supabase's.
  - **Brute force:** because the function checks passwords outside the Auth rate limit, 10 failures per nickname in 15 minutes lock it (`nickname_login_failures`, no client access).
  - **The sign-up nickname** travels in the user metadata. `handle_new_user` keeps it only when it is valid and free, so a race never fails the sign-up; onboarding asks again.
  - **The chat** shows `@nickname` for every author.
- **Alternatives:**
  - an RPC returning the email for any nickname (rejected: anyone could read anyone's email);
  - an Edge Function proxying the Auth password grant (rejected: every sign-in would share the function's IP for the Auth rate limit, plus an extra service);
  - making the nickname the email local part, or a fake `nick@…` email (rejected: breaks email confirmation, magic links and recovery).
- **Trade-offs:**
  - Nickname sign-in takes two requests.
  - The lock can be used to block someone's nickname sign-in for 15 minutes (email sign-in is unaffected).
  - Nicknames are public, and `nickname_available` confirms whether one exists.

## D-049 — Security CI: CodeQL, dependency review, gitleaks, audits and actionlint

- **Context:** CI proved the code builds and its tests pass, but nothing reviewed it for vulnerabilities, leaked secrets, vulnerable dependencies or broken workflow files.
- **Decision:**
  - **A separate `Security` workflow** (`.github/workflows/security.yml`) runs on PRs, on `main` and every Monday. The weekly run catches advisories published after a merge. Keeping it out of `ci.yml` means a new advisory never blocks the product checks.
  - **CodeQL** with `security-and-quality` queries for `javascript-typescript` and `python`, `build-mode: none` (nothing to compile). It is free because the repository is public.
  - **Dependency review** fails a PR that adds a dependency with a high or critical advisory.
  - **gitleaks** scans the full history with the release binary pinned to a version, not `gitleaks-action` (which needs a licence for organisation accounts).
  - **`pnpm audit --audit-level high`** and **`pip-audit`** cover what is already installed.
  - **actionlint**, pinned to a version, checks the workflows themselves.
- **Unpatched advisories:** `node-forge` (GHSA-86w9-cpqp-85rv) reaches only `@expo/cli`, the dev server, and has no fixed version. It is ignored in `pnpm-workspace.yaml` (`auditConfig.ignoreGhsas`) with its reason, to be removed once Expo ships a fix. Moderate advisories are reported but don't fail.
- **Alternatives:**
  - Snyk or Socket (rejected: an external account and token for what GitHub gives a public repository for free);
  - `pnpm audit` at `moderate` (rejected: fails today on unpatched transitive packages of Expo that the project cannot fix);
  - AI review of every PR (not now: needs an API key secret and has a cost per PR).
- **Trade-offs:**
  - Pinned tool versions need manual bumps.
  - The ignore list must be reviewed on every Expo upgrade.
  - Dependency review needs the dependency graph, which is on by default only for public repositories.

## D-050 — Photos load at the Commons width they are shown at

- **Context:** the pipeline stores each place's 960 px Commons thumbnail, and every card, list row and search suggestion loaded it: the Home downloaded 11.1 MiB of city photos before any scrolling (18.4 MiB after it), and a 64 px route row loaded ~296 kB where a 120 px thumbnail is ~6.5 kB (Berlin's 20 most popular photos: 960 px 296 kB, 500 px 87 kB, 330 px 40 kB, 120 px 6.5 kB).
- **Decision:** `Thumbnail` picks the smallest Commons standard width (120, 250, 330, 500, 960) covering 80% of the box's physical pixels (`thumbnailWidthFor(layout width, pixel ratio)`). Fixed boxes pass their size (rows 64, suggestions 40, markers 36/48); cards measure themselves first. Heroes keep the 960 px photo.
- **Alternatives:** expo-image's source arrays (rejected: selection differs per platform — CSS pixels on web, pixel count on iOS — and needs each source's height, unknown before loading); full coverage (100%) instead of 80% (rejected: a 282 px card on a 2× screen would still need the 960 px photo).
- **Trade-offs:** a measured card shows its photo one layout later; photos may be up to 20% under the screen's density (not visible on photos); only `/thumb/` URLs are resized (smaller originals load as they are). Measured: Home 11.1 → 1.35 MiB before scrolling, 18.4 → 2.0 MiB after (1× screen).

## D-051 — City map: one photo marker per place, memoised

- **Context:** the performance audit suspected the city map's up to 300 DOM photo markers of slowing panning (19 fps) and selection (282 ms). Re-measured properly — warm tiles, GPU rendering, CPU slowed 4× and 6× — 300 markers pan at 60 fps (as with the markers hidden), and a selection opens its card in 13–50 ms, React taking ~4–5 ms of it: the first numbers came from software WebGL and an open search dropdown.
- **Decision:** keep one photo marker per place (D-029). Markers are memoised (`samePhotoMarker`, stable press handlers), so a new selection re-renders the two markers it changes instead of all of them.
- **Alternatives:** photo markers only for the 60 most popular places in view, dots for the rest (built, then reverted: no measured gain on web, and a visible change); a symbol layer with clustering (not needed on web).
- **Trade-offs:** native (MapLibre React Native view annotations on Hermes) was not profiled; revisit with on-device numbers before changing the map's look.

## D-052 — Category filters run on the device

- **Context:** each category tab combination was a new `attractions_in_view` request, and the map emptied (300 → 0 markers) until it answered.
- **Decision:** the city page loads all of a city's places once (cities hold ≤ 300, under the 500 the page asks for) and filters by category on the device, in the server's order. A list cut at the 500 limit — no city today — falls back to filtering on the server.
- **Trade-offs:** none visible: same places, same order; the first load is the only request.

## D-053 — Edge Functions verify the access token locally

- **Context:** `requireUser` asked Supabase Auth for the user (`getUser`) on every `checklist` and `route-optimize` call: 14–17 ms of a ~30 ms warm checklist call locally, one Auth round trip per call in production.
- **Decision:** `auth.getClaims(token)` verifies the token against the project's JWT signing keys (JWKS, cached; 0.3 ms) and requires `role: authenticated` and a `sub`, so the anon and service keys are still rejected. The verifier depends on a thin interface (`ClaimsClient`), faked in tests.
- **Trade-offs:** a token stays valid until it expires (1 h) after its user signs out — acceptable for these compute-only functions. Projects still on the legacy shared JWT secret are verified by Auth as before (no gain, no regression): the hosted project should use asymmetric signing keys.

## D-054 — Edge Function cache in memory, served stale while it refreshes; checklist reads in parallel

- **Context:** every checklist call read each cached source from `api_cache` over the network (the whole advisory index: 36 kB for one country), and the daily refill of a slow source made that call wait (the GAC index takes 1–12 s). The city, its countries and the visa rules were three reads one after another.
- **Decision:**
  - `createCached` keeps a small in-isolate memory (256 entries) in front of `api_cache`, fetches each key once at a time (single-flight), and with `staleFor` answers an expired value at once while `EdgeRuntime.waitUntil` refreshes it: advisories and exchange rates up to 7 days, climate up to 30. Forecasts are never answered stale. Expired rows are purged only after 30 days.
  - `checklist_place` (city + its country + the home country) and `visa_options_for_city` are read together; the visa read stays separate so that its failure only marks the visa section unavailable.
- **Trade-offs:** an advisory or rate can be up to a week old for the request that triggers its refresh; each isolate keeps its own memory. Measured: a warm checklist call 30.1 → 6.8 ms locally (with D-053).

## D-055 — Rating totals kept by triggers; walk lists sort from an index

- **Context:** `list_walklists` aggregated the reviews of every public list of a city before sorting (85 ms at 20k lists; ~210 ms once plpgsql's plan cache switched to a generic plan; 206 ms for "newest", 1.3 ms with a custom plan), and the city cards' ratings aggregated every review of the city's places (16.5 ms at 60k reviews, sorting on disk).
- **Decision:** walk lists carry `review_count`, `rating_sum` and `rating_avg`; places have `attraction_review_totals`. Statement-level triggers on `reviews` sum each statement's rows per target (one update per list or place, however many reviews a statement touches). `rating_avg` is `round(rating_sum / review_count, 2)`, the value `round(avg(rating), 2)` gave. A partial index serves the "top" sort; `list_walklists` always gets a custom plan (`plan_cache_mode`).
- **Alternatives:** row-level triggers (rejected: a bulk insert updated a list once per review, leaving hundreds of row versions — reads of that list went 1.3 → 8 ms until vacuum); a materialised view (rejected: stale between refreshes).
- **Trade-offs:** each review also writes its target's totals; `trips.updated_at` now follows the list's own columns only. Measured at 20k lists / 60k reviews: top 210 → 0.5 ms, newest 206 → 1.1 ms, meetups 28 → 0.5 ms, city cards 16.5 → 0.12 ms; totals equal the reviews' aggregates on the local data.

## D-056 — The walk chat re-reads only what is new

- **Context:** each open chat re-read its newest 100 messages every 10 s and on every live event (D-044), for every member, plus the participant list every 10 s.
- **Decision:** after the first read, re-reads ask `list_walk_messages(p_after)` for the messages since a minute before the newest one shown (a message is stamped when its transaction starts, so it can be saved after a newer one was read) and merge them by id; a full page replaces the list. The participant list is re-read every 30 s.
- **Alternatives:** Realtime Broadcast instead of Postgres Changes (later: it changes the channel authorisation, and the load is low today).
- **Trade-offs:** someone who joins appears within 30 s in the participant line instead of 10 s.

## D-057 — Trip pages in one request

- **Context:** the owner's trip page and a shared link read the trip, then its stops' places: two requests one after another.
- **Decision:** the owner's page embeds the stops' places (`trip_stops(attraction_details(…))`); `shared_trip` also returns `stops` in walking order. An app talking to a backend without `stops` reads them separately, as before.
- **Trade-offs:** none visible; `stop_ids` stays for apps built earlier.

## D-058 — zod's unused locales are left out of the bundles

- **Context:** zod re-exports every locale (`export * as locales`) and Metro does not tree-shake: 267 KiB of the 2.75 MB web entry bundle (39 KiB gzipped), unused by the app. Expo's experimental tree shaking did not remove it.
- **Decision:** `metro.config.js` resolves zod's locale index to an English-only stub (`scripts/metro/zod-locales.js`); English messages, which zod imports directly, are unchanged.
- **Trade-offs:** a build-time hook tied to zod 4's layout (unit-tested; a zod upgrade that moves the file just stops matching). Measured: web entry bundle 2,752 → 2,468 KiB, 717 → 678 KiB gzipped.

## D-059 — Web fonts: Inter as WOFF2, the app's own cut of Material Symbols

- **Context:** the web loaded Inter as four uncompressed TTFs (~335 KiB each, ~160 KiB gzipped) and, through expo-symbols, the whole Material Symbols font (943 KiB; 420 KiB gzipped) for 51 icons; the splash screen waits for the fonts.
- **Decision:** `scripts/build-web-fonts.py` (fonttools) writes Inter unchanged as WOFF2 (~114 KiB per weight; every glyph kept, as the data has Greek and Cyrillic text) and Material Symbols cut to the app's icons, by code point (3.9 KiB). On the web, `Icon` (`icon.web.tsx`) draws the glyph itself and the fonts load with the app's other fonts; iOS and Android are unchanged. A unit test fails when an icon is added without rebuilding the fonts.
- **Alternatives:** Latin-only Inter subsets (51 KiB per weight; rejected: Greek and Cyrillic names and credits would fall back to another font).
- **Trade-offs:** the fonts are generated files kept in the repository (with their licences: OFL 1.1 and Apache 2.0); new icons need the script. Measured: fonts on a cold start 2.28 MB raw / ~1.06 MiB gzipped → 460 KiB; the web entry bundle lost expo-symbols too (2,468 → 2,383 KiB).

## D-060 — Cities are ingested side by side

- **Context:** `ingest --all` ran cities one after another (30–60 min without a cache), each waiting on Wikidata, Overpass, the pageviews API and Commons in turn.
- **Decision:** `ingest --all --jobs N` ingests N cities at once (the monthly refresh uses 3). The HTTP client's per-host gates are shared, so each API keeps its own rate limit; the Wikidata class cache is shared and updated under a lock; each city is written as soon as it is done; prettier runs once over every file instead of once per city.
- **Trade-offs:** log lines of different cities interleave (each keeps its `[city]` prefix); the default stays one city at a time.

## D-061 — Listings read only their page; a walk chat hears joins instead of polling

- **Context:** on a synthetic dataset (20k public lists in one city, 389k reviews, one list with 3,000 reviews and 2,000 people going), `list_walklists` computed each card's extras (stops, cover, attendees, flags) for every row `OFFSET` skipped (84–116 ms at offset 1000), its saved filter checked a correlated `exists` on every public list (36 ms), and "lowest" / "most reviewed" sorted the whole city (24–25 ms). `list_reviews` and `rating_summary` ran the reviews policy's security-definer `trip_visible_to_caller` once per review (9.2 and 6.3 ms for one list). `shared_trip` recounted reviews already totalled in D-055. Each open chat re-read all its participants every 30 s.
- **Decision:** `list_walklists` selects the page first (from an index per sort) and builds the cards for those rows only, in the page's order; saved lists are looked up by id (`t.id = any(array(…))`, read once). Indexes for the lowest and most-reviewed sorts; the newest sort takes over `trips_public_city_idx`. `list_reviews` checks the visibility once and always gets a custom plan, with newest-first indexes per target. Per-star totals per walk list (`trip_rating_counts`, kept by a statement trigger, readable under the same rule) feed `rating_summary`; places and cities still aggregate. `shared_trip` reads `trips.review_count` / `rating_avg`. `list_walk_participants` returns the count and the first `p_limit` people; joins and leaves are broadcast on a private Realtime topic per list (`walk-people:<trip id>`, members only), so the chat re-reads its people then, and every 5 min otherwise. `subscription_grants_plan` is stable.
- **Alternatives:** a separate `UNION ALL` branch for saved lists (rejected: the planner kept it as a subquery and lost the newest-first index, top 1.7 → 16 ms); a security-definer `rating_summary` (rejected: bypasses RLS and the advisor flags it); adding `walk_attendees` to the Realtime publication (rejected: rows are owner-only, so members would never hear of others, and delete events reach every subscriber regardless of RLS).
- **Trade-offs:** every review now also writes `trip_rating_counts`, and the trips row carries three sort indexes plus newest (each review rewrites that row); the people line can miss a name or photo change for up to 5 min; apps built before get at most 100 participants. Measured: offset 1000 ~100 → ~2 ms, lowest / most reviewed ~25 → 1.8 ms, saved 36 → 0.5 ms, a list's reviews 9.2 → 0.2 ms, its summary 6.3 → 0.1 ms, participants (2,000 going) 11.5 → 1.9 ms; answers identical to the previous definitions in every sort and page (pgTAP compares them over 47 combinations).

## D-062 — Lighter city pages: small marker photos, indexed search, cached headers, one minute clock, MapLibre CSS on demand

- **Context:** markers loaded the 120 px thumbnail (~8.5 kB) where 60 px (~3.5 kB, a Commons standard width) covers a 36 px circle on 1×/2× screens — 300 markers ≈ 2.5 MiB per city open. The attraction search re-normalised every name twice per keystroke (~0.5 ms for 300 places). The attraction page showed a spinner although its list row was cached, and the Map / List page loaded only once opened. Toggling one stop re-rendered every card. Each meetup row ran its own 30 s timer and built `Intl.DateTimeFormat`s on every render. The static web export linked MapLibre's 83 KB stylesheet from all 44 pages.
- **Decision:** 60 px joins `COMMONS_THUMB_WIDTHS`, with the 80% coverage rule kept (D-050). `buildSearchIndex` keeps normalised names and words per city and ranks exactly as before; the grid and the map read `useDeferredValue(query)`. `useAttraction` returns `{ summary, detail }` and starts from the cached `['attractions', …]` row. The city hub prefetches the same query definitions the attractions page uses. `AttractionCard` is memoised with handlers that take the place; `CardGrid` uses `windowSize` 7 and `removeClippedSubviews` on native. One `MinuteClock` (`useSyncExternalStore`) ticks on the minute while a focused screen listens and the app is in the foreground; `dateFormatCache` (shared) keeps one formatter per locale and time zone. `maplibre-gl.css` is copied to `public/maplibre/` and linked by the map when it is created.
- **Alternatives:** a dynamic `import()` of the CSS (rejected: Expo's static export links every CSS asset, async chunks included, from every page). Removing react-native-reanimated / worklets / gesture-handler (rejected for now: they stay installed and autolinked as required peers of expo-router's `react-native-drawer-layout`; excluding them from autolinking risks iOS's `ExpoModulesWorkletsAdapter` and needs a native build to confirm).
- **Trade-offs:** photos up to 20% under screen density, as in D-050; the attraction photo's credit line is blank until the details arrive; countdowns can lag by up to a minute; the first map waits for one extra stylesheet request. Measured: marker photos ~2.5 → ~1.0 MiB per city (1×/2×); search ~490 → ~32–60 µs per keystroke (index ~0.25 ms per city); 44 → 0 pages linking MapLibre's CSS.

## D-063 — Upstream outages are not waited on by every request; cache writes after the response

- **Context:** during an OpenRouteService outage every `route-optimize` request waited up to 8 s for the optimiser, then up to 8 s for the directions, before the straight-line fallback. When a slow source behind `staleFor` was down (the GAC advisory index, for days at a time), every checklist call re-read the stale row from `api_cache` and started another refresh with a 20 s timeout. Every cache miss also waited for the `api_cache` upsert, and the forecast was cached per trip window, so each date range was its own Open-Meteo call.
- **Decision:** one small per-isolate circuit breaker (`_shared/breaker.ts`, injected clock). `route-optimize` runs each ORS service through it (`ors:optimize`, `ors:directions`, separate quotas): after a 429, 5xx or timeout that service is skipped for 60 s (ORS limits are per minute) and the existing fallback answers at once; a 403 (quota) or a malformed answer does not trip it. In the cache, a failed background refresh trips its key for 5 min, while the stale value is answered from memory. Cache writes go to `EdgeRuntime.waitUntil`; memory is set before the response. The forecast is fetched once per place and UTC day for the whole range Open-Meteo accepts with explicit dates (today to today + 15) and cut to the trip's dates — not `forecast_days=16`, which counts from the place's local day and drops the last day west of UTC (Honolulu, checked 2026-10-03).
- **Alternatives:** a breaker shared across isolates in the database (rejected: a round trip per request to learn of an outage the isolate finds in one call); keying the forecast on coordinates only with `forecast_days=16` (rejected, above).
- **Trade-offs:** each isolate learns of an outage from its own first failed call; for up to 60 s after ORS recovers that isolate still answers with straight lines; an advisory refresh is retried at most every 5 min per isolate; a write that fails after the response is only logged; the forecast entry holds ~16 days, not ~7.

## D-064 — Fewer, bounded Wikidata queries in attraction ingestion

- **Context:** the monthly refresh spent most of its Wikidata time on details for items it then dropped: 55,720 of 75,657 candidates have 1–2 sitelinks and only 3,013 of those have an en/pt Wikipedia article, so ~52k items got the full details query only to fail `is_notable`. Wikidata ran one query at a time, and every host waited up to 360 s per attempt (×7), although WDQS stops queries at 60 s — one hung connection could take ~42 min of the 150-min CI timeout. The class-hierarchy cache was rebuilt on every CI run.
- **Decision:** items with fewer than 3 sitelinks first go through a cheap article check (500 ids per query, the same pattern as the details query's Wikipedia fields); only those that pass, plus the ≥ 3-sitelink items, get full details. Timeouts move into each host's policy: Wikidata 75 s per read / 90 s per request, Overpass 300 s / 360 s (its queries set `[timeout:300]`), 60 s / 120 s elsewhere. Wikidata runs up to 2 queries at a time, still one start per second. The refresh workflow caches `class_roots.json` with `actions/cache`, keyed on `categories.py` and the quarter.
- **Trade-offs:** one more query to keep in step with the details query; a full run drops from ~793 to ~418 SPARQL queries with the same output (verified live on Belfast, Edinburgh and Lisbon: identical JSON). A query that legitimately takes more than 90 s is retried and then fails. 2 parallel queries, not WDQS's 5, because GitHub runners share IPs. A class re-parented in Wikidata keeps its cached category until the key changes (next quarter or a `categories.py` change).

## D-065 — Walk chat and paid plans hidden behind build flags; plan limits lifted

- **Context:** the product owner asked, for now, to hide the walk group chat (going to a meetup must not mention or open a chat) and the paid subscription UI, and to drop the Free limits (5 lists, 5 places per list, no deleting). No payment is live (D-047), so the limits were a wall only Premium could lift, with no way to buy it.
- **Decision:** a small feature-flag module (`apps/mobile/src/lib/features.ts`) reads `EXPO_PUBLIC_FEATURE_WALK_CHAT` and `EXPO_PUBLIC_FEATURE_PAID_PLANS` at build time — off unless `true`/`1`, any other value a startup error — and exposes them through a context (`useFeatures`) so tests inject flags. Only entry points are gated: **Open group chat** and its hint, `/walk-chat` (redirects to the list), **Upgrade**, Settings → Subscription and `/plans` (redirects home); chat and plans code, routes and backend stay. The limits are removed outright: migration `20261006000100_plan_limits_lifted` drops the limit triggers, their functions and `plan_allows_deleting_lists`, makes the trips delete policy and `delete_trip` owner-only again, and sets the Free row to unlimited; the app's limit checks, notices and the shared limit helpers go. `plans`, `subscriptions`, `effective_plan` and `my_subscription` stay. Supersedes the chat entry points of D-043 and the limits and Upgrade / Settings UI of D-047.
- **Alternatives:** a constant `FEATURES` object in code (rejected: turning a feature on would need a code change and could not differ between staging and production); deleting the chat and plans UI (rejected: the owner wants them back later); keeping the limit triggers with an unlimited Free row (rejected: enforcement nobody needs, a data edit away from coming back by accident).
- **Trade-offs:** flags are baked into each build, so changing one needs a rebuild (no remote config); e2e specs for hidden features need the same variables at build and run time (`builtWith`). The walk chat's database, RLS and Realtime stay live while hidden, so a direct API client could still use it. Bringing limits back is a new migration (see `20261003000800`) plus the client checks from git history (d7cf1fe).

## D-066 — Our own email service: Resend behind a Mailer, Auth's Send Email Hook, a client-requested welcome email

- **Context:** the app had no password recovery and no welcome email. Auth emails used Supabase's SMTP with bilingual EN/PT templates, because Auth templates can't follow the user's language.
- **Decision:** Edge Functions send all mail through a small `Mailer` interface (`_shared/mailer.ts`): `ResendMailer` (HTTPS API) in production, `MailpitMailer` (Mailpit's HTTP API) locally, chosen by env and failing loudly when neither is set. Supabase Auth's **Send Email Hook** calls `auth-email` for every auth email; it checks the Standard Webhooks signature (`standardwebhooks`, wrapped) and writes the email in the profile's language (then the sign-up language, then English) from our templates. Recovery links go straight to `/auth/reset-password?token_hash=…`, where the app calls `verifyOtp`, instead of Auth's verify redirect with a PKCE `?code=`. The welcome email comes from `welcome-email`, which the app calls once onboarding is finished and again on later launches while `profiles.welcome_email_sent_at` is null; a claim in the database (`update … where … is null returning`) sends it once, and a failed send releases the claim.
- **Alternatives:** Auth's custom SMTP with Resend (rejected: one template per email type, no per-user language, and the welcome email would still need its own sender). Postmark, SendGrid or SES (comparable; Resend has the simplest API, a free tier of 3,000 emails per month, and works from Deno with a single fetch). A database webhook on `onboarded_at` for the welcome email (rejected for now: needs `pg_net` and a webhook secret per environment, harder to test locally). Auth's verify links for recovery (rejected: a PKCE code only works in the browser that asked, and mail scanners that open links use the token up).
- **Trade-offs:** auth email depends on our function and Resend being up, and Auth reports a failure to the user with no retry queue. A new Edge Function secret must be set and the hook enabled by hand in the hosted dashboard. The welcome email relies on the app being opened again after a failed send. The local hook secret is committed in `.env.example` (local only).

## D-067 — Coverage beyond Europe: Morocco, Southeast and East Asia, Brazil

- **Context:** the product owner asked to add Morocco, Myanmar, Thailand, Cambodia, Vietnam, Laos, Malaysia, Indonesia, the Philippines, China, Taiwan and Japan, then Brazil's 50 most visited cities and Petrolina. Until now every city was European (D-010).
- **Decision:** the same pipeline, config and checklist serve every country. Cities are picked per country among its best-known destinations: 2–5 in Asia and Morocco; for Brazil, the most visited by the Ministry of Tourism / Embratur international demand study and the Braztoa yearbook, plus the top domestic destinations. Where a municipality is huge (Beijing 16,411 km², Manaus 11,401 km²), reaches far offshore (Vitória's Trindade islands, Tokyo's Ogasawara, Da Nang's official area) or has no OSM relation, the city gets a centre-based bbox drawn around its sights, as already done for Córdoba, Gothenburg and Moscow. Some boxes include sights just outside the city because visitors go to them from there (the Great Wall at Badaling and Mutianyu, the Terracotta Army, Angkor, Prambanan); each choice is commented in `cities.yaml`. Temples, shrines, pagodas and mosques are landmarks (structure of worship), as Istanbul's mosques already were.
- **Alternatives:** limiting cities to their legal boundaries (rejected: mostly rural boxes for Chinese and Brazilian municipalities, and Vitória's box would be 11° wide); a curated list of attractions for Asia (rejected: hand-kept data, no refresh).
- **Trade-offs:** Wikidata covers many Asian and Moroccan cities thinly, so they have fewer places than European ones (attractions need an English name and three sitelinks or an English/Portuguese Wikipedia article); Portuguese names are rare there. Popularity still comes from English and Portuguese Wikipedia pageviews, which favours places known abroad.

## D-068 — Nature category for natural attractions

- **Context:** the expansion to Brazil and Southeast Asia (D-067) brings cities whose top sights are natural (Copacabana, Sugarloaf, Corcovado, Patong, Doi Suthep, Batu Caves). Beaches and mountains matched no category root, so they were dropped, and national parks were filed as parks (on Wikidata, national park Q46169 is a subclass of park).
- **Decision:** a new `nature` value in `attraction_category`, right after `park` (tabs: Parks, Nature, Palaces), with a forest / `mountain.2` icon, teal `#0F766E` and a 90-minute default visit. Roots: beach, waterfall, national park, nature reserve, nature park, state park, natural monument, marine protected area, geopark, cave, island, lake, lagoon, dune, mountain, hill, canyon, hot spring, natural arch. Nature ranks after landmark in PRIORITY, so natural features that carry memorials, cave temples or archaeological sites keep those categories and a city park with a reserve label stays a park; a class that reaches a nature root ignores its park root, so national, nature and state parks come out as nature. The same change adds madrasa, old town and medina quarter to landmark (mausoleums, tombs, city gates, pagodas, stupas and temples were already covered).
- **Alternatives:** protected area (Q473972) as a root (rejected: it also covers UK conservation areas, Dutch heritage districts and US historic sites — whole neighbourhoods); nature above park (rejected: botanical gardens, city parks and heritage caves would become nature); rivers, bays and seas (rejected: their coordinates are an arbitrary point of a large shape); historic district as a landmark root (rejected: plain neighbourhoods).
- **Trade-offs:** existing cities gain nature items only at their next re-ingest or monthly refresh; re-classifying today's attractions moves only 7 national parks from park to nature, but capped cities that gain beaches or hills may trip the data gate's 30%-replaced rule then. Islands and hills that are whole neighbourhoods (Ilha do Governador, Djurgården, Montmartre) appear as nature. Indonesian madrasah schools sit under madrasa; the notability rule keeps most out.

## D-069 — Passport assumed valid; no expiry date at onboarding

- **Context:** the product owner asked to remove the passport expiry date from account registration for now and to treat the traveller's passport as always valid.
- **Decision:** onboarding drops its third step (passport expiry) and finishes after nationalities. `checkPassportValidity` returns `ok` when there is no expiry date (it returned `unknown`); with a date, `problem` / `warning` / `ok` are unchanged. The field stays in Edit profile and in `profiles.passport_expiry`, so the change is easy to undo.
- **Alternatives:** removing the column and the field everywhere (rejected: "for now", and an entered date still gives a useful check); keeping `unknown` with a softer message (rejected: the requirement is to assume a valid passport).
- **Trade-offs:** a traveller whose passport expires before the required date sees **ok** unless they added the date in Edit profile. The `unknown` status and its message remain in the schema and translations but are no longer produced.

## D-070 — Wikipedia introduction and History excerpt on city and attraction pages

- **Context:** the product owner asked for richer city and monument texts — what happened there, why a church or monument matters and why to go — each with a link to the source's full text, starting with European cities. City pages showed only the first paragraph of the Wikipedia article (D-036); attraction pages only Wikidata's one-line description ("church in Lisbon").
- **Decision:** both pages show the article's whole introduction (the paragraphs before the first heading, up to 3,000 characters) and an excerpt of its History section ("History" / "História"; subheadings dropped, whole paragraphs up to 1,500 characters), verbatim, with "From Wikipedia · CC BY-SA 4.0" and **Read the full article on Wikipedia**. One MediaWiki `prop=extracts&explaintext&exsectionformat=wiki` request per article returns the plain text with heading lines; disambiguation and missing pages give nothing. Texts follow the app language and fall back to the other language as a whole (introduction, history and link always from one article). Attraction texts live in `data/attraction_texts/<slug>.json`, apart from `data/attractions`, so ingesting places and fetching texts run separately; `seed` joins them by Wikidata id. Both commands take `--region europe` (countries with a `Europe/` timezone) or `--city`. en/pt.wikipedia.org get their own rate limit (0.1 s between starts, 2 at a time; 429s back off).
- **Alternatives:** texts written by an LLM from the article, with a "why visit" paragraph (rejected by the product owner for now: cost for ~17,000 places × 2 languages, factual errors, review burden); machine-translating English texts into Portuguese (rejected for the same reasons — Portuguese users see the English text where there is no Portuguese article); Wikivoyage (travel tone, but listings rarely carry a Wikidata id to match and coverage is thin outside capitals); the REST summary for attractions (only the first paragraph, no history).
- **Trade-offs:** the tone is encyclopaedic: "why go" comes through in what the introduction says about a place (UNESCO, oldest church, royal pantheon), not as advice. The History excerpt is the start of the section, often the oldest period; the link leads to the rest. ~15,000 article requests for Europe (about an hour, cached in `.cache/wiki-extract`). Attraction texts are not in the monthly refresh or the data gate yet; the monthly `city-summaries` run refreshes every city, so other regions get the longer city texts at the next refresh.

## D-071 — Famous people on the city page, from Wikidata

- **Context:** the product owner asked for a card on the city page with historical figures, writers, musicians and artists.
- **Decision:** people born (P19) or died (P20) in the city item, with at least 20 sitelinks, best known first (sitelinks = Wikipedia editions with an article). Two cheap queries per city find them and one query per 100 reads labels (EN, else the `mul` label), descriptions, birth and death years, portrait and Wikipedia titles; a separate query maps their occupations to category roots by `P279*`: history (politician, monarch, ruler, military personnel, explorer, religious figure, philosopher, scientist), writer (writer), music (musician, composer, singer), art (painter, sculptor, architect, visual artist, photographer, film director). A person gets every category their occupations reach and is dropped with none. At most 12 per category and 40 per city. Portraits and credits come from Commons like attraction photos. New table `notable_people`, seeded from `data/people/<slug>.json` (`50_people.sql`); on the page, filter chips over a horizontal row of cards that open Wikipedia.
- **Alternatives:** one query joining birth and death places (rejected: Query Service timeouts on big cities); including places inside the city (P131) as birthplaces (rejected for now: also timed out, and districts are recorded unevenly); "artist" (Q483501) as the art root (rejected: it covers writers, musicians and actors); Wikipedia pageviews as fame (more requests; sitelinks already rank well); one category per person (rejected: no reliable primary occupation in Wikidata).
- **Trade-offs:** categories inherit Wikidata's occupation lists (a banker filed as writer); living politicians appear under historical figures; people tied to the city in other ways (lived or worked there) are missing; the fetch keeps Wikidata's one query a second, so all 198 cities take about two hours. Not in the monthly refresh yet.

## D-072 — A landing page for signed-out visitors on the web

- **Context:** the product owner asked for a premium landing page (Airbnb / Wanderlog quality) that says at once that Travelist turns a city into a personal list of places, with the app shown in phone mockups, real destinations, and the way in to sign-up and sign-in. Until now `/` sent signed-out visitors straight to sign-in.
- **Decision:** a new `(auth)/welcome` screen, built from the app's own design system (tokens, Inter, `Button`, `Tappable`, `BrandMark`, `PhotoCredit`) in `features/landing/`. The `(auth)` stack starts on it on the web and on sign-in in the native apps (`signedOutHome`). "Popular destinations" and the hero's "{N} cities in {M} countries" read `city_list`, which signed-out visitors can already read; the six featured cities are a slug list that skips any city the database lacks. The phone mockups are React views drawn from fixed data (`mock-data.ts`): real Belém places, names, categories and visit times from the database, Commons photos bundled small with their credits, and a MapLibre render of OpenFreeMap tiles for the map, so they look like the product and stay sharp at any scale. Gradients go through `theme/gradient.ts` (CSS `background-image` on the web, `experimental_backgroundImage` on native) instead of a gradient library; animations are a fade-in with `Animated`, skipped under reduced motion.
- **Alternatives:** screenshots of the running app (rejected: they go stale silently, blur when scaled and need a signed-in demo account to regenerate); a separate marketing site (rejected: a second stack to host and keep in sync); `expo-linear-gradient` / `react-native-svg` (rejected: new dependencies for two gradients and no vector art); showing the landing page in the native apps too (rejected: people who installed the app have already chosen it).
- **Trade-offs:** the mockups do not follow later changes to the Home or the walk list screens; their ratings are illustrative (reviews need a signed-in user), and the social-proof line has no number behind it. A hero photo of ~260 KB ships in the web bundle. Privacy and Terms are not linked until those pages exist, and there are no store badges until the apps are published.

## D-073 — Production: Supabase Cloud (Ireland) + static web on the existing VPS

- **Context:** the product owner asked to deploy the project on their VPS (Ubuntu 24.04, 2 vCPU, 7.8 GB), which already serves three sites through Apache (ports 80/443, Let's Encrypt), a Docker project, a system Postgres on 5432 and two Java apps on 8080/8081. The app depends on Supabase beyond Postgres (Auth, PostgREST, Edge Functions, Storage, Realtime).
- **Decision:** backend on Supabase Cloud — project `travelist`, region `eu-west-1` (chosen by the owner) — with migrations and seeds pushed by the CLI, the five Edge Functions deployed with the shared import map, secrets set in Supabase and Auth configured through the Management API (site URL, redirects, 6-digit OTP, email rate limit, Send Email hook → `auth-email` → Resend from `hello@travelist.live`). The web app is a static export on the VPS in `/var/www/travelist`, served by a new Apache vhost for `travelist.live` / `www` with its own certificate; `scripts/deploy-web.sh` rebuilds and publishes it.
- **Alternatives:** self-hosted Supabase on the VPS (rejected by the owner in favour of a managed backend: backups, upgrades and monitoring handled by Supabase, at the cost of the free tier's limits or $25/month); the VPS's existing Postgres with Supabase services pointed at it (rejected: needs Supabase's own roles, schemas and extensions, and would share a database with other projects); a separate static host for the web app (not needed: Apache already runs on the VPS with certbot).
- **Trade-offs:** on the free tier the project pauses after a week without traffic and has no point-in-time recovery; the database password and the Supabase access token stay on the deploying machine; the VPS firewall (ufw) is off and the Java apps on 8080/8081 are reachable from outside — outside this project, noted for the owner.

## D-074 — Continuous deployment from main with GitHub Actions

- **Context:** after D-073 production was published by hand from the owner's Mac (`db push`, `functions deploy`, `scripts/deploy-web.sh`); the owner asked for the site to receive every update as soon as `main` gets new code.
- **Decision:** a `Deploy` workflow triggered by `workflow_run` of **CI** (only successful runs of pushes to `main`) and by hand. It checks out the exact commit CI tested and runs, in order, `scripts/deploy-backend.sh` (migrations + seeds + every Edge Function) → `scripts/deploy-web.sh` (static export, rsync to the VPS) → a smoke test. Backend first, so a new web build never calls a schema or function that is not there yet. One deploy at a time (`concurrency`, no cancelling). Credentials live in a GitHub environment `production`: secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `VPS_SSH_KEY` (a dedicated key pair, not the owner's), variables for the public `EXPO_PUBLIC_*` values, the VPS host/user and a pinned `known_hosts`. The same scripts serve manual deploys, so the two paths cannot drift.
- **Alternatives:** a deploy job inside `ci.yml` (rejected: CI also runs on pull requests from forks of this public repo; a separate workflow keeps production secrets away from those runs); Supabase's GitHub integration for migrations (rejected: does not deploy functions with our import map nor the web app, so deploys would be split across two systems); pulling on the VPS (a cron `git pull` + build) (rejected: Expo builds need ~2 GB of RAM next to the VPS's other services, and the VPS would hold the repository and a Node toolchain).
- **Trade-offs:** a bad migration that passed CI reaches production without a human step — mitigated by CI running every migration and the pgTAP tests on a fresh database, and by the GitHub environment, which can be given required reviewers to add a manual gate later; the deploy key logs in as `root` because `deploy-web.sh` chowns the files to `www-data` (a dedicated deploy user owning `/var/www/travelist` would narrow it); `rsync --delete` removes the previous bundle, so a tab opened before a deploy reloads on its next lazy chunk; Supabase secrets, Auth settings and native builds stay manual.

## D-075 — Release gate: pull requests into dev, approved fast-forward to main

- **Context:** with D-074 every green push to `main` went straight to production. The owner asked for a manual approval and a gate: commits go to a `dev` branch, and only code every pipeline approved moves on to `main`, where the deploy happens.
- **Decision:** `dev` is the integration branch (PRs only, CI + Security required by a ruleset). A `Promote` workflow, triggered by the completion of CI or Security on a push to `dev`, asks `scripts/release-gate.mjs` whether both passed on that commit and whether it is still `dev`'s tip; then a job in environment `release` (required reviewers) waits for approval, pushes that commit to `main` as a fast-forward and calls `deploy.yml` (now `workflow_call` + manual dispatch, no longer triggered by CI on `main`). A ruleset lets only deploy keys update `main`; the single write deploy key's private half is the `RELEASE_DEPLOY_KEY` secret of the `release` environment, so it is readable only by the release job after approval (GitHub Actions cannot be a ruleset bypass actor in a personal repository). CI and Security no longer run on pushes to `main`: it only receives commits that passed on `dev`. `deploy.yml` stays the only path to production, and the deployed commit is byte-for-byte the one tested.
- **Alternatives:** an automatic PR dev → main merged by a person (rejected: a PR opened with `GITHUB_TOKEN` gets no CI runs, so required checks never report without a personal token, and the merge creates an untested merge commit); required reviewers on the `production` environment only, keeping pushes to `main` (rejected: no integration branch, and `main` would hold code that was never approved); auto-promotion without approval (rejected: the owner asked for a human gate).
- **Trade-offs:** releases are serial — what is on `dev` is released together, so an unfinished feature must stay off `dev` or behind a flag (D-065); `main` cannot take a hotfix directly — it goes through `dev` (or an owner edits the ruleset); any write deploy key added to the repository later can also update `main` — keep that one the only one. If `main` ever diverges from `dev`, the release fails without deploying until the branches are reconciled.

## D-076 — Phones centre titles, cards and the Reviews area

- **Context:** after the first iPhone review (headings, auth and hero centred), the owner found the city page still left-aligned on an iPhone: section titles, walk list card titles and the Reviews area. An audit at 390 × 844 measured 43 title-like texts more than 8 px off the screen centre across 11 signed-in screens, all coming from `Section`, `TripCard` and the review components.
- **Decision:** one rule, in `components/phone-centring.ts`: `useCentredOnPhone()` (true below the 600 px tablet breakpoint) and the `centring` styles. On phones `Section` centres its title and stacks its action below it; `TripCard` centres name, byline, facts and actions; the Reviews area centres its summary, bars, form and each review (avatar above name, date, stars and comment). Long reading text (Wikipedia paragraphs) stays left-aligned. `PageHeader` uses the same hook.
- **Alternatives:** centring per screen (rejected: the same three components appear on the city, attraction, walk list, trips and profile screens, and would drift); centring on every width (rejected: on tablets and desktop sections sit in columns and a left edge reads better).
- **Trade-offs:** a section action now takes its own line on phones (a little more height); centred multi-line review comments are slightly harder to scan than left-aligned ones, accepted for a consistent column; the profile header (avatar beside the name) stays a row.

## D-077 — Suggested walking routes, proposed by a local model in the pipeline

- **Context:** the product owner wants the app to suggest routes through a city's historic places, starting at the point nearest to the traveller (GPS or a chosen city), so people leave home, walk them and learn about the city through the linked Wikipedia pages; the suggestions should come from a **local** AI model. The app already has the places, the route builder and the Wikipedia links; it lacks the choice of which places go together.
- **Decision:** the model runs **in the data pipeline**, not in the app. `suggest-routes` takes a city's 80 most popular historic places, groups them by walking distance (≤ 2 km from the group's most popular place), and a planner proposes theme, EN/PT title and stops for each group: `OllamaRoutePlanner` (local Ollama server, answers constrained by a JSON schema that lists only the group's places) or `RuleBasedRoutePlanner` (no model, deterministic). Code validates every proposal (known places only, 3 – 8 stops, ≤ 5 km of walking, title/theme limits; two retries, then the rule-based planner takes that group), orders the stops for the shortest walk and writes committed snapshots → seed → `suggested_routes` / `suggested_route_stops` (reference data, readable by everyone, replaced by each seed). The app only reads them: it picks the covered city nearest to the GPS position (≤ 50 km) or the one the traveller chose, re-orders each route to start at the stop nearest to the traveller (`startFromNearest`), lists the routes nearest first and loads the chosen one into the route tray. The position never leaves the device.
- **Alternatives:** a model on the phone (`llama.rn` / ExecuTorch with a 1 – 3 B model) — rejected for now: 1 – 2 GB download, battery, native build only (no Expo Go or web), weaker answers and nothing to review before users see them; a model on the user's PC called by the app — only reachable on the same network; a hosted LLM API — not local and a per-request cost; routes computed on the phone by rules alone — works, but gives no theme or title, which is what lets a traveller compare routes (kept as the fallback planner). The model never invents distances, places or links: those come from data and code.
- **Trade-offs:** routes exist only for cities already ingested and are as fresh as the last `suggest-routes` run (not part of the monthly refresh or the data gate); the committed routes were written by the rule-based planner, whose titles are formulaic, and the Ollama planner has only been tested against a fake server, so the model choice (e.g. `qwen2.5:7b`) and the quality of its Portuguese are still to be compared on a fixed set of cities; there is no era data, so themes follow place categories; a per-user, on-demand route ("1 hour, medieval, ending at a café") would need the phone-side model and a café source (OSM `amenity=cafe`, ODbL), neither built.

## D-078 — Local mode: the app opens without a sign-in screen

- **Context:** the app is meant to run on the owner's own machine for now (local Supabase, local model), where a sign-in screen adds nothing; but trips and the profile belong to a user, so travellers still need an account to save their walk lists and visit them again.
- **Decision:** a build flag `EXPO_PUBLIC_LOCAL_MODE=true` (same mechanism as D-065, `lib/features.ts`) lets the root navigator open the tabs without sign-in or onboarding (the sign-in group is not shown). With no session, `AuthProvider` signs in **anonymously** (`supabase.auth.signInAnonymously()`, enabled by `enable_anonymous_sign_ins = true` in `supabase/config.toml`); the session lives in the browser like any other, `handle_new_user` creates its profile, and every tab (World, My city, My Trips, Profile) and **Save trip** work as for a signed-in user. If Supabase refuses the anonymous sign-in the app still opens, without an account. Profile hides **Sign out** in this mode, because the anonymous account has no login to come back to. Unset, nothing changes.
- **Alternatives:** hiding Trips, Profile and Save trip — leaves no way to keep a walk list; removing the guards — `save_trip` is granted to signed-in users only and would fail with "permission denied"; a fixed local user with a password — a hidden credential in the app.
- **Trade-offs:** the trips belong to the browser's anonymous session: clearing site data or a `db reset` loses them (an account with email would keep them across devices; not offered in local mode); `enable_anonymous_sign_ins = true` in `config.toml` must not be pushed to a hosted project that should not allow it; the language follows the device until a profile is edited.

## D-079 — First question, side bar "World" / "My city", and a local city builder

- **Context:** a local install should open by asking where the traveller wants to explore — their own city (by location) or any other city — and "my city" should work even for a city Travelist has not ingested: the places must be found online, with their sources, and walking routes planned from the traveller's position.
- **Decision:** in local mode (D-078) the root shows `/start` once: **My city** (pin) asks for the location and opens the routes tab; **A city elsewhere** (globe) opens the list of cities. The answer is kept in `localStorage` (a thin `ChoiceStorage` interface; native builds ask again each launch). Afterwards the side bar has **World** (the city list, "Where to next?") and **My city** (the suggested routes from the traveller's position, with the existing "choose another city" list). For the traveller's own city the app asks a local **city-builder service** (`wayfarer_pipeline serve`, `POST /places/resolve`, `GET /jobs/<id>`): it reverse-geocodes the position (Nominatim) to a municipality with a Wikidata item, and if the city is not in the database it runs the existing pipeline stages (attractions from Wikidata / Wikipedia / OpenStreetMap with source links, Wikipedia texts, routes from Ollama or the rule-based planner) and writes the result to the local Supabase in one transaction. The app shows the stage while it works and polls every 2 s. New cities live in `data-pipeline/data/local/` (git-ignored), never in `cities.yaml`.
- **Alternatives:** an Edge Function doing the research — Deno functions cannot run Ollama or the Python stages and are limited in time; ingesting every city of the world ahead of time — not feasible; asking a language model to list attractions directly — it invents places, so the model only plans routes over places found in Wikidata / OSM (D-077).
- **Trade-offs:** the service must be running next to the app (otherwise the app falls back to the nearest covered city within 50 km); a new city takes 1 – 4 minutes (Overpass allows one request per 5 s; big cities longer); built cities exist only in the local database, so a `db reset` removes them until they are built again; jobs are in memory, a restart resumes from the pipeline cache; notable people are not fetched for built cities; the service has no authentication and is meant for `127.0.0.1` only.

## D-080 — Any city by name, and saved cities

- **Context:** a traveller who is not at home (or whose city the app lacks) should be able to type the name of any city in the world, have it treated as their location for the moment, get its attractions researched online, and come back to it later without typing it again.
- **Decision:** **Change city** on the My city tab now has two result lists: the cities the app has (as before, browsing) and **Search the world** — places found by name through the city builder (`GET /places/search`, Nominatim, municipality-level places only, cached 10 minutes; asked after 3 letters and a 400 ms pause). Picking one sets its coordinates as the traveller's position (`setTypedPlace`), and its name and country go along to `POST /places/resolve`, so the service picks the city of that name and not the prefecture or province around the point (Nagasaki Prefecture was picked before); the existing flow then runs unchanged: resolve → build if the city is new (progress screen) → city card and routes starting at the stop nearest to that point. Every city the traveller is in (by GPS or typed) is saved — slugs only, `localStorage`, newest first, at most 12 — and listed in a **Saved cities (n)** drop-down on the same page; picking one makes the city's centre the position again. Storage moved to a small `lib/browser-storage.ts` shared with the first-question answer.
- **Alternatives:** a hosted geocoder (Google, Mapbox) — needs a key and a licence for storing results; autocompleting on the app's own 198 cities only — cannot reach a new city; saving cities in the database per user — the anonymous account (D-078) is per browser anyway, and a local list needs no migration.
- **Trade-offs:** search needs the city builder and internet (Nominatim allows one request per second, hence the pause and the cache); the saved list lives in the browser (clearing site data empties it, the cities stay in the database); a typed place and a GPS fix are indistinguishable once chosen ("Near you: Kyoto"), which is what was asked for; very small or ambiguous names can return the wrong place with the same name — the country is shown to tell them apart.

## D-081 — Plan your next trip: an interview, a shortlist built by code, a ranking by the local model

- **Context:** the owner wants a side-bar entry where a traveller answers one question at a time (date from a calendar, weather, the kind of attractions, how far they will go, …) and a local AI proposes destinations that fit — "sun in December" must give places that really have sun in December, and nothing absurd (Malta for someone in São Paulo). The traveller then keeps the places that tempt them in a **Future trips** tab, with each city's page and lists.
- **Decision:** the language model never decides what is possible. **Code** does: `shortlistDestinations` (`packages/shared`, `domain/trip-planning.ts`) drops every city farther than the distance the traveller accepts, without climate data for the month, or (while at least six remain) with a weather fit below 0.4, and scores the rest by weather (temperature, sun, rain, snow of that month), attractions (beaches from OpenStreetMap, castles, museums, … from the city's attractions) and character (age, size). The **local model** (Ollama, through the city-builder service: `POST /plan/question`, `POST /plan/rank`) does the two things only it is good at: it **writes the last three of the ten questions** from what was answered before (so the interview is not always the same; a fixed list is used when it is not running) and **ranks the shortlist, writing one reason per place** from the facts it was given. The first seven questions are fixed (origin, date, length, distance, weather, attractions, character) because they drive the hard limits; every question has a box to type an answer, and typed text goes to the model as it is. New reference data feeds the scoring: `city_climate` (monthly normals 2015–2024, Open-Meteo), `city_facts` (population, year of foundation, OSM beaches) and the `city_profiles` view. Picks go to `future_trips` (owner-only rows, one per city, with the reason and the planned day), shown on the **Future trips** tab with the usual city card.
- **Alternatives:** letting the model choose cities freely — it invents places and ignores distance; hard-coding a table of "sunny in December" cities — stale and not extensible; a weather API call per city at planning time — slow and unnecessary for monthly normals; a native date picker — differs on every platform (a small calendar drop-down is used).
- **Trade-offs:** "tech hub" and "food and nightlife" have no data behind them, so they only reach the model as text; climate is a monthly average, not a forecast; the shortlist is limited to cities the app has (198 plus the ones built on demand); ranking takes tens of seconds on a laptop GPU; without the service the planner still works with fixed follow-up questions and scores, but without written reasons.

## D-082 — Countries to avoid, kept in the profile

- **Context:** a traveller may never want some countries proposed (a visa they cannot get, a past trip, a warning), however well they fit the weather. The planner should ask, and remember the answer for next time.
- **Decision:** the planner gets a fifth fixed question, **Are there countries you do not want as options?**, after the distance (ten questions in all: eight fixed and two written by the model). It is a searchable multi-pick of the countries the app has cities in; an empty answer is fine. The ruled-out countries are a **hard limit in code** (`excludedCountries` in `shortlistDestinations`): their cities never reach the shortlist, so the model cannot propose them, and their names are also told to the model. A box lets the traveller tick **Remember these countries in my profile**: they are then saved in `profiles.avoid_countries` (ISO codes, at most 40; the existing owner-only profile policies) and come ticked the next time; **Profile** lists them with a button to take each off.
- **Alternatives:** a separate table like `profile_nationalities` — more moving parts for a short list of codes; asking the model to avoid them — it can forget; remembering them only in the browser — the profile is where preferences already live.
- **Trade-offs:** only countries that have a city in the app can be listed; the saved list is shown ticked on every plan, so removing a country for one plan means unticking it there (and the box "Remember" decides whether that is kept); an anonymous local-mode account keeps them with that browser's account (D-078).

## D-083 — Android APK built on this machine, talking to the PC over the Wi-Fi

- **Context:** the app runs on the owner's PC (local Supabase, local city builder, local model, D-078/D-079). They want to install it on their own Android phone. The `127.0.0.1` URLs in `.env` mean "the phone itself" there, `EXPO_PUBLIC_*` values are inlined when the app is bundled, and Android blocks plain `http://` by default.
- **Decision:** `pnpm build:android` (`scripts/build-android-apk.mjs`) runs `expo prebuild` and Gradle `assembleRelease` locally and copies the result to `dist/travelist.apk`. It bakes in the PC's private IPv4 (`pickLanIp`, or `--host`) as the Supabase and city-builder address, with local mode on (`phoneEnv`). `expo-build-properties` sets `usesCleartextTraffic` so the app may call those `http://` addresses. The Expo template signs the release build with its debug key, which is enough to install it by hand. The `eas.json` `preview` profile also builds an APK for those who prefer the cloud.
- **Alternatives:** `eas build` only — needs an Expo account and a login, and the build runs where it cannot see the PC's address; an `https` tunnel (ngrok, Tailscale) — works away from home but adds an account and a moving part; a development build — needs Metro running on the PC for every launch.
- **Trade-offs:** the phone only works while the PC runs the stack and is on the same Wi-Fi, and the address is fixed in the APK (a new IP means a new build); cleartext traffic is allowed for every host in this build; the APK is not suitable for the Play Store (debug signature). The local model needs the city-builder service started with `--host 0.0.0.0`, and Windows Firewall must allow ports 54321 and 8787.

## D-084 — Optional partner integrations around a local, open-source model

- **Context:** the app's AI is local and open-weight (Ollama: Qwen, now also Gemma), which fits Hacktoberfest's "open-source AI at its core". Several partner services would add something real to it: tracing of the model calls, live web results, narration, long-term memory, semantic search, hosting. None may become a requirement: the app must keep working on one machine with no account.
- **Decision:** a package `wayfarer_pipeline.integrations`, one small module per service behind a Protocol and an owned HTTP transport (named fakes in the tests), assembled by `Extras`/`ExtrasApi` and handed to `CityService`. Each is configured by an environment variable and is **off when it is empty**: its endpoint then answers `503` naming the variable. Model calls go through `TracedTransport` (JSON log lines always; Sentry `gen_ai.chat` spans with `SENTRY_DSN`). Attractions get a 768-dimension `nomic-embed-text` vector (`embed` command) in `attraction_embeddings` (pgvector, HNSW), and `search_attractions_hybrid` fuses the vector and full-text rankings by reciprocal rank fusion. The planner's interviews can be kept in MongoDB Atlas, best effort and bounded. Hosting: a Dockerfile for `serve` with a Render Blueprint, a DigitalOcean App Platform spec and a script that prepares an Ollama GPU Droplet.
- **Alternatives:** the Supabase JS client for search from the app — the embedding model lives next to Ollama, so the service embeds the query; Atlas as the main database — it would replace Supabase for no gain, so it only holds optional memory; sending prompts to a hosted model — the point is that the model stays open and local.
- **Trade-offs:** the hosted service has no sign-in (anyone who reaches it can ask for a city and the planner), so it must point at a demo database, never production; ElevenLabs and SerpApi send text or a query to a third party (only when their key is set); embeddings need `ollama pull nomic-embed-text` and one pass of `embed` per new city; the app does not show web tips, semantic search or narration yet (the endpoints are ready).

## D-085 — Visited places: a private mark that takes a place off the priority list

- **Context:** a traveller who already saw the Jerónimos Monastery does not want the next suggested walk to start there just because it is the nearest place. The app needs to know what they have seen, and routes need to act on it.
- **Decision:** a button **I've been here** on the attraction's page writes a row to `visited_attractions` (user, attraction; owner-only under row-level security; no update, a mark is added or removed). `rankByProximity` takes the set of visited ids: the start of a route is its nearest stop that is not visited (the nearest of all only when every stop is visited), the route reports `visitedStops`, and routes with every stop visited sort last; otherwise ordering by distance is unchanged. The route card shows how many stops were already visited. The domain logic stays in `packages/shared`, so the Edge Functions could use it too.
- **Alternatives:** hiding visited places altogether — a traveller may want to walk past them again, so they stay in the route and only stop being the priority; a `visited` column on trips — a mark belongs to the traveller, not to one trip; storing marks only on the device — they would be lost with the phone and could not be used by a hosted service.
- **Trade-offs:** only suggested routes use the marks for now (the map, city lists and trip planner ignore them); marking needs a session, which local mode provides anonymously (D-078); an anonymous account keeps its marks only with that browser's account.

## D-086 — Navigating in the app: follow the traveller, keep the places readable

- **Context:** the only way to walk a saved trip was to hand it over to Google or Apple Maps, which takes the traveller out of Travelist and away from what it knows about the places (their stories, photos and sources). The traveller wants to walk the route and read about a place without leaving the app.
- **Decision:** a **Navigate in the app** button above _Open in Google Maps_ starts a foreground position watch (`expo-location`, every 3 s or 5 m behind `PositionWatcher`). The state lives in a store (`features/navigation/navigation-store.ts`), not in a screen, so opening an attraction page from the card, the stop list or a map marker does not end it. The decisions are pure functions in `packages/shared` (`stopAfterArrival` within 40 m, `isOffRoute` beyond 80 m from the route line, `guidanceTo` for distance and walk estimate), so they are tested without a GPS. The map draws a blue dot and follows it; the next stop is the large marker, reached ones fade; `expo-keep-awake` keeps the screen on while the card is shown.
- **Alternatives:** keep only the Google / Apple links — leaves the app; turn-by-turn instructions with voice — needs manoeuvre data that the optimiser does not return and a much larger feature; background tracking — needs a background-location permission, a foreground service on Android and store review, for a walk that is done with the app in hand.
- **Trade-offs:** no voice and no manoeuvres, only the next stop, a straight-line distance with a walk estimate, and a warning when off the line; a trip saved without a street line (fallback) never warns; tracking stops if the app is closed; native builds need a new build to include it.

## D-087 — A route always follows the streets: never a straight line

- **Context:** without an `ORS_API_KEY`, or when OpenRouteService failed, `route-optimize` answered with straight lines between the stops, labelled as an estimate (D-014). A straight line crosses buildings, rivers and private land: it is not a route anyone can walk, and the map, the saved trip and the in-app navigation (D-086) all treated it as one. The local install has no key, so this was the everyday case.
- **Decision:** a route is only ever a path on the pedestrian network. `route-optimize` tries OpenRouteService when a key is set, then the **OpenStreetMap foot router** (FOSSGIS' public OSRM instance with the foot profile, no key: `/trip` for the order and path, `/route` for an order already known). When no router answers, the function replies **503 `street_routing_unavailable`** and the app says no route was drawn; nothing is drawn, saved or cached as an estimate. The straight-line order is still used inside the function, but only to choose which stop goes first or the order when the optimiser is down; its geometry is never returned. `provider` is `openrouteservice` or `osm-foot`, `isFallback` is always `false` (the enum keeps `fallback` so older saved trips parse), and a trip saved earlier with a straight-line estimate is neither drawn nor navigated along.
- **Alternatives:** keep the estimate but flag it — it is still a line a person cannot walk; GraphHopper or Valhalla public instances — need a key or have no foot-first policy; the OSRM demo server — car profile only; a self-hosted router — the right answer for heavy use (`OSM_FOOT_URL` points at it) but too much to ask of a local install.
- **Trade-offs:** the app now depends on a free public service with a fair-use policy for routes (cached 30 days by the set of stops, a down router is skipped for 60 s); offline there are no routes (before, a straight line appeared); per-stop figures shown before a route is computed ("≈ 1.2 km on foot") remain a rough straight-line × 1.3 number, never a drawn line; OpenStreetMap's footpath coverage decides what is walkable.

## D-088 — City price estimates: modelled from open data, honest about it

- **Context:** a traveller choosing a city wants to know what it costs: a beer, a meal, a Big Mac, a ride, and what a day of eating and drinking comes to. Per-city prices exist (Numbeo, Expatistan) but need a paid key or scraping against their terms. The free, open data is national: McDonald's price per country (The Economist's Big Mac index) and the price level of a country (World Bank).
- **Decision:** every city gets an **estimate**, never presented as a quote: a reference basket of ten items (`data/price_basket.yaml`, assumed US prices, documented as assumptions) scaled by the country's price level (World Bank PPP of household consumption over the exchange rate) and converted to euros with the day's rate; the Big Mac is the index's real price where it has the country (the euro area shares one). A country with no level uses a declared proxy or the Big Mac against the United States. The estimates live in `city_prices` (public, written only by the seed) and are generated by the `prices` command, which the city builder also runs for a city built on demand. In the app the city page shows the prices and a calculator (sliders for meals and drinks, a meal style and a kind of drink); the planner shows a typical day (two cheap meals, a restaurant dinner, two beers) on each proposal. The card states that the figures are modelled and which one is measured.
- **Alternatives:** the Numbeo API — real per-city prices but a paid key, and its licence forbids republishing; scraping a cost-of-living site — against its terms and brittle; Open Prices (Open Food Facts) — receipts of products, too sparse for restaurants; asking the language model for prices — it would invent them.
- **Trade-offs:** the basket is an assumption and every city of a country shares one factor, so Porto equals Lisbon and a tourist street equals a suburb; euros only, at the rate of the day it was generated; no history; "ride-hailing" is a taxi-like figure, not an Uber quote. The way to improve it is a better basket or a per-city source with a licence, replacing `price_basket.yaml` or adding city factors, without changing the table or the app.

## D-090 — Gemma as the local planner model, chosen by `OLLAMA_MODEL`

- **Context:** the planner and the suggested routes ran on Qwen 2.5 7B. Gemma (Google's open-weight model) is a prize category of the Hacktoberfest challenge and a smaller model (3.4 GB for `gemma3:4b`), so it was tried on the same requests.
- **Decision:** the model is chosen by `OLLAMA_MODEL` (the root `.env` or the shell), `--model` wins, and the default in code stays Qwen so a clean checkout behaves as before; this machine's `.env` sets `gemma3:4b`. The pipeline's command line reads the root `.env` (`wayfarer_pipeline/dotenv.py`; a variable already in the shell wins; not read by tests), which the integration keys also needed. The first comparison showed Gemma answering a Portuguese request **in English**, so the language is now also the last line of the user message of both model calls. Measured on the same requests with that fix (one run each, a small sample): Gemma answered 3 of 3 in Portuguese or English as asked, in 10–20 s (the first request after loading took longer); Qwen took 9–34 s and failed one request (HTTP 503: the model gave one option where 3 to 6 are required).
- **Alternatives:** keep Qwen as the only model — safe, but nothing to compare and a larger download; switch the default in code to Gemma — it would change every clean install without a decision by its owner; a model per feature — more settings for no gain yet.
- **Trade-offs:** a 4B model writes more simply than a 7B one, and a sample of a few requests is not a benchmark; the code still validates every answer (lengths, options, known slugs, numbers), so a worse answer is retried or refused, never shown. Compare more cities with the trace lines (`latency_ms`, `tokens_per_second`) before judging the quality of the Portuguese.

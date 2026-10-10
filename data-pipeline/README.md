# data-pipeline

Python ingestion for Wayfarer's reference data: countries, cities, visa rules and attractions.
The pipeline writes **committed snapshots** under [`data/`](./data) and **generated seed SQL**
under [`../supabase/seed`](../supabase/seed), so `supabase db reset` (local) and
`supabase db push --include-seed` (hosted) load everything without running Python.

```bash
cd data-pipeline
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"

python -m wayfarer_pipeline validate-config        # check cities.yaml
python -m wayfarer_pipeline countries              # Wikidata → data/countries.json → 10_countries.sql
python -m wayfarer_pipeline cities                 # cities.yaml → 20_cities.sql
python -m wayfarer_pipeline city-summaries         # Wikipedia leads (EN/PT) → data/city_summaries.json → 20_cities.sql
python -m wayfarer_pipeline visa                   # passport-index → data/visa.csv → 30_visa.sql
python -m wayfarer_pipeline suggest-routes --city lisbon  # themed walks → data/suggested_routes → 60_suggested_routes.sql (D-077)
python -m wayfarer_pipeline suggest-routes --all --planner ollama --model qwen2.5:7b  # same, proposed by a local Ollama model
python -m wayfarer_pipeline serve                  # local service: builds the user's own city from a GPS position (D-079)
python -m wayfarer_pipeline ingest --city lisbon   # one city → data/attractions/lisbon.json
python -m wayfarer_pipeline ingest --all           # every city (≈ 30–60 min cold, seconds cached)
python -m wayfarer_pipeline report                 # quality report from data/attractions/*.json
python -m wayfarer_pipeline seed                   # regenerate ALL seed SQL offline (no network)
python -m wayfarer_pipeline gate --base origin/main # data gate vs a git ref; --fix restores, see D-042

pytest && ruff check . && ruff format --check .
```

`ingest` always rebuilds `40_attractions.sql` from **every** file in `data/attractions/`, so
re-ingesting one city keeps the others. Run `pnpm db:reset` from the repo root to load the seeds.

## Files

| Path                                | Committed | What                                                            |
| ----------------------------------- | --------- | --------------------------------------------------------------- |
| `cities.yaml`                       | yes       | launch cities (single source of truth)                          |
| `data/country_overrides.yaml`       | yes       | curated corrections applied after Wikidata, each with `source`  |
| `data/countries.json`               | yes       | normalised countries snapshot                                   |
| `data/visa.csv`                     | yes       | normalised visa rules; `data/visa_source.json` = dataset commit |
| `data/attractions/<slug>.json`      | yes       | normalised attractions per city                                 |
| `data/suggested_routes/<slug>.json` | yes       | suggested walking routes per city (D-077)                       |
| `data/local/`                       | no        | cities built on demand by `serve` (D-079): `cities.yaml`, JSON  |
| `.cache/`                           | no        | raw HTTP responses (delete a sub-folder to re-fetch a source)   |

## How attractions are built (per city)

1. **Wikidata** — items with coordinates in the city bbox (+ ~200 m margin) via
   `SERVICE wikibase:box`; classes resolved with `wdt:P279*` against the category roots in
   `attractions/categories.py`. Demolished items (P576 / "destroyed building") are excluded.
   Notability: ≥ 3 sitelinks or an en/pt Wikipedia article. Labels/descriptions (en, pt), image
   (P18), UNESCO (P1435 = Q9259 / Q43113623, or P757), website (P856), OSM ids, wiki titles.
2. **Overpass** — `nwr["wikidata"]` with tourism/historic/amenity/leisure/building tags →
   `opening_hours`, `fee`, OSM element, website and `name:pt` fallbacks.
3. **Dedupe** — same OSM element, or < 75 m apart with name similarity ≥ 0.85 (difflib);
   the item with more sitelinks wins.
4. **Pageviews** — last 12 complete months, en + pt, `user` agent, for the top 350 candidates
   by sitelinks; popularity = log-scaled 0–100 within the city (items without views: 0–5).
5. Top 300 by popularity are kept; **Commons** `imageinfo` gives the 800 px thumbnail, author
   and licence (images without a licence are dropped). Missing data stays `null`.

## Your own city on demand (`serve`, D-079)

`python -m wayfarer_pipeline serve [--host 127.0.0.1] [--port 8787] [--db-url postgresql://postgres:postgres@127.0.0.1:54322/postgres] [--planner auto|rules|ollama] [--model qwen2.5:7b]`
runs a small local HTTP service (standard library only) that the app calls with the traveller's
GPS position. It needs the local Supabase (`pnpm db:start`) and network access to Nominatim,
Wikidata, Overpass and Wikipedia; Ollama is optional. It writes to the database it is pointed at,
so run it on your own machine only (CORS is open on purpose).

| Endpoint                                                                                    | Answer                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /places/resolve` `{"lat": .., "lng": .., "name"?: "Nagasaki", "country_code"?: "JP"}` | `200 {"status":"ready","city_slug"}` city already in the database; `202 {"status":"building","job_id","stage":"locating"}`; `400` bad coordinates or hint; `422` no city / no Wikidata item; `502` lookup failed. `name`/`country_code` are the search result the traveller picked: the city called that (ignoring case and diacritics) wins; without them, the biggest municipality holding the point |
| `GET /places/search?q=<text>&limit=<1..10, default 6>`                                      | `200 {"results":[{"name","display_name","country_code","lat","lng"}]}` (empty list when nothing matches); `400` when `q` has fewer than 2 characters or `limit` is not 1–10; `502` Nominatim failed. City/town/village/municipality results only, each place once, in Nominatim's order; answers are kept 10 minutes                                                                                   |
| `GET /jobs/<id>`                                                                            | `{status: building\|ready\|failed, stage: locating\|attractions\|texts\|routes\|saving, city_slug, message, attractions, routes}`; `404` unknown job                                                                                                                                                                                                                                                   |
| `GET /health`                                                                               | `{"ok": true}`                                                                                                                                                                                                                                                                                                                                                                                         |

How a city is built (`local/build.py`), one job per city (asking again while it builds returns
the same job; a failed one is retried):

1. **locating** — Nominatim reverse at city zoom, then the _municipality_ around the point: a
   city/town/village/municipality with a Wikidata item and municipal rank (a hit can be a parish,
   a district or a whole prefecture, which are never taken; Nagasaki Prefecture would be refused
   as 3.1° across, so the city Nagasaki is chosen). Bigger than 1° (Tokyo's metropolis, Valparaíso's
   commune) is cut to a 0.5° window around its centre, so a picked "Tokyo" builds central Tokyo;
   without the name hint Tokyo's point resolves to its ward Chiyoda; Wikidata labels
   (en/pt); slug from the English name, made unique against the database and `data/local`
   (`valencia` → `valencia-ve` → `valencia-ve-2`); time zone = the country's only zone, else the
   nearest of its IANA zones (`tzdata`'s `zone.tab`), else none. A place more than 1° across
   (a province, not a city) is refused.
2. **attractions** — the same `ingest_city` as the committed cities (Wikidata, Overpass,
   pageviews, Commons). Places the database already holds for another city are left alone
   (`attractions.wikidata_id` is unique, so re-seeding them would steal them).
3. **texts** — the city's Wikipedia introduction/history and each place's (D-036, D-070).
4. **routes** — the route pipeline (D-077). `--planner auto` uses Ollama when it answers and
   has `--model`, else the rules; a group the model fails on falls back to the rules.
5. **saving** — one `psql --single-transaction` script of upserts built with the seed's own SQL
   writers: the country (only if missing), the city, its places and texts, and its routes
   (`delete … where city_slug = …`, never the other cities'). `psql` is the host's, else
   `docker exec` into `supabase_db_wayfarer`.

Local state is `data/local/cities.yaml` (the same shape as `cities.yaml`, so
`--config data/local/cities.yaml` re-ingests it) and `data/local/<slug>/{attractions,routes}.json`;
the folder is git-ignored and the committed `cities.yaml`, snapshots and seeds are never touched.
**Limits:** notable people are not fetched; a city needs a Wikidata item and a country in
`data/countries.json`; the stages run at the speed of the public APIs' limits (Overpass: one
request per 5 s), so a big city takes minutes; the service does not survive a restart mid-build
(ask again: the finished stages are cached under `.cache/`).

## Politeness

Every request sends `User-Agent: wayfarer-pipeline/<version> (<PIPELINE_CONTACT_EMAIL>)`
(env var: an email address or URL; default the repository URL `https://github.com/Pablokaer/travelist`). Wikidata SPARQL and Overpass run one request at a
time; Wikimedia REST ≤ 10 req/s. 429/5xx are retried with backoff honouring `Retry-After`.

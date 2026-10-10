-- Wikipedia texts (D-070): city pages add an excerpt of the History section of the city's
-- article; attraction pages show the article's introduction and History excerpt instead of only
-- Wikidata's one-line description. Plain text, verbatim (CC BY-SA 4.0: the app shows the
-- attribution and links the article). Filled by the data pipeline (`city-summaries`,
-- `attraction-texts`); null when a language has no article or the article has no History section.
-- Readable through the existing policies on cities and attractions.
alter table public.cities
  add column history_en text,
  add column history_pt text;

alter table public.attractions
  add column summary_en text,
  add column summary_pt text,
  add column history_en text,
  add column history_pt text;

-- Same view, the four text columns appended (create or replace only allows adding at the end).
create or replace view public.attraction_details
with (security_invoker = true)
as
select a.id, a.city_slug, a.wikidata_id, a.osm_id, a.name_en, a.name_pt, a.description_en,
       a.description_pt, a.category,
       extensions.st_y(a.location::extensions.geometry) as lat,
       extensions.st_x(a.location::extensions.geometry) as lng,
       a.image_url, a.image_author, a.image_license, a.image_license_url, a.image_page_url,
       a.is_unesco, a.website, a.wikipedia_en, a.wikipedia_pt, a.opening_hours, a.fee,
       a.avg_visit_minutes, a.popularity,
       a.summary_en, a.summary_pt, a.history_en, a.history_pt
  from public.attractions a;

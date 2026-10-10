-- M2/M3: read-only reference data (countries, cities, attractions, visa rules) loaded by the
-- data pipeline (seed files in supabase/seed). Readable by everyone, writable only by the
-- service role (which bypasses RLS).

create type public.attraction_category as enum (
  'museum', 'monument', 'church', 'castle', 'viewpoint', 'landmark', 'park', 'palace', 'other'
);

create type public.visa_requirement as enum (
  'freedom_of_movement', 'visa_free', 'visa_on_arrival', 'eta', 'e_visa', 'visa_required',
  'no_admission'
);

-- ---------------------------------------------------------------------------
-- countries
-- ---------------------------------------------------------------------------
create table public.countries (
  code              char(2) primary key check (code ~ '^[A-Z]{2}$'),
  name_en           text not null,
  name_pt           text not null,
  currency_codes    text[] not null default '{}',
  plug_types        text[] not null default '{}',   -- IEC letters: A, B, C, ...
  voltage           integer,                         -- nominal mains voltage (V)
  frequency_hz      integer,                         -- mains frequency (Hz)
  driving_side      text check (driving_side in ('left', 'right')),
  calling_code      text,                            -- "+351"
  emergency_number  text,                            -- general number ("112")
  police_number     text,
  ambulance_number  text,
  fire_number       text,
  languages         text[] not null default '{}',   -- ISO 639-1
  timezones         text[] not null default '{}',   -- IANA
  is_eu             boolean not null default false,
  is_schengen       boolean not null default false,
  updated_at        timestamptz not null default now()
);

comment on table public.countries is 'Country reference data (Wikidata + curated overrides).';

-- ---------------------------------------------------------------------------
-- cities (mirrors data-pipeline/cities.yaml)
-- ---------------------------------------------------------------------------
create table public.cities (
  slug          text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name_en       text not null,
  name_pt       text not null,
  country_code  char(2) not null references public.countries (code),
  wikidata_id   text not null unique,
  center        extensions.geography(Point, 4326) not null,
  bbox          double precision[] not null check (array_length(bbox, 1) = 4), -- [s, w, n, e]
  timezone      text,
  is_active     boolean not null default true,
  updated_at    timestamptz not null default now()
);

create index cities_country_idx on public.cities (country_code);

-- ---------------------------------------------------------------------------
-- attractions
-- ---------------------------------------------------------------------------
create table public.attractions (
  id                 uuid primary key default gen_random_uuid(),
  city_slug          text not null references public.cities (slug) on delete cascade,
  wikidata_id        text not null unique,
  osm_id             text,                          -- "node/123", "way/456", "relation/789"
  name_en            text not null,
  name_pt            text,
  description_en     text,
  description_pt     text,
  category           public.attraction_category not null default 'other',
  location           extensions.geography(Point, 4326) not null,
  image_url          text,
  image_author       text,
  image_license      text,
  image_license_url  text,
  image_page_url     text,
  is_unesco          boolean not null default false,
  website            text,
  wikipedia_en       text,
  wikipedia_pt       text,
  opening_hours      text,                          -- OSM opening_hours syntax, verbatim
  fee                text,                          -- OSM fee tag ("yes", "no", "€5", ...)
  avg_visit_minutes  integer not null check (avg_visit_minutes between 5 and 600),
  popularity         smallint not null default 0 check (popularity between 0 and 100),
  updated_at         timestamptz not null default now()
);

create index attractions_location_idx on public.attractions using gist (location);
create index attractions_city_popularity_idx on public.attractions (city_slug, popularity desc);

-- ---------------------------------------------------------------------------
-- visa_requirements (passport-index-dataset, MIT)
-- ---------------------------------------------------------------------------
create table public.visa_requirements (
  passport       char(2) not null,
  destination    char(2) not null,
  requirement    public.visa_requirement not null,
  max_stay_days  integer check (max_stay_days > 0),
  source         text not null default 'passport-index-dataset',
  updated_at     timestamptz not null default now(),
  primary key (passport, destination)
);

create index visa_requirements_destination_idx on public.visa_requirements (destination);

-- ---------------------------------------------------------------------------
-- api_cache: Edge Function response cache (service role only, no policies)
-- ---------------------------------------------------------------------------
create table public.api_cache (
  key         text primary key,
  value       jsonb not null,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

create index api_cache_expires_idx on public.api_cache (expires_at);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger countries_updated_at before update on public.countries
  for each row execute function public.set_updated_at();
create trigger cities_updated_at before update on public.cities
  for each row execute function public.set_updated_at();
create trigger attractions_updated_at before update on public.attractions
  for each row execute function public.set_updated_at();
create trigger visa_requirements_updated_at before update on public.visa_requirements
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: reference tables are public read-only; api_cache is private.
-- ---------------------------------------------------------------------------
alter table public.countries enable row level security;
alter table public.cities enable row level security;
alter table public.attractions enable row level security;
alter table public.visa_requirements enable row level security;
alter table public.api_cache enable row level security;

create policy "countries are readable by everyone" on public.countries
  for select to anon, authenticated using (true);
create policy "active cities are readable by everyone" on public.cities
  for select to anon, authenticated using (is_active);
create policy "attractions are readable by everyone" on public.attractions
  for select to anon, authenticated using (true);
create policy "visa requirements are readable by everyone" on public.visa_requirements
  for select to anon, authenticated using (true);

revoke insert, update, delete, truncate on public.countries, public.cities, public.attractions,
  public.visa_requirements from anon, authenticated;
revoke all on public.api_cache from anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC: attractions inside the map viewport
-- ---------------------------------------------------------------------------
create or replace function public.attractions_in_view(
  min_lng double precision,
  min_lat double precision,
  max_lng double precision,
  max_lat double precision,
  categories public.attraction_category[] default null,
  max_results integer default 300
)
returns table (
  id uuid,
  city_slug text,
  name_en text,
  name_pt text,
  category public.attraction_category,
  lat double precision,
  lng double precision,
  popularity smallint,
  avg_visit_minutes integer,
  image_url text,
  is_unesco boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.id, a.city_slug, a.name_en, a.name_pt, a.category,
         extensions.st_y(a.location::extensions.geometry) as lat,
         extensions.st_x(a.location::extensions.geometry) as lng,
         a.popularity, a.avg_visit_minutes, a.image_url, a.is_unesco
    from public.attractions a
    join public.cities c on c.slug = a.city_slug and c.is_active
   where a.location operator(extensions.&&)
         extensions.st_makeenvelope(min_lng, min_lat, max_lng, max_lat, 4326)::extensions.geography
     and (categories is null or a.category = any (categories))
   order by a.popularity desc, a.name_en
   limit least(greatest(max_results, 1), 1000);
$$;

comment on function public.attractions_in_view is
  'Attractions inside a lng/lat bounding box, most popular first. Used by the map.';

grant execute on function public.attractions_in_view to anon, authenticated;

-- Detail view with lat/lng (the geography column is not JSON-friendly).
create or replace view public.attraction_details
with (security_invoker = true)
as
select a.id, a.city_slug, a.wikidata_id, a.osm_id, a.name_en, a.name_pt, a.description_en,
       a.description_pt, a.category,
       extensions.st_y(a.location::extensions.geometry) as lat,
       extensions.st_x(a.location::extensions.geometry) as lng,
       a.image_url, a.image_author, a.image_license, a.image_license_url, a.image_page_url,
       a.is_unesco, a.website, a.wikipedia_en, a.wikipedia_pt, a.opening_hours, a.fee,
       a.avg_visit_minutes, a.popularity
  from public.attractions a;

create or replace view public.city_list
with (security_invoker = true)
as
select c.slug, c.name_en, c.name_pt, c.country_code, c.wikidata_id,
       extensions.st_y(c.center::extensions.geometry) as lat,
       extensions.st_x(c.center::extensions.geometry) as lng,
       c.bbox, c.timezone,
       (select count(*) from public.attractions a where a.city_slug = c.slug)::integer
         as attraction_count
  from public.cities c;

grant select on public.attraction_details, public.city_list to anon, authenticated;

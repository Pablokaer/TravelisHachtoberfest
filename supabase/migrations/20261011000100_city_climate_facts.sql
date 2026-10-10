-- City climate and facts (D-081): what the "Plan your next trip" wizard needs to compare cities.
-- Reference data like attractions and suggested routes: written only by the pipeline seed
-- (`70_city_climate.sql`, `80_city_facts.sql`), readable by everyone, gone with its city.

-- Monthly climate normals, 2015–2024, at the city centre (Open-Meteo Historical Weather API,
-- ERA5 reanalysis; CC BY 4.0). Temperatures are means of the daily mean / daily maximum; rain and
-- snow are the mean monthly TOTAL; sunshine is the mean DAILY sunshine duration in hours.
create table public.city_climate (
  city_slug       text not null references public.cities (slug) on delete cascade,
  month           smallint not null check (month between 1 and 12),
  temp_mean_c     numeric(4, 1) not null,
  temp_max_c      numeric(4, 1) not null,
  precip_mm       numeric(6, 1) not null check (precip_mm >= 0),
  snowfall_cm     numeric(6, 1) not null check (snowfall_cm >= 0),
  sunshine_hours  numeric(4, 1) not null check (sunshine_hours between 0 and 24),
  primary key (city_slug, month)
);

comment on table public.city_climate is
  'Monthly climate normals per city (Open-Meteo / ERA5, 2015-2024, CC BY 4.0). Written by the data pipeline.';

-- Facts that are not about attractions: population (Wikidata P1082, latest), founding year
-- (Wikidata P571; negative before the common era) and OpenStreetMap beaches inside the city box.
create table public.city_facts (
  city_slug       text primary key references public.cities (slug) on delete cascade,
  population      integer check (population >= 0),
  inception_year  integer,
  beach_count     integer not null default 0 check (beach_count >= 0)
);

comment on table public.city_facts is
  'Population and founding year (Wikidata), beaches (OpenStreetMap natural=beach). Written by the data pipeline.';

-- One row per city with what its attractions add up to, so the app can score a shortlist
-- without downloading every attraction. Runs with the caller's rights (cities and attractions
-- are public reference data).
create view public.city_profiles
with (security_invoker = true)
as
select c.slug as city_slug,
       count(a.id)::integer                                          as attraction_count,
       (count(a.id) filter (where a.is_unesco))::integer             as unesco_count,
       (count(a.id) filter (where a.category = 'castle'))::integer   as castle_count,
       (count(a.id) filter (where a.category = 'palace'))::integer   as palace_count,
       (count(a.id) filter (where a.category = 'museum'))::integer   as museum_count,
       (count(a.id) filter (where a.category = 'church'))::integer   as church_count,
       (count(a.id) filter (where a.category = 'monument'))::integer as monument_count,
       (count(a.id) filter (where a.category = 'park'))::integer     as park_count,
       (count(a.id) filter (where a.category = 'nature'))::integer   as nature_count,
       (count(a.id) filter (where a.category = 'viewpoint'))::integer as viewpoint_count,
       (count(a.id) filter (where a.category = 'landmark'))::integer as landmark_count
  from public.cities c
  left join public.attractions a on a.city_slug = c.slug
 group by c.slug;

comment on view public.city_profiles is
  'Attraction counts per city and category (D-081); feeds the trip wizard''s scoring.';

alter table public.city_climate enable row level security;
alter table public.city_facts enable row level security;

create policy "city climate is readable by everyone" on public.city_climate
  for select to anon, authenticated using (true);
create policy "city facts are readable by everyone" on public.city_facts
  for select to anon, authenticated using (true);

grant select on public.city_climate, public.city_facts, public.city_profiles
  to anon, authenticated;

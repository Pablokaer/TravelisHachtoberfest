-- Suggested walking routes (D-077): a handful of themed, ready-made routes per city — a few
-- historic places a traveller can walk in one outing — proposed by a local language model in the
-- data pipeline (`suggest-routes`) and checked by code before they are written. Reference data
-- like attractions and notable people: written only by the pipeline seed
-- (`60_suggested_routes.sql`), readable by everyone, gone with its city or attraction.
--
-- The stops are stored in walking order but the app re-orders them from the traveller's position,
-- so the list a traveller sees starts at the stop nearest to them.
create table public.suggested_routes (
  id               uuid primary key,
  city_slug        text not null references public.cities (slug) on delete cascade,
  slug             text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  theme            text not null check (char_length(theme) between 1 and 40),
  title_en         text not null check (char_length(title_en) between 1 and 80),
  title_pt         text not null check (char_length(title_pt) between 1 and 80),
  distance_m       integer not null check (distance_m >= 0),
  walking_seconds  integer not null check (walking_seconds >= 0),
  visit_minutes    integer not null check (visit_minutes >= 0),
  -- Who proposed the route: an Ollama model tag, or 'rules' for the model-free planner.
  generated_by     text not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (city_slug, slug)
);

comment on table public.suggested_routes is
  'Themed walking routes per city, proposed by a local LLM and validated by code (D-077). Written by the data pipeline.';

create index suggested_routes_city_idx on public.suggested_routes (city_slug);

create table public.suggested_route_stops (
  route_id       uuid not null references public.suggested_routes (id) on delete cascade,
  position       smallint not null check (position between 0 and 19), -- ROUTE_MAX_STOPS is 20 (D-030)
  attraction_id  uuid not null references public.attractions (id) on delete cascade,
  primary key (route_id, position),
  unique (route_id, attraction_id)
);

create index suggested_route_stops_attraction_idx on public.suggested_route_stops (attraction_id);

alter table public.suggested_routes enable row level security;
alter table public.suggested_route_stops enable row level security;

create policy "suggested routes are readable by everyone" on public.suggested_routes
  for select to anon, authenticated using (true);
create policy "suggested route stops are readable by everyone" on public.suggested_route_stops
  for select to anon, authenticated using (true);

grant select on public.suggested_routes, public.suggested_route_stops to anon, authenticated;

-- M1/M4: user-owned data (profiles, nationalities, trips). Every row belongs to one auth user
-- and is deleted with it (on delete cascade from auth.users).

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  display_name     text check (char_length(display_name) <= 80),
  home_country     char(2) references public.countries (code),
  language         text not null default 'en' check (language in ('en', 'pt')),
  units            text not null default 'metric' check (units in ('metric', 'imperial')),
  passport_expiry  date,
  onboarded_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on column public.profiles.passport_expiry is
  'Optional. Only the expiry date is stored: never passport numbers or scans.';

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create table public.profile_nationalities (
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  country_code  char(2) not null references public.countries (code),
  created_at    timestamptz not null default now(),
  primary key (profile_id, country_code)
);

-- A profile row is created for every new auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, language)
  values (
    new.id,
    nullif(left(coalesce(new.raw_user_meta_data ->> 'display_name',
                         new.raw_user_meta_data ->> 'full_name',
                         new.raw_user_meta_data ->> 'name', ''), 80), ''),
    case when new.raw_user_meta_data ->> 'language' = 'pt' then 'pt' else 'en' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- trips
-- ---------------------------------------------------------------------------
create table public.trips (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users (id) on delete cascade,
  city_slug           text not null references public.cities (slug),
  name                text not null check (char_length(name) between 1 and 80),
  trip_date           date,
  route_geometry      jsonb,              -- GeoJSON LineString
  distance_m          integer check (distance_m >= 0),
  walking_seconds     integer check (walking_seconds >= 0),
  visit_minutes       integer check (visit_minutes >= 0),
  is_fallback         boolean not null default false,
  provider            text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index trips_user_created_idx on public.trips (user_id, created_at desc);

create trigger trips_updated_at before update on public.trips
  for each row execute function public.set_updated_at();

create table public.trip_stops (
  trip_id        uuid not null references public.trips (id) on delete cascade,
  position       smallint not null check (position between 0 and 11),
  attraction_id  uuid not null references public.attractions (id),
  primary key (trip_id, position),
  unique (trip_id, attraction_id)
);

create index trip_stops_attraction_idx on public.trip_stops (attraction_id);

-- ---------------------------------------------------------------------------
-- RLS: owner only
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.profile_nationalities enable row level security;
alter table public.trips enable row level security;
alter table public.trip_stops enable row level security;

create policy "own profile: select" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "own profile: update" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "own nationalities: select" on public.profile_nationalities
  for select to authenticated using ((select auth.uid()) = profile_id);
create policy "own nationalities: insert" on public.profile_nationalities
  for insert to authenticated with check ((select auth.uid()) = profile_id);
create policy "own nationalities: delete" on public.profile_nationalities
  for delete to authenticated using ((select auth.uid()) = profile_id);

create policy "own trips: select" on public.trips
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own trips: insert" on public.trips
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own trips: update" on public.trips
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "own trips: delete" on public.trips
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "own trip stops: select" on public.trip_stops
  for select to authenticated using (
    exists (select 1 from public.trips t where t.id = trip_id and t.user_id = (select auth.uid()))
  );
create policy "own trip stops: insert" on public.trip_stops
  for insert to authenticated with check (
    exists (select 1 from public.trips t where t.id = trip_id and t.user_id = (select auth.uid()))
  );
create policy "own trip stops: delete" on public.trip_stops
  for delete to authenticated using (
    exists (select 1 from public.trips t where t.id = trip_id and t.user_id = (select auth.uid()))
  );

revoke all on public.profiles, public.profile_nationalities, public.trips, public.trip_stops
  from anon;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Replaces the caller's nationalities atomically (onboarding / profile edit).
create or replace function public.set_nationalities(codes char(2)[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if coalesce(array_length(codes, 1), 0) = 0 then
    raise exception 'at least one nationality is required' using errcode = '22023';
  end if;
  delete from public.profile_nationalities where profile_id = auth.uid();
  insert into public.profile_nationalities (profile_id, country_code)
  select auth.uid(), distinct_codes.code
    from (select distinct unnest(codes) as code) distinct_codes;
end;
$$;

grant execute on function public.set_nationalities to authenticated;

-- Saves a trip and its ordered stops in one transaction. Returns the new trip id.
create or replace function public.save_trip(
  p_city_slug text,
  p_name text,
  p_attraction_ids uuid[],
  p_trip_date date default null,
  p_route_geometry jsonb default null,
  p_distance_m integer default null,
  p_walking_seconds integer default null,
  p_visit_minutes integer default null,
  p_is_fallback boolean default false,
  p_provider text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_id uuid;
  n integer := coalesce(array_length(p_attraction_ids, 1), 0);
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if n < 2 or n > 12 then
    raise exception 'a trip needs between 2 and 12 stops' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(p_attraction_ids) as s(aid)
     where not exists (
       select 1 from public.attractions a where a.id = s.aid and a.city_slug = p_city_slug
     )
  ) then
    raise exception 'all stops must belong to the trip city' using errcode = '22023';
  end if;

  insert into public.trips (user_id, city_slug, name, trip_date, route_geometry, distance_m,
                            walking_seconds, visit_minutes, is_fallback, provider)
  values (auth.uid(), p_city_slug, p_name, p_trip_date, p_route_geometry, p_distance_m,
          p_walking_seconds, p_visit_minutes, p_is_fallback, p_provider)
  returning id into new_id;

  insert into public.trip_stops (trip_id, position, attraction_id)
  select new_id, (s.ord - 1)::smallint, s.aid
    from unnest(p_attraction_ids) with ordinality as s(aid, ord);

  return new_id;
end;
$$;

grant execute on function public.save_trip to authenticated;

-- Deletes the caller's account; profile, nationalities and trips cascade.
create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_account from public, anon;
grant execute on function public.delete_account to authenticated;
revoke execute on function public.handle_new_user from public, anon, authenticated;

-- Community and official walk lists (D-035). One entity, `trips`: community lists are public
-- trips; official ones are public trips a moderator marked `is_official`. Users save other
-- people's shared lists in `saved_trips` (a reference, not a copy). `list_walklists` lists them
-- with author, stops and rating in one query.

-- Moderators: managed with SQL / the service role only (no client can read or change it).
create table public.moderators (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

alter table public.moderators enable row level security;
revoke all on public.moderators from public, anon, authenticated;

-- True when the caller is a moderator (the app shows moderator actions with it).
create or replace function public.is_moderator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.moderators m where m.user_id = auth.uid());
$$;

revoke execute on function public.is_moderator from public, anon;
grant execute on function public.is_moderator to authenticated;

alter table public.trips add column is_official boolean not null default false;
alter table public.trips add constraint trips_official_is_public
  check (not is_official or visibility = 'public');

create index trips_public_city_idx on public.trips (city_slug, created_at desc)
  where visibility = 'public';

-- Only moderators mark a list official; a list that stops being public stops being official
-- (so the owner can always make an official list private).
create or replace function public.guard_trip_official()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.visibility <> 'public' then
    new.is_official := false;
  end if;
  if new.is_official and (tg_op = 'INSERT' or not old.is_official)
     and not public.is_moderator() then
    raise exception 'only moderators can mark trip % official (is_official = true)', new.id
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_trip_official from public, anon, authenticated;

create trigger trips_guard_official before insert or update on public.trips
  for each row execute function public.guard_trip_official();

-- Marks (or unmarks) a public trip as official. Moderators only.
-- @example select public.set_trip_official('<trip id>', true);
create or replace function public.set_trip_official(p_trip_id uuid, p_official boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_moderator() then
    raise exception 'only moderators mark walk lists official (caller %)', auth.uid()
      using errcode = '42501';
  end if;
  update public.trips set is_official = p_official
   where id = p_trip_id and visibility = 'public';
  if not found then
    raise exception 'trip % not found or not public (official lists must be public)', p_trip_id
      using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.set_trip_official from public, anon;
grant execute on function public.set_trip_official to authenticated;

-- Other people's shared lists a user keeps (My Trips → Saved).
create table public.saved_trips (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  trip_id     uuid not null references public.trips (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, trip_id)
);

create index saved_trips_trip_idx on public.saved_trips (trip_id);

alter table public.saved_trips enable row level security;

create policy "own saved trips: select" on public.saved_trips
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own saved trips: insert" on public.saved_trips
  for insert to authenticated with check (
    (select auth.uid()) = user_id and public.trip_open_to_caller(trip_id)
  );
create policy "own saved trips: delete" on public.saved_trips
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.saved_trips from anon;

-- Walk list cards: public lists (optionally of one city, official or not, matching a name), or
-- the caller's saved lists that are still shared. Sorts: top (best average first), lowest,
-- most_reviewed, newest. Security definer to read other users' trips and display names; it
-- returns only card fields. Unrated lists sort after rated ones.
-- @example select * from public.list_walklists(p_city_slug => 'lisbon', p_official => false, p_limit => 6);
create or replace function public.list_walklists(
  p_city_slug text default null,
  p_official boolean default null,
  p_saved boolean default false,
  p_search text default null,
  p_sort text default 'top',
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  name text,
  city_slug text,
  author_name text,
  is_official boolean,
  visibility text,
  stop_count integer,
  distance_m integer,
  walking_seconds integer,
  visit_minutes integer,
  review_count integer,
  rating_avg numeric,
  created_at timestamptz,
  is_saved boolean,
  is_own boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  -- ILIKE pattern with the user's text taken literally (\, % and _ escaped).
  pattern text := '%' || replace(replace(replace(btrim(coalesce(p_search, '')),
    '\', '\\'), '%', '\%'), '_', '\_') || '%';
begin
  if p_sort is null or p_sort not in ('top', 'lowest', 'most_reviewed', 'newest') then
    raise exception 'unknown walk list sort %, expected top, lowest, most_reviewed or newest',
      p_sort using errcode = '22023';
  end if;
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  return query
  select t.id, t.name, t.city_slug, p.display_name, t.is_official, t.visibility,
         (select count(*)::integer from public.trip_stops s where s.trip_id = t.id),
         t.distance_m, t.walking_seconds, t.visit_minutes,
         rs.review_count, rs.rating_avg, t.created_at,
         exists (select 1 from public.saved_trips st
                  where st.trip_id = t.id and st.user_id = auth.uid()),
         t.user_id = auth.uid()
    from public.trips t
    left join public.profiles p on p.id = t.user_id
    cross join lateral (
      select count(*)::integer as review_count, round(avg(r.rating), 2) as rating_avg
        from public.reviews r where r.trip_id = t.id
    ) rs
   where case when p_saved
              then t.visibility <> 'private'
                   and exists (select 1 from public.saved_trips st
                                where st.trip_id = t.id and st.user_id = auth.uid())
              else t.visibility = 'public' end
     and (p_city_slug is null or t.city_slug = p_city_slug)
     and (p_official is null or t.is_official = p_official)
     and t.name ilike pattern
   order by
     case when p_sort = 'lowest' then rs.rating_avg end asc nulls last,
     case when p_sort = 'top' then rs.rating_avg end desc nulls last,
     case when p_sort in ('top', 'most_reviewed') then rs.review_count end desc,
     case when p_sort = 'most_reviewed' then rs.rating_avg end desc nulls last,
     t.created_at desc, t.id
   limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0);
end;
$$;

revoke execute on function public.list_walklists from public, anon;
grant execute on function public.list_walklists to authenticated;

-- shared_trip (D-031) also returns the list's author, official flag, rating and whether the
-- caller saved it, so the shared page shows them (signed-out visitors included).
create or replace function public.shared_trip(p_trip_id uuid, p_password text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t public.trips;
  is_owner boolean;
  hash text;
begin
  select * into t from public.trips where id = p_trip_id;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  -- Signed out, auth.uid() is null: without coalesce `not is_owner` is null and skips the checks.
  is_owner := coalesce(t.user_id = auth.uid(), false);

  if not is_owner and t.visibility = 'private' then
    return jsonb_build_object('status', 'not_found');
  end if;
  if not is_owner and t.visibility = 'password' then
    if p_password is null then
      return jsonb_build_object('status', 'password_required');
    end if;
    select password_hash into hash from public.trip_passwords where trip_id = t.id;
    if hash is null or extensions.crypt(p_password, hash) <> hash then
      return jsonb_build_object('status', 'wrong_password');
    end if;
  end if;

  return jsonb_build_object('status', 'ok', 'trip', jsonb_build_object(
    'id', t.id,
    'name', t.name,
    'city_slug', t.city_slug,
    'trip_date', t.trip_date,
    'route_geometry', t.route_geometry,
    'distance_m', t.distance_m,
    'walking_seconds', t.walking_seconds,
    'visit_minutes', t.visit_minutes,
    'is_fallback', t.is_fallback,
    'provider', t.provider,
    'visibility', t.visibility,
    'created_at', t.created_at,
    'is_owner', is_owner,
    'is_official', t.is_official,
    'author_name', (select p.display_name from public.profiles p where p.id = t.user_id),
    'review_count', (select count(*) from public.reviews r where r.trip_id = t.id),
    'rating_avg', (select round(avg(r.rating), 2) from public.reviews r where r.trip_id = t.id),
    'is_saved', exists (select 1 from public.saved_trips st
                         where st.trip_id = t.id and st.user_id = auth.uid()),
    'stop_ids', coalesce(
      (select jsonb_agg(s.attraction_id order by s.position)
         from public.trip_stops s where s.trip_id = t.id),
      '[]'::jsonb)
  ));
end;
$$;

revoke execute on function public.shared_trip from public;
grant execute on function public.shared_trip to anon, authenticated;

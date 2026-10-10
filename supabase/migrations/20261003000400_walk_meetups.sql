-- Walk meetups (D-041): a walk list can have a date and time (`starts_at`), so travellers can
-- walk it together. Public lists with a future start are listed soonest first
-- (`list_walklists(p_upcoming, p_sort => 'soonest')`); other travellers say they are going
-- (`walk_attendees`). The owner sets the time when saving (`save_trip(p_starts_at)`) or later
-- (`set_trip_schedule`); it must be in the future.

alter table public.trips add column starts_at timestamptz;

create index trips_public_meetups_idx on public.trips (city_slug, starts_at)
  where visibility = 'public' and starts_at is not null;

-- One source of truth: with a start, the trip's day is the start's day in the city's time zone.
create or replace function public.sync_trip_date_from_start()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.starts_at is not null then
    new.trip_date := (new.starts_at at time zone coalesce(
      (select c.timezone from public.cities c where c.slug = new.city_slug), 'UTC'))::date;
  end if;
  return new;
end;
$$;

revoke execute on function public.sync_trip_date_from_start from public, anon, authenticated;

create trigger trips_sync_date_from_start before insert or update of starts_at on public.trips
  for each row execute function public.sync_trip_date_from_start();

-- True when the caller may join the meetup: a public list with a future start, not theirs.
-- Security definer because trips are owner-only under RLS; it reveals one boolean.
create or replace function public.meetup_open_to_caller(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.trips t
     where t.id = p_trip_id and t.visibility = 'public' and t.starts_at > now()
       and t.user_id <> auth.uid()
  );
$$;

revoke execute on function public.meetup_open_to_caller from public, anon;
grant execute on function public.meetup_open_to_caller to authenticated;

-- Who is going. Each user sees only their own rows; counts come from the RPCs.
create table public.walk_attendees (
  trip_id     uuid not null references public.trips (id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (trip_id, user_id)
);

create index walk_attendees_user_idx on public.walk_attendees (user_id);

alter table public.walk_attendees enable row level security;

create policy "own attendance: select" on public.walk_attendees
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own attendance: insert" on public.walk_attendees
  for insert to authenticated with check (
    (select auth.uid()) = user_id and public.meetup_open_to_caller(trip_id)
  );
create policy "own attendance: delete" on public.walk_attendees
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.walk_attendees from anon;

-- save_trip (D-030) gains an optional start (appended); a new signature needs drop + create.
drop function public.save_trip(text, text, uuid[], date, jsonb, integer, integer, integer, boolean, text);

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
  p_provider text default null,
  p_starts_at timestamptz default null
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
  if n < 2 or n > 20 then
    raise exception 'a trip needs between 2 and 20 stops, got %', n using errcode = '22023';
  end if;
  if p_starts_at is not null and p_starts_at <= now() then
    raise exception 'a walk list must start in the future, got % (now %)', p_starts_at, now()
      using errcode = '22023';
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
                            walking_seconds, visit_minutes, is_fallback, provider, starts_at)
  values (auth.uid(), p_city_slug, p_name, p_trip_date, p_route_geometry, p_distance_m,
          p_walking_seconds, p_visit_minutes, p_is_fallback, p_provider, p_starts_at)
  returning id into new_id;

  insert into public.trip_stops (trip_id, position, attraction_id)
  select new_id, (s.ord - 1)::smallint, s.aid
    from unnest(p_attraction_ids) with ordinality as s(aid, ord);

  return new_id;
end;
$$;

revoke execute on function public.save_trip from public, anon;
grant execute on function public.save_trip to authenticated;

-- Sets, moves or (with null) removes the start of the caller's list; a start must be in the
-- future. Errors: P0002 (not the caller's trip), 22023 (a start in the past).
-- @example select public.set_trip_schedule('<trip id>', '2026-10-04 10:00+01');
create or replace function public.set_trip_schedule(p_trip_id uuid, p_starts_at timestamptz)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_starts_at is not null and p_starts_at <= now() then
    raise exception 'a walk list must start in the future, got % (now %)', p_starts_at, now()
      using errcode = '22023';
  end if;
  update public.trips set starts_at = p_starts_at
   where id = p_trip_id and user_id = auth.uid();
  if not found then
    raise exception 'trip % not found for the caller', p_trip_id using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.set_trip_schedule from public, anon;
grant execute on function public.set_trip_schedule to authenticated;

-- list_walklists (D-035, cover D-038) gains the meetup filter and fields (appended): p_upcoming
-- keeps lists with a future start; sort `soonest`; `starts_at`, `attendee_count`, `is_attending`.
drop function public.list_walklists(text, boolean, boolean, text, text, integer, integer);

create or replace function public.list_walklists(
  p_city_slug text default null,
  p_official boolean default null,
  p_saved boolean default false,
  p_search text default null,
  p_sort text default 'top',
  p_limit integer default 20,
  p_offset integer default 0,
  p_upcoming boolean default false
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
  is_own boolean,
  cover jsonb,
  starts_at timestamptz,
  attendee_count integer,
  is_attending boolean
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
  if p_sort is null or p_sort not in ('top', 'lowest', 'most_reviewed', 'newest', 'soonest') then
    raise exception 'unknown walk list sort %, expected top, lowest, most_reviewed, newest or soonest',
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
         t.user_id = auth.uid(),
         public.walklist_cover(t),
         t.starts_at,
         (select count(*)::integer from public.walk_attendees wa where wa.trip_id = t.id),
         exists (select 1 from public.walk_attendees wa
                  where wa.trip_id = t.id and wa.user_id = auth.uid())
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
     and (not p_upcoming or t.starts_at > now())
   order by
     case when p_sort = 'soonest' then t.starts_at end asc nulls last,
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

-- shared_trip (D-031, D-035) also returns the start, how many are going and whether the caller is.
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
    'starts_at', t.starts_at,
    'attendee_count', (select count(*) from public.walk_attendees wa where wa.trip_id = t.id),
    'is_attending', exists (select 1 from public.walk_attendees wa
                             where wa.trip_id = t.id and wa.user_id = auth.uid()),
    'stop_ids', coalesce(
      (select jsonb_agg(s.attraction_id order by s.position)
         from public.trip_stops s where s.trip_id = t.id),
      '[]'::jsonb)
  ));
end;
$$;


revoke execute on function public.shared_trip from public;
grant execute on function public.shared_trip to anon, authenticated;

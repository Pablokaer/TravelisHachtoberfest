-- Trips hold up to 20 stops (D-030; the limit was 12), all in the trip's city. Positions are
-- 0-based and unique per trip (primary key).
alter table public.trip_stops drop constraint trip_stops_position_check;
alter table public.trip_stops add constraint trip_stops_position_check
  check (position between 0 and 19);

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
  if n < 2 or n > 20 then
    raise exception 'a trip needs between 2 and 20 stops, got %', n using errcode = '22023';
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


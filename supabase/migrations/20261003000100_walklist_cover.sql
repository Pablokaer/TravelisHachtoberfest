-- Walk list cover photo (D-038): each walk list card shows the photo of its starting point, with
-- the photo's author and licence (Commons images are shown with their credit, docs/DATA_SOURCES.md).
-- One rule, `walklist_cover(trip)`, serves both `list_walklists` (other people's lists) and My
-- Trips, which reads it as a PostgREST computed column (`select=…,walklist_cover`).

-- The photo of stop 0 or, when that place has none, of the next stop that has one, as
-- {"url", "author", "license"}; null when no stop has a photo. Security invoker: under RLS the
-- owner sees their own stops; list_walklists (security definer) sees every listed trip.
-- @example select public.walklist_cover(t) ->> 'url' from public.trips t where t.id = '<trip id>';
create or replace function public.walklist_cover(p_trip public.trips)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object('url', a.image_url, 'author', a.image_author, 'license', a.image_license)
    from public.trip_stops s
    join public.attractions a on a.id = s.attraction_id
   where s.trip_id = p_trip.id and a.image_url is not null
   order by s.position
   limit 1;
$$;

revoke execute on function public.walklist_cover from public, anon;
grant execute on function public.walklist_cover to authenticated;

-- list_walklists gains `cover` (appended); a new return type needs drop + create.
drop function public.list_walklists(text, boolean, boolean, text, text, integer, integer);

-- Walk list cards: public lists (optionally of one city, official or not, matching a name), or
-- the caller's saved lists that are still shared. Sorts: top (best average first), lowest,
-- most_reviewed, newest. Security definer to read other users' trips and display names; it
-- returns only card fields. Unrated lists sort after rated ones. `cover` is walklist_cover (D-038).
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
  is_own boolean,
  cover jsonb
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
         t.user_id = auth.uid(),
         public.walklist_cover(t)
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

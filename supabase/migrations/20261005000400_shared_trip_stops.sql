-- Shared walk lists in one call (D-057): a shared page asked `shared_trip` for the trip and its
-- stop ids, then `attraction_details` for those places — two requests one after another. The
-- answer now also carries the stops' places (`stops`, in walking order); `stop_ids` stays for
-- apps built before. Same signature: create or replace keeps the grants.

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
      '[]'::jsonb),
    -- The stops' places in walking order, with what a stop card shows (D-057).
    'stops', coalesce(
      (select jsonb_agg(jsonb_build_object(
          'id', a.id,
          'city_slug', a.city_slug,
          'name_en', a.name_en,
          'name_pt', a.name_pt,
          'category', a.category,
          'lat', extensions.st_y(a.location::extensions.geometry),
          'lng', extensions.st_x(a.location::extensions.geometry),
          'popularity', a.popularity,
          'avg_visit_minutes', a.avg_visit_minutes,
          'image_url', a.image_url,
          'is_unesco', a.is_unesco) order by s.position)
         from public.trip_stops s
         join public.attractions a on a.id = s.attraction_id
        where s.trip_id = t.id),
      '[]'::jsonb)
  ));
end;
$$;

-- Public traveller profiles (D-045): the author of a review or chat message links to a public
-- page — name, photo, member since, public walk lists. Profiles get a random `public_id` for
-- those links, so the account id still never leaves the database (D-028). The profiles table
-- stays owner-only; `public_profile` returns only the public fields, to signed-in users.

alter table public.profiles add column public_id uuid not null default gen_random_uuid();
alter table public.profiles add constraint profiles_public_id_key unique (public_id);

-- A traveller's public page: {status: 'ok', profile: {public_id, name, avatar_path,
-- member_since, public_walklist_count, is_self}} or {status: 'not_found'}.
-- @example select public.public_profile('<public id>') -> 'profile' ->> 'name';
create or replace function public.public_profile(p_public_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.profiles;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select * into p from public.profiles where public_id = p_public_id;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  return jsonb_build_object('status', 'ok', 'profile', jsonb_build_object(
    'public_id', p.public_id,
    'name', p.display_name,
    'avatar_path', p.avatar_path,
    'member_since', p.created_at,
    'public_walklist_count',
      (select count(*) from public.trips t where t.user_id = p.id and t.visibility = 'public'),
    'is_self', p.id = auth.uid()
  ));
end;
$$;

revoke execute on function public.public_profile from public, anon;
grant execute on function public.public_profile to authenticated;

-- list_reviews, list_walk_messages and list_walklists gain the author's public id (appended);
-- list_walklists also filters by it (`p_author`). New return types need drop + create.
drop function public.list_reviews(uuid, text, uuid, integer, integer);

create or replace function public.list_reviews(
  p_attraction_id uuid default null,
  p_city_slug text default null,
  p_trip_id uuid default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  rating smallint,
  comment text,
  created_at timestamptz,
  updated_at timestamptz,
  author_name text,
  is_own boolean,
  author_avatar_path text,
  author_public_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if num_nonnulls(p_attraction_id, p_city_slug, p_trip_id) <> 1 then
    raise exception 'list_reviews needs exactly one target, got attraction %, city %, trip %',
      p_attraction_id, p_city_slug, p_trip_id using errcode = '22023';
  end if;
  return query
  select r.id, r.rating, r.comment, r.created_at, r.updated_at, p.display_name,
         r.user_id = auth.uid(), p.avatar_path, p.public_id
    from public.reviews r
    left join public.profiles p on p.id = r.user_id
   where auth.uid() is not null
     and (r.attraction_id = p_attraction_id or r.city_slug = p_city_slug or r.trip_id = p_trip_id)
     and (r.trip_id is null or public.trip_visible_to_caller(r.trip_id))
   order by r.created_at desc, r.id
   limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end;
$$;

revoke execute on function public.list_reviews from public, anon;
grant execute on function public.list_reviews to authenticated;

drop function public.list_walk_messages(uuid, timestamptz, integer);

create or replace function public.list_walk_messages(
  p_trip_id uuid,
  p_before timestamptz default null,
  p_limit integer default 100
)
returns table (
  id uuid,
  body text,
  created_at timestamptz,
  author_name text,
  author_avatar_path text,
  is_own boolean,
  author_public_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.body, m.created_at, p.display_name, p.avatar_path, m.user_id = auth.uid(), p.public_id
    from public.walk_messages m
    left join public.profiles p on p.id = m.user_id
   where m.trip_id = p_trip_id
     and public.is_walk_chat_member(p_trip_id)
     and (p_before is null or m.created_at < p_before)
   order by m.created_at desc, m.id
   limit least(greatest(p_limit, 1), 200);
$$;

revoke execute on function public.list_walk_messages from public, anon;
grant execute on function public.list_walk_messages to authenticated;

drop function public.list_walklists(text, boolean, boolean, text, text, integer, integer, boolean);

create or replace function public.list_walklists(
  p_city_slug text default null,
  p_official boolean default null,
  p_saved boolean default false,
  p_search text default null,
  p_sort text default 'top',
  p_limit integer default 20,
  p_offset integer default 0,
  p_upcoming boolean default false,
  p_author uuid default null
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
  is_attending boolean,
  author_public_id uuid
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
                  where wa.trip_id = t.id and wa.user_id = auth.uid()),
         p.public_id
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
     and (p_author is null or p.public_id = p_author)
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

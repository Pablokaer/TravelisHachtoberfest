-- Query performance (D-061). Same answers, less work, measured on a synthetic dataset (20k public
-- lists in one city, 389k reviews, a list with 3000 reviews and 2000 people going):
--   * list_walklists picks the page first and reads each card's extras (stop count, cover,
--     attendees, saved/going flags) for that page only — they ran for every row OFFSET skipped
--     (offset 1000: 84–116 → ~2 ms) — and looks the caller's saved lists up by id (36 → 0.5 ms);
--   * the "lowest" and "most reviewed" sorts read an index (24–25 → ~1.8 ms);
--   * list_reviews checks a walk list's visibility once, not per review, and reads an index in
--     its newest-first order (9.2 → 0.2 ms for 3000 reviews);
--   * rating_summary reads a walk list's per-star totals (trip_rating_counts) instead of
--     aggregating its reviews through a per-row policy call (6.3 → 0.1 ms);
--   * shared_trip reads the list's totals instead of recounting its reviews (0.38 → 0.13 ms);
--   * subscription_grants_plan is stable (it reads the clock);
--   * list_walk_participants returns the number of people and only the first few (11.5 → 1.9
--     ms with 2000 going), and joins and leaves are announced on Realtime, so open chats stop
--     polling it every 30 s.

-- One transaction (the CLI runs statements one by one): no review may land between the per-star
-- backfill and its trigger below.
begin;
lock table public.reviews in share row exclusive mode;

-- Walk list sorts ------------------------------------------------------------------------------
-- One index per city-page sort, each in the listing's exact order: top (D-055), lowest, most
-- reviewed and newest; soonest reads trips_public_meetups_idx. Every review rewrites its list's
-- row (the totals), so each index on trips also costs writes: "newest" takes over the old
-- (city, created_at) index instead of adding another, and the city pages' few other filters
-- (no kind, an author) do without one.
drop index public.trips_public_city_idx;
create index trips_public_city_idx on public.trips (city_slug, is_official, created_at desc, id)
  where visibility = 'public';
create index trips_public_lowest_idx on public.trips
  (city_slug, is_official, rating_avg asc nulls last, created_at desc, id)
  where visibility = 'public';
create index trips_public_most_reviewed_idx on public.trips
  (city_slug, is_official, review_count desc, rating_avg desc nulls last, created_at desc, id)
  where visibility = 'public';

-- Reviews, newest first, per target --------------------------------------------------------------
-- The unique (target, user_id) keys enforce one review per user and stay; they cannot give the
-- newest-first order list_reviews pages through.
create index reviews_trip_created_idx on public.reviews (trip_id, created_at desc, id)
  where trip_id is not null;
create index reviews_city_created_idx on public.reviews (city_slug, created_at desc, id)
  where city_slug is not null;
create index reviews_attraction_created_idx on public.reviews (attraction_id, created_at desc, id)
  where attraction_id is not null;

-- Per-star totals of walk lists -----------------------------------------------------------------
-- rating_summary is security invoker, so reading a list's reviews ran the reviews policy
-- (`trip_visible_to_caller`, security definer, never inlined) once per review. These totals have
-- one row per list and star, so the same rule runs at most five times. They live apart from
-- trips because trips are owner-only under RLS, while a list's summary is readable by whoever
-- may see the list.
create table public.trip_rating_counts (
  trip_id       uuid not null references public.trips (id) on delete cascade,
  rating        smallint not null check (rating between 1 and 5),
  review_count  integer not null check (review_count >= 0),
  primary key (trip_id, rating)
);

comment on table public.trip_rating_counts is
  'Reviews per walk list and star, kept by the reviews_rating_counts_* triggers (D-061).';

alter table public.trip_rating_counts enable row level security;
create policy "trip rating counts: read with the list's reviews" on public.trip_rating_counts
  for select to authenticated using (public.trip_visible_to_caller(trip_id));
revoke all on public.trip_rating_counts from public, anon, authenticated;
grant select on public.trip_rating_counts to authenticated;

-- One list's change within a statement: `n` reviews more (negative: fewer) with `rating` stars.
create type public.trip_rating_delta as (trip_id uuid, rating smallint, n integer);

-- Applies per-star deltas: a list's first reviews of a star create its row; concurrent first
-- reviews add up (on conflict). A row whose list is gone (cascading delete) is left alone.
create or replace function public.apply_trip_rating_deltas(p_deltas public.trip_rating_delta[])
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.trip_rating_counts as c (trip_id, rating, review_count)
  select d.trip_id, d.rating, d.n from unnest(p_deltas) d where d.n > 0
  on conflict (trip_id, rating) do update set review_count = c.review_count + excluded.review_count;
  update public.trip_rating_counts c
     set review_count = c.review_count + d.n
    from unnest(p_deltas) d
   where d.trip_id = c.trip_id and d.rating = c.rating and d.n < 0;
$$;

-- One statement trigger for every change: inserts count up, deletes down, an edit both (old rows
-- out, new in — a changed rating or a review moved to another list). Security definer: the
-- totals of someone else's list must follow.
create or replace function public.reviews_rating_counts_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.apply_trip_rating_deltas(array(
      select row(trip_id, rating, count(*))::public.trip_rating_delta
        from new_rows where trip_id is not null group by trip_id, rating));
  elsif tg_op = 'DELETE' then
    perform public.apply_trip_rating_deltas(array(
      select row(trip_id, rating, -count(*))::public.trip_rating_delta
        from old_rows where trip_id is not null group by trip_id, rating));
  else
    perform public.apply_trip_rating_deltas(array(
      select row(trip_id, rating, sum(n))::public.trip_rating_delta
        from (select trip_id, rating, 1 as n from new_rows
              union all
              select trip_id, rating, -1 from old_rows) changes
       where trip_id is not null group by trip_id, rating));
  end if;
  return null;
end;
$$;

revoke execute on function public.apply_trip_rating_deltas(public.trip_rating_delta[])
  from public, anon, authenticated;
revoke execute on function public.reviews_rating_counts_after_change() from public, anon, authenticated;

-- Totals of the reviews already there.
insert into public.trip_rating_counts (trip_id, rating, review_count)
select trip_id, rating, count(*) from public.reviews where trip_id is not null group by trip_id, rating;

create trigger reviews_rating_counts_insert after insert on public.reviews
  referencing new table as new_rows
  for each statement execute function public.reviews_rating_counts_after_change();
create trigger reviews_rating_counts_update after update on public.reviews
  referencing old table as old_rows new table as new_rows
  for each statement execute function public.reviews_rating_counts_after_change();
create trigger reviews_rating_counts_delete after delete on public.reviews
  referencing old table as old_rows
  for each statement execute function public.reviews_rating_counts_after_change();

-- Same columns and visibility (D-034, D-040): places and cities still aggregate their reviews (the
-- policy stops at `trip_id is null` for them); walk lists read their per-star totals, under the
-- same rule. A filter on one target column reaches only its own branch.
create or replace view public.rating_summary
with (security_invoker = true)
as
select r.attraction_id, r.city_slug, null::uuid as trip_id,
       count(*)::integer as review_count,
       round(avg(r.rating), 2) as rating_avg,
       array[
         count(*) filter (where r.rating = 1),
         count(*) filter (where r.rating = 2),
         count(*) filter (where r.rating = 3),
         count(*) filter (where r.rating = 4),
         count(*) filter (where r.rating = 5)
       ]::integer[] as rating_counts
  from public.reviews r
 where r.trip_id is null
 group by r.attraction_id, r.city_slug
union all
select null::uuid, null::text, c.trip_id,
       sum(c.review_count)::integer,
       round(sum(c.review_count * c.rating)::numeric / sum(c.review_count), 2),
       array[
         coalesce(sum(c.review_count) filter (where c.rating = 1), 0),
         coalesce(sum(c.review_count) filter (where c.rating = 2), 0),
         coalesce(sum(c.review_count) filter (where c.rating = 3), 0),
         coalesce(sum(c.review_count) filter (where c.rating = 4), 0),
         coalesce(sum(c.review_count) filter (where c.rating = 5), 0)
       ]::integer[]
  from public.trip_rating_counts c
 group by c.trip_id
-- A list whose reviews are all gone keeps zero rows here; like before, it has no summary.
having sum(c.review_count) > 0;

-- list_reviews (D-034, D-040, D-045): one target, so a walk list's visibility is checked once
-- up front instead of for each review. A custom plan per call lets the one non-null target pick
-- its newest-first index. Same signature: create or replace keeps the grants.
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
set plan_cache_mode = force_custom_plan
as $$
#variable_conflict use_column
begin
  if num_nonnulls(p_attraction_id, p_city_slug, p_trip_id) <> 1 then
    raise exception 'list_reviews needs exactly one target, got attraction %, city %, trip %',
      p_attraction_id, p_city_slug, p_trip_id using errcode = '22023';
  end if;
  -- A private list's reviews are its owner's only (D-040).
  if p_trip_id is not null and not public.trip_visible_to_caller(p_trip_id) then
    return;
  end if;
  return query
  select r.id, r.rating, r.comment, r.created_at, r.updated_at, p.display_name,
         r.user_id = auth.uid(), p.avatar_path, p.public_id
    from public.reviews r
    left join public.profiles p on p.id = r.user_id
   where auth.uid() is not null
     and (r.attraction_id = p_attraction_id or r.city_slug = p_city_slug or r.trip_id = p_trip_id)
   order by r.created_at desc, r.id
   limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end;
$$;

-- list_walklists (D-035, D-038, D-041, D-045, D-055): the page first, then its cards. The inner
-- query only filters, sorts and pages trip ids (straight from an index for each sort); the
-- extras of a card are read for the ≤ 50 rows of the page, in the page's order. The saved filter
-- reads the caller's saved ids once (an uncorrelated array, so `t.id = any (…)` is a primary-key
-- lookup); a correlated `exists` there was checked on every public list of the database. With a
-- custom plan the CASE folds to the branch asked for. Same signature and result: the grants stay.
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
-- The filters below are catch-alls (`p is null or …`, `case when p_saved …`): only a plan made
-- with the parameters' values can drop them and use the partial indexes (D-055).
set plan_cache_mode = force_custom_plan
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
         t.review_count, t.rating_avg, t.created_at,
         exists (select 1 from public.saved_trips st
                  where st.trip_id = t.id and st.user_id = auth.uid()),
         t.user_id = auth.uid(),
         public.walklist_cover(t),
         t.starts_at,
         (select count(*)::integer from public.walk_attendees wa where wa.trip_id = t.id),
         exists (select 1 from public.walk_attendees wa
                  where wa.trip_id = t.id and wa.user_id = auth.uid()),
         p.public_id
    from unnest(array(
           select t.id
             from public.trips t
             left join public.profiles p on p.id = t.user_id
            where case when p_saved
                       then t.visibility <> 'private'
                            and t.id = any (array(select st.trip_id from public.saved_trips st
                                                   where st.user_id = auth.uid()))
                       else t.visibility = 'public' end
              and (p_city_slug is null or t.city_slug = p_city_slug)
              and (p_official is null or t.is_official = p_official)
              and t.name ilike pattern
              and (not p_upcoming or t.starts_at > now())
              and (p_author is null or p.public_id = p_author)
            order by
              case when p_sort = 'soonest' then t.starts_at end asc nulls last,
              case when p_sort = 'lowest' then t.rating_avg end asc nulls last,
              case when p_sort = 'top' then t.rating_avg end desc nulls last,
              case when p_sort in ('top', 'most_reviewed') then t.review_count end desc,
              case when p_sort = 'most_reviewed' then t.rating_avg end desc nulls last,
              t.created_at desc, t.id
            limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0)
         )) with ordinality as page(trip_id, ord)
    join public.trips t on t.id = page.trip_id
    left join public.profiles p on p.id = t.user_id
   order by page.ord;
end;
$$;

-- shared_trip (D-030, D-041, D-057) with its rating read from the list's totals. Same signature:
-- create or replace keeps the grants.
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
    -- The list's totals (D-055): the same count, and the same 2-decimal average, as its reviews.
    'review_count', t.review_count,
    'rating_avg', t.rating_avg,
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

-- Reads the clock (now()), so it may not be immutable: the planner could fold or cache a result
-- that goes stale, and an index could be built on it.
alter function public.subscription_grants_plan(text, timestamptz) stable;

-- Walk chat people (D-044) -------------------------------------------------------------------------
-- The chat header shows a few names and how many people there are, so the function returns the
-- count of everyone and only the first `p_limit` people (organiser first, then in the order they
-- joined, ties by name — the full list's order). Apps built before ask without a limit and get up
-- to 100. A new parameter and column need drop + create, and the grants again.
drop function public.list_walk_participants(uuid);
-- @example select * from public.list_walk_participants('<trip id>', p_limit => 5);
create or replace function public.list_walk_participants(p_trip_id uuid, p_limit integer default 100)
returns table (
  name text,
  avatar_path text,
  is_organiser boolean,
  is_self boolean,
  participant_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.display_name, p.avatar_path, m.is_organiser, m.user_id = auth.uid(), m.total::integer
    from (
      -- The first people by join order, plus anyone tied with the last of them: their names
      -- (read below, for those few only) decide who makes the cut.
      select member.*, count(*) over () as total
        from (
          select t.user_id, true as is_organiser, t.created_at as since
            from public.trips t where t.id = p_trip_id
          union all
          select wa.user_id, false, wa.created_at
            from public.walk_attendees wa where wa.trip_id = p_trip_id
        ) member
       order by member.is_organiser desc, member.since
       fetch first (least(greatest(p_limit, 1), 100)) rows with ties
    ) m
    left join public.profiles p on p.id = m.user_id
   where public.is_walk_chat_member(p_trip_id)
   order by m.is_organiser desc, m.since, p.display_name
   limit least(greatest(p_limit, 1), 100);
$$;

revoke execute on function public.list_walk_participants from public, anon;
grant execute on function public.list_walk_participants to authenticated;

-- Each join or leave is announced on the list's private Realtime topic `walk-people:<trip id>`,
-- so an open chat re-reads its people then. A broadcast, not walk_attendees' own changes: those
-- rows are owner-only under RLS (a member would never hear of others), and Realtime sends delete
-- events to every subscriber regardless of RLS. The message carries nothing but the event.
-- Security definer: realtime.messages takes inserts only past RLS.
create or replace function public.announce_walk_people_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The Realtime service installs realtime.send; a bare database (CI's) has nothing to announce to.
  if to_regprocedure('realtime.send(jsonb, text, text, boolean)') is not null then
    perform realtime.send('{}'::jsonb, 'changed',
                          'walk-people:' || coalesce(new.trip_id, old.trip_id), true);
  end if;
  return null;
end;
$$;

revoke execute on function public.announce_walk_people_change() from public, anon, authenticated;

create trigger walk_attendees_announce after insert or delete on public.walk_attendees
  for each row execute function public.announce_walk_people_change();

-- Who may receive it: the chat's members (Realtime checks this policy as the subscriber, with the
-- topic set). Malformed topics are refused before the cast.
do $$
begin
  if to_regclass('realtime.messages') is not null then
    create policy "walk people: chat members hear joins and leaves" on realtime.messages
      for select to authenticated
      using (realtime.messages.extension = 'broadcast'
             and case when realtime.topic() ~ '^walk-people:[0-9a-f-]{36}$'
                      then public.is_walk_chat_member(substr(realtime.topic(), 13)::uuid)
                      else false end);
  end if;
end;
$$;

commit;

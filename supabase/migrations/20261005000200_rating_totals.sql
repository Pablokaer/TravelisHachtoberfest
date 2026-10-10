-- Rating totals (D-055). Walk list cards and the city page's place cards showed averages computed
-- from every review on each read: `list_walklists` aggregated the reviews of *every* public list
-- of the city before sorting (85 ms at 20k lists in one city, ~210 ms once the plan cache switched
-- to a generic plan), and `attraction_rating_summary` all reviews of the city's places (16.5 ms at
-- 60k reviews, sorting on disk). Totals are now kept as reviews change:
--   * trips.review_count / rating_sum / rating_avg (rating_avg indexed for the "top" sort);
--   * attraction_review_totals (places are re-seeded reference data, so their totals live apart).
-- `rating_avg` = round(rating_sum / review_count, 2), the same value round(avg(rating), 2) gives.
-- list_walklists also always gets a custom plan (its catch-all filters need the parameters'
-- values to use an index): measured 206 → 1.3 ms for "newest" at 20k lists.

-- One transaction (the CLI runs statements one by one): all of it or nothing, and no review may
-- land between the backfill and the trigger below.
begin;
lock table public.reviews in share row exclusive mode;

alter table public.trips
  add column review_count integer not null default 0 check (review_count >= 0),
  add column rating_sum integer not null default 0 check (rating_sum >= 0),
  add column rating_avg numeric(3, 2) check (rating_avg between 1 and 5);

comment on column public.trips.rating_avg is
  'Average rating of the walk list (2 decimals), kept by the reviews_totals_* triggers; null without reviews.';

-- A review is not an edit of the list: updated_at follows the list's own columns only.
drop trigger trips_updated_at on public.trips;
create trigger trips_updated_at
  before update of user_id, city_slug, name, trip_date, route_geometry, distance_m, walking_seconds,
    visit_minutes, is_fallback, provider, visibility, is_official, starts_at
  on public.trips
  for each row execute function public.set_updated_at();

create table public.attraction_review_totals (
  attraction_id  uuid primary key references public.attractions (id) on delete cascade,
  review_count   integer not null default 0 check (review_count >= 0),
  rating_sum     integer not null default 0 check (rating_sum >= 0)
);

comment on table public.attraction_review_totals is
  'Review count and rating sum per place, kept by the reviews_totals_* triggers (D-055).';

-- Readable like attraction reviews themselves: by signed-in users; written only by the trigger.
alter table public.attraction_review_totals enable row level security;
create policy "attraction review totals: signed-in users read" on public.attraction_review_totals
  for select to authenticated using (true);
revoke all on public.attraction_review_totals from public, anon, authenticated;
grant select on public.attraction_review_totals to authenticated;

-- One target's change within a statement: `n` reviews more (negative: fewer), `s` stars more.
create type public.review_delta as (attraction_id uuid, trip_id uuid, n integer, s integer);

-- Applies review deltas to the totals: one update per walk list or place per statement, however
-- many reviews it touched (a bulk insert updates each list once, not once per row). A place whose
-- totals row is gone (deleted with the place) is left alone, so cascading deletes never fail.
create or replace function public.apply_review_deltas(p_deltas public.review_delta[])
returns void
language sql
security definer
set search_path = ''
as $$
  update public.trips t
     set review_count = t.review_count + d.n,
         rating_sum = t.rating_sum + d.s,
         rating_avg = case when t.review_count + d.n > 0
                           then round((t.rating_sum + d.s)::numeric / (t.review_count + d.n), 2) end
    from unnest(p_deltas) d
   where d.trip_id = t.id and (d.n <> 0 or d.s <> 0);
  -- A place's first reviews create its row; concurrent first reviews add up (on conflict).
  insert into public.attraction_review_totals as t (attraction_id, review_count, rating_sum)
  select d.attraction_id, d.n, d.s
    from unnest(p_deltas) d
   where d.attraction_id is not null and d.n > 0
  on conflict (attraction_id) do update
    set review_count = t.review_count + excluded.review_count,
        rating_sum = t.rating_sum + excluded.rating_sum;
  update public.attraction_review_totals t
     set review_count = t.review_count + d.n, rating_sum = t.rating_sum + d.s
    from unnest(p_deltas) d
   where d.attraction_id = t.attraction_id and d.n <= 0 and (d.n <> 0 or d.s <> 0);
$$;

-- Statement triggers: each sums its transition table(s) per target. Security definer: a reviewer
-- may not update someone else's walk list, but its totals must follow.
create or replace function public.reviews_totals_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.apply_review_deltas(array(
    select row(attraction_id, trip_id, count(*), sum(rating))::public.review_delta
      from new_rows group by attraction_id, trip_id));
  return null;
end;
$$;

create or replace function public.reviews_totals_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.apply_review_deltas(array(
    select row(attraction_id, trip_id, -count(*), -sum(rating))::public.review_delta
      from old_rows group by attraction_id, trip_id));
  return null;
end;
$$;

-- An edit may change the rating or move the review to another target: old rows out, new in.
create or replace function public.reviews_totals_after_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.apply_review_deltas(array(
    select row(attraction_id, trip_id, sum(n), sum(s))::public.review_delta
      from (select attraction_id, trip_id, 1 as n, rating::integer as s from new_rows
            union all
            select attraction_id, trip_id, -1, -rating from old_rows) changes
     group by attraction_id, trip_id));
  return null;
end;
$$;

revoke execute on function public.apply_review_deltas(public.review_delta[])
  from public, anon, authenticated;
revoke execute on function public.reviews_totals_after_insert() from public, anon, authenticated;
revoke execute on function public.reviews_totals_after_delete() from public, anon, authenticated;
revoke execute on function public.reviews_totals_after_update() from public, anon, authenticated;

-- Totals of the reviews already there.
update public.trips t
   set review_count = s.n, rating_sum = s.total, rating_avg = round(s.total::numeric / s.n, 2)
  from (select trip_id, count(*)::integer as n, sum(rating)::integer as total
          from public.reviews where trip_id is not null group by trip_id) s
 where t.id = s.trip_id;
insert into public.attraction_review_totals (attraction_id, review_count, rating_sum)
select attraction_id, count(*), sum(rating)
  from public.reviews where attraction_id is not null group by attraction_id;

create trigger reviews_totals_insert after insert on public.reviews
  referencing new table as new_rows
  for each statement execute function public.reviews_totals_after_insert();
create trigger reviews_totals_update after update on public.reviews
  referencing old table as old_rows new table as new_rows
  for each statement execute function public.reviews_totals_after_update();
create trigger reviews_totals_delete after delete on public.reviews
  referencing old table as old_rows
  for each statement execute function public.reviews_totals_after_delete();

-- The city page's place cards: same columns, read from the totals.
create or replace view public.attraction_rating_summary
with (security_invoker = true)
as
select a.id as attraction_id,
       coalesce(t.review_count, 0)::integer as review_count,
       case when t.review_count > 0 then round(t.rating_sum::numeric / t.review_count, 2) end
         as rating_avg,
       a.city_slug
  from public.attractions a
  left join public.attraction_review_totals t on t.attraction_id = a.id;

-- The "top" sort of a city's public lists (community or official), straight from an index.
create index trips_public_top_idx on public.trips
  (city_slug, is_official, rating_avg desc nulls last, review_count desc, created_at desc, id)
  where visibility = 'public';

-- list_walklists (D-035, D-038, D-041, D-045) reads the totals instead of aggregating reviews.
-- Same signature and result: create or replace keeps its grants.
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
-- with the parameters' values can use the partial indexes (D-055).
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
    from public.trips t
    left join public.profiles p on p.id = t.user_id
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
     case when p_sort = 'lowest' then t.rating_avg end asc nulls last,
     case when p_sort = 'top' then t.rating_avg end desc nulls last,
     case when p_sort in ('top', 'most_reviewed') then t.review_count end desc,
     case when p_sort = 'most_reviewed' then t.rating_avg end desc nulls last,
     t.created_at desc, t.id
   limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0);
end;
$$;

commit;

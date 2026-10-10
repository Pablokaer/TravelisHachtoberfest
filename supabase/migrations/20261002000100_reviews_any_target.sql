-- Reviews of cities and walk lists (D-034): the attraction reviews table (D-028) becomes
-- `reviews`, with exactly one target — an attraction, a city or a trip (walk list) — each a real
-- foreign key. Same rules for every target: 1–5 stars, optional comment, one review per user and
-- target, readable by signed-in users, changed only by their author.

alter table public.attraction_reviews rename to reviews;
alter index public.attraction_reviews_user_idx rename to reviews_user_idx;
alter trigger attraction_reviews_updated_at on public.reviews rename to reviews_updated_at;

alter table public.reviews alter column attraction_id drop not null;
alter table public.reviews
  add column city_slug text references public.cities (slug) on delete cascade,
  add column trip_id uuid references public.trips (id) on delete cascade,
  add constraint reviews_one_target check (num_nonnulls(attraction_id, city_slug, trip_id) = 1),
  -- One review per user and target (nulls are distinct, so each only binds its own target).
  add constraint reviews_city_user_key unique (city_slug, user_id),
  add constraint reviews_trip_user_key unique (trip_id, user_id);

-- True when the caller may review or save the trip: it is shared (public or password) and not
-- theirs. Security definer because trips are owner-only under RLS; it reveals one boolean.
create or replace function public.trip_open_to_caller(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.trips t
     where t.id = p_trip_id and t.visibility <> 'private' and t.user_id <> auth.uid()
  );
$$;

revoke execute on function public.trip_open_to_caller from public, anon;
grant execute on function public.trip_open_to_caller to authenticated;

drop policy "own reviews: insert" on public.reviews;
drop policy "own reviews: update" on public.reviews;
create policy "own reviews: insert" on public.reviews
  for insert to authenticated with check (
    (select auth.uid()) = user_id and (trip_id is null or public.trip_open_to_caller(trip_id))
  );
create policy "own reviews: update" on public.reviews
  for update to authenticated using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id and (trip_id is null or public.trip_open_to_caller(trip_id))
  );

drop function public.save_review(uuid, integer, text);
drop function public.list_attraction_reviews(uuid, integer, integer);

-- Creates the caller's review of one target, or edits it when there is one already. A blank
-- comment is stored as no comment. Returns the review id.
-- @example select public.save_review(p_city_slug => 'lisbon', p_rating => 5, p_comment => 'Loved it');
create or replace function public.save_review(
  p_rating integer,
  p_comment text default null,
  p_attraction_id uuid default null,
  p_city_slug text default null,
  p_trip_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  review_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  -- With one target at most one row matches; with none or several, nothing matches and the
  -- insert below fails the reviews_one_target check.
  update public.reviews r
     set rating = p_rating, comment = nullif(btrim(p_comment), '')
   where r.user_id = auth.uid()
     and num_nonnulls(p_attraction_id, p_city_slug, p_trip_id) = 1
     and (r.attraction_id = p_attraction_id or r.city_slug = p_city_slug or r.trip_id = p_trip_id)
  returning r.id into review_id;
  if not found then
    insert into public.reviews (attraction_id, city_slug, trip_id, user_id, rating, comment)
    values (p_attraction_id, p_city_slug, p_trip_id, auth.uid(), p_rating,
            nullif(btrim(p_comment), ''))
    returning id into review_id;
  end if;
  return review_id;
end;
$$;

revoke execute on function public.save_review from public, anon;
grant execute on function public.save_review to authenticated;

-- The reviews of one target, newest first, with each author's public name. Security definer only
-- to read `profiles.display_name` (profiles are owner-only under RLS); nothing else of the
-- profile, and not the author's id, leaves the function.
-- @example select * from public.list_reviews(p_city_slug => 'lisbon', p_limit => 10);
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
  is_own boolean
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
         r.user_id = auth.uid()
    from public.reviews r
    left join public.profiles p on p.id = r.user_id
   where auth.uid() is not null
     and (r.attraction_id = p_attraction_id or r.city_slug = p_city_slug or r.trip_id = p_trip_id)
   order by r.created_at desc, r.id
   limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end;
$$;

revoke execute on function public.list_reviews from public, anon;
grant execute on function public.list_reviews to authenticated;

-- Average (2 decimals), count and count per star (index 1 = 1 star … 5 = 5 stars) of every
-- reviewed target; a target without reviews has no row. Filter on exactly one target column.
create or replace view public.rating_summary
with (security_invoker = true)
as
select r.attraction_id, r.city_slug, r.trip_id,
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
 group by r.attraction_id, r.city_slug, r.trip_id;

revoke all on public.rating_summary from anon;
grant select on public.rating_summary to authenticated;

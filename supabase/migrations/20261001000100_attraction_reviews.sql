-- Attraction reviews (D-028): a 1–5 star rating and an optional comment per user and
-- attraction. Reviews are public to signed-in users; only their author can change or delete
-- them. User → Review → Attraction; both sides cascade (deleting an account removes its reviews).

create table public.attraction_reviews (
  id             uuid primary key default gen_random_uuid(),
  attraction_id  uuid not null references public.attractions (id) on delete cascade,
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  rating         smallint not null check (rating between 1 and 5),
  comment        text check (char_length(comment) between 1 and 1000),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- One review per user and attraction; also the index for listing an attraction's reviews.
  unique (attraction_id, user_id)
);

create index attraction_reviews_user_idx on public.attraction_reviews (user_id);

create trigger attraction_reviews_updated_at before update on public.attraction_reviews
  for each row execute function public.set_updated_at();

alter table public.attraction_reviews enable row level security;

create policy "reviews: signed-in users read all" on public.attraction_reviews
  for select to authenticated using (true);
create policy "own reviews: insert" on public.attraction_reviews
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own reviews: update" on public.attraction_reviews
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "own reviews: delete" on public.attraction_reviews
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.attraction_reviews from anon;

-- Creates the caller's review of an attraction, or edits it when there is one already.
-- A blank comment is stored as no comment. Returns the review id.
create or replace function public.save_review(
  p_attraction_id uuid,
  p_rating integer,
  p_comment text default null
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
  insert into public.attraction_reviews (attraction_id, user_id, rating, comment)
  values (p_attraction_id, auth.uid(), p_rating, nullif(btrim(p_comment), ''))
  on conflict (attraction_id, user_id)
  do update set rating = excluded.rating, comment = excluded.comment
  returning id into review_id;
  return review_id;
end;
$$;

revoke execute on function public.save_review from public, anon;
grant execute on function public.save_review to authenticated;

-- An attraction's reviews, newest first, with each author's public name. Security definer only
-- to read `profiles.display_name` (profiles are owner-only under RLS); nothing else of the
-- profile, and not the author's id, leaves the function.
create or replace function public.list_attraction_reviews(
  p_attraction_id uuid,
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
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.rating, r.comment, r.created_at, r.updated_at, p.display_name,
         r.user_id = auth.uid()
    from public.attraction_reviews r
    left join public.profiles p on p.id = r.user_id
   where r.attraction_id = p_attraction_id and auth.uid() is not null
   order by r.created_at desc, r.id
   limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
$$;

revoke execute on function public.list_attraction_reviews from public, anon;
grant execute on function public.list_attraction_reviews to authenticated;

-- Average rating (2 decimals) and number of reviews per attraction; 0 reviews → null average.
create or replace view public.attraction_rating_summary
with (security_invoker = true)
as
select a.id as attraction_id,
       count(r.id)::integer as review_count,
       round(avg(r.rating), 2) as rating_avg
  from public.attractions a
  left join public.attraction_reviews r on r.attraction_id = a.id
 group by a.id;

revoke all on public.attraction_rating_summary from anon;
grant select on public.attraction_rating_summary to authenticated;

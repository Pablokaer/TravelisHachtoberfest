-- Private walk lists stay private all the way (D-040): the reviews (and so the rating) of a
-- private trip are readable only by its owner. Before, a signed-in user who guessed a private
-- trip's id could read its reviews through the table, `rating_summary` or `list_reviews`.

-- True when the caller may see the trip: they own it, or it is not private. Security definer
-- because trips are owner-only under RLS; it reveals one boolean.
create or replace function public.trip_visible_to_caller(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.trips t
     where t.id = p_trip_id and (t.visibility <> 'private' or t.user_id = auth.uid())
  );
$$;

revoke execute on function public.trip_visible_to_caller from public, anon;
grant execute on function public.trip_visible_to_caller to authenticated;

-- Table and `rating_summary` (security invoker) both follow this policy.
drop policy "reviews: signed-in users read all" on public.reviews;
create policy "reviews: signed-in users read all but private lists'" on public.reviews
  for select to authenticated
  using (trip_id is null or public.trip_visible_to_caller(trip_id));

-- list_reviews (D-034; author photo since 20261003000200) is security definer, so it applies the
-- same rule itself. Same signature, so `create or replace` keeps its grants.
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
  author_avatar_path text
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
         r.user_id = auth.uid(), p.avatar_path
    from public.reviews r
    left join public.profiles p on p.id = r.user_id
   where auth.uid() is not null
     and (r.attraction_id = p_attraction_id or r.city_slug = p_city_slug or r.trip_id = p_trip_id)
     and (r.trip_id is null or public.trip_visible_to_caller(r.trip_id))
   order by r.created_at desc, r.id
   limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end;
$$;

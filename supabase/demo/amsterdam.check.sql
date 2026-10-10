-- Self-check of the Amsterdam demo community (run after amsterdam.sql; raises on the first gap).
-- Reads through the same RPCs the app calls, signed in as a demo friend, so a pass means the
-- city page shows: city rating + comments, 10 reviewed places, community lists with ratings
-- from friends, and official lists.
do $$
declare
  demo_users uuid[] := array(select id from auth.users where email like '%@demo-wayfarer.example.com');
  friend uuid := 'd0000000-0000-4000-8000-000000000001';
  n integer;
  avg_rating numeric;
begin
  if cardinality(demo_users) < 7 then
    raise exception 'expected ≥ 7 demo accounts (6 friends + editorial), got %', cardinality(demo_users);
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', friend, 'role', 'authenticated')::text, true);

  select review_count, rating_avg into n, avg_rating from public.rating_summary where city_slug = 'amsterdam';
  if coalesce(n, 0) < 6 or avg_rating < 4 then
    raise exception 'Amsterdam city rating: expected ≥ 6 reviews averaging ≥ 4, got % at %', n, avg_rating;
  end if;
  select count(*) into n from public.list_reviews(p_city_slug => 'amsterdam') where comment is not null;
  if n < 6 then
    raise exception 'Amsterdam city comments: expected ≥ 6 via list_reviews, got %', n;
  end if;

  select count(distinct r.attraction_id) into n
    from public.reviews r join public.attractions a on a.id = r.attraction_id
   where a.city_slug = 'amsterdam' and r.user_id = any (demo_users);
  if n <> 10 then
    raise exception 'expected demo reviews on exactly 10 Amsterdam places, got %', n;
  end if;
  select count(*) into n
    from public.reviews r join public.attractions a on a.id = r.attraction_id
   where a.city_slug = 'amsterdam' and r.user_id = any (demo_users) and r.rating not between 4 and 5;
  if n > 0 then
    raise exception 'demo place reviews must all be 4–5 stars, % are not', n;
  end if;
  select count(*) into n from (
    select r.attraction_id from public.reviews r join public.attractions a on a.id = r.attraction_id
     where a.city_slug = 'amsterdam' and r.user_id = any (demo_users)
     group by r.attraction_id having count(*) < 3) thin;
  if n > 0 then
    raise exception 'every reviewed Amsterdam place needs ≥ 3 demo reviews, % have fewer', n;
  end if;

  select count(*) into n from unnest(demo_users) u(id)
   where u.id <> 'd0000000-0000-4000-8000-000000000099'
     and not exists (select 1 from public.trips t where t.user_id = u.id and t.city_slug = 'amsterdam'
                        and t.visibility = 'public' and not t.is_official);
  if n > 0 then
    raise exception 'every demo friend needs a public Amsterdam walk list, % have none', n;
  end if;

  select count(*) into n from public.list_walklists(p_city_slug => 'amsterdam', p_official => false, p_limit => 50) w
   where w.review_count >= 2 and w.author_name is not null;
  if n < 8 then
    raise exception 'expected ≥ 8 rated community lists (≥ 2 reviews, with author) in Amsterdam, got %', n;
  end if;
  select count(*) into n from public.reviews r join public.trips t on t.id = r.trip_id
   where r.user_id = t.user_id;
  if n > 0 then
    raise exception 'authors cannot review their own walk lists, found %', n;
  end if;

  select count(*) into n from public.list_walklists(p_city_slug => 'amsterdam', p_official => true) w
   where w.review_count >= 2;
  if n < 3 then
    raise exception 'expected ≥ 3 rated official Amsterdam lists, got %', n;
  end if;

  select count(*) into n from public.list_walklists(p_city_slug => 'amsterdam', p_limit => 50) w
   where w.cover ->> 'url' is null;
  if n > 0 then
    raise exception 'every Amsterdam walk list card needs its starting point photo (D-038), % have none', n;
  end if;

  select count(*) into n from public.list_walklists(p_saved => true, p_city_slug => 'amsterdam');
  if n < 1 then
    raise exception 'demo friend % should have saved ≥ 1 shared Amsterdam list, got %', friend, n;
  end if;
  raise notice 'amsterdam demo check: ok';
end;
$$;

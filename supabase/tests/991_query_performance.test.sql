-- Query performance (D-061): the listings read less, with the same answers. `list_walklists`
-- picks the page first and only then reads each card's extras (and looks saved lists up by id);
-- the "lowest" and "most reviewed" sorts read straight from an index; `list_reviews`
-- checks a walk list's visibility once; `rating_summary` reads a walk list's per-star counts
-- from totals kept by the reviews trigger; `shared_trip` reads the list's own totals.
-- Every answer must equal the one the previous definitions gave. Run with `supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

insert into public.countries (code, name_en, name_pt) values ('ZZ', 'Testland', 'Terra de Teste')
  on conflict do nothing;
insert into public.cities (slug, name_en, name_pt, country_code, wikidata_id, center, bbox)
values ('perfville', 'Perfville', 'Rapidolândia', 'ZZ', 'Q999999990',
        extensions.st_setsrid(extensions.st_makepoint(0.5, 0.5), 4326)::extensions.geography, array[0, 0, 1, 1]);
insert into public.attractions (id, city_slug, wikidata_id, name_en, category, location, avg_visit_minutes, image_url)
select ('00000000-0000-0000-0000-0000000009' || lpad(i::text, 2, '0'))::uuid, 'perfville',
       'Q9999999' || lpad(i::text, 2, '0'), 'Spot ' || i, 'museum',
       extensions.st_setsrid(extensions.st_makepoint(0.1 * i, 0.1), 4326)::extensions.geography, 30,
       case when i % 2 = 0 then 'https://img.example/' || i || '.jpg' end
  from generate_series(1, 4) i;
-- Traveller 1 is the caller below; 2–9 author and review the lists.
insert into auth.users (id, email, raw_user_meta_data, aud, role)
select ('a9000000-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid, 'perf' || i || '@example.com',
       jsonb_build_object('display_name', 'Perf ' || i), 'authenticated', 'authenticated'
  from generate_series(1, 9) i;

-- 14 community lists (some share a created_at: ties fall to the id), 2 official, 1 password,
-- 1 private. Authors rotate over travellers 2–9 (the private list is traveller 4's); traveller 1
-- owns list 3.
alter table public.trips disable trigger trips_guard_official;
insert into public.trips (id, user_id, city_slug, name, visibility, is_official, created_at, starts_at)
select ('f9000000-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid,
       ('a9000000-0000-0000-0000-0000000000' || lpad((case when i = 3 then 1 else 2 + i % 8 end)::text, 2, '0'))::uuid,
       'perfville',
       case when i % 4 = 0 then 'River walk ' else 'Old town ' end || i,
       case i when 17 then 'password' when 18 then 'private' else 'public' end, i in (15, 16),
       timestamptz '2026-09-01' + ((i / 3) || ' hours')::interval,
       case when i % 3 = 0 then now() + (i || ' days')::interval
            when i % 5 = 0 then now() - interval '1 day' end
  from generate_series(1, 18) i;
alter table public.trips enable trigger trips_guard_official;
insert into public.trip_stops (trip_id, position, attraction_id)
select ('f9000000-0000-0000-0000-0000000000' || lpad(t::text, 2, '0'))::uuid, s - 1,
       ('00000000-0000-0000-0000-0000000009' || lpad(s::text, 2, '0'))::uuid
  from generate_series(1, 18) t, generate_series(1, 4) s
 where s <= t % 5;
-- Reviews: 0–8 per list, ratings spread so averages tie and differ.
insert into public.reviews (trip_id, user_id, rating)
select ('f9000000-0000-0000-0000-0000000000' || lpad(t::text, 2, '0'))::uuid,
       ('a9000000-0000-0000-0000-0000000000' || lpad(u::text, 2, '0'))::uuid, 1 + (t * u + t / 2) % 5
  from generate_series(1, 18) t, generate_series(2, 9) u
 where u - 1 <= 1 + t % 8;
insert into public.reviews (city_slug, user_id, rating)
select 'perfville', ('a9000000-0000-0000-0000-0000000000' || lpad(u::text, 2, '0'))::uuid, 1 + u % 5
  from generate_series(2, 6) u;
insert into public.walk_attendees (trip_id, user_id)
select t.id, ('a9000000-0000-0000-0000-0000000000' || lpad(u::text, 2, '0'))::uuid
  from public.trips t, generate_series(1, 9) u
 where t.city_slug = 'perfville' and t.visibility = 'public' and t.starts_at is not null
   and u <= 1 + extract(day from t.starts_at)::int % 4
   and t.user_id <> ('a9000000-0000-0000-0000-0000000000' || lpad(u::text, 2, '0'))::uuid;
insert into public.saved_trips (user_id, trip_id)
select 'a9000000-0000-0000-0000-000000000001', ('f9000000-0000-0000-0000-0000000000' || t)::uuid
  from unnest(array['04', '09', '15', '17', '18']) t;

-- The previous list_walklists (20261005000200_rating_totals.sql), as the reference answer.
create function pg_temp.walklists_reference(
  p_city_slug text, p_official boolean, p_saved boolean, p_search text, p_sort text,
  p_limit integer, p_offset integer, p_upcoming boolean, p_author uuid)
returns setof jsonb
language sql
stable
as $$
  select jsonb_build_array(t.id, t.name, t.city_slug, p.display_name, t.is_official, t.visibility,
         (select count(*)::integer from public.trip_stops s where s.trip_id = t.id),
         t.distance_m, t.walking_seconds, t.visit_minutes, t.review_count, t.rating_avg, t.created_at,
         exists (select 1 from public.saved_trips st where st.trip_id = t.id and st.user_id = auth.uid()),
         t.user_id = auth.uid(), public.walklist_cover(t), t.starts_at,
         (select count(*)::integer from public.walk_attendees wa where wa.trip_id = t.id),
         exists (select 1 from public.walk_attendees wa where wa.trip_id = t.id and wa.user_id = auth.uid()),
         p.public_id)
    from public.trips t
    left join public.profiles p on p.id = t.user_id
   where case when p_saved
              then t.visibility <> 'private'
                   and exists (select 1 from public.saved_trips st
                                where st.trip_id = t.id and st.user_id = auth.uid())
              else t.visibility = 'public' end
     and (p_city_slug is null or t.city_slug = p_city_slug)
     and (p_official is null or t.is_official = p_official)
     and t.name ilike '%' || replace(replace(replace(btrim(coalesce(p_search, '')),
           '\', '\\'), '%', '\%'), '_', '\_') || '%'
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
$$;

-- Every combination checked: each sort, page and kind; saved; search; meetups; one author.
create temporary table combo (label text, city text, official boolean, saved boolean, search text,
                              sort text, lim integer, off integer, upcoming boolean, author uuid);
insert into combo
select s || ' ' || k || ' @' || o, 'perfville', k = 'official', false, null, s, 4, o, false, null
  from unnest(array['top', 'lowest', 'most_reviewed', 'newest', 'soonest']) s,
       unnest(array['community', 'official']) k, unnest(array[0, 3, 8, 20]) o;
insert into combo values
  ('saved top', null, null, true, null, 'top', 20, 0, false, null),
  ('saved newest @1', null, null, true, null, 'newest', 2, 1, false, null),
  ('search river', 'perfville', null, false, 'river', 'top', 20, 0, false, null),
  ('search literal %', 'perfville', null, false, '%', 'top', 20, 0, false, null),
  ('upcoming soonest', 'perfville', null, false, null, 'soonest', 20, 0, true, null),
  ('any city, any kind', null, null, false, null, 'lowest', 50, 0, false, null),
  ('author', null, null, false, null, 'newest', 20, 0, false,
   (select public_id from public.profiles where id = 'a9000000-0000-0000-0000-000000000005'));
grant select on combo to authenticated;

select set_config('request.jwt.claims', '{"sub":"a9000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
create temporary table walklists_expected as
  select c.label, r.n, r.card
    from combo c
    cross join lateral pg_temp.walklists_reference(c.city, c.official, c.saved, c.search, c.sort,
                                                   c.lim, c.off, c.upcoming, c.author)
                       with ordinality as r(card, n);
grant select on walklists_expected to authenticated;

-- 1. The reference itself covers ties, both kinds and every page (else the check below is weak).
select ok((select count(*) from walklists_expected) > 100
          and exists (select 1 from walklists_expected where label = 'saved top')
          and exists (select 1 from walklists_expected where label = 'upcoming soonest'),
  'the reference answers cover every combination');

-- 2. Same rows, same values, same order, for every combination.
set local role authenticated;
select results_eq(
  $$ select c.label, l.ordinality,
            jsonb_build_array(l.id, l.name, l.city_slug, l.author_name, l.is_official, l.visibility,
              l.stop_count, l.distance_m, l.walking_seconds, l.visit_minutes, l.review_count,
              l.rating_avg, l.created_at, l.is_saved, l.is_own, l.cover, l.starts_at,
              l.attendee_count, l.is_attending, l.author_public_id)
       from combo c
       cross join lateral public.list_walklists(c.city, c.official, c.saved, c.search, c.sort,
                                                c.lim, c.off, c.upcoming, c.author)
                          with ordinality as l
      order by c.label, l.ordinality $$,
  $$ select label, n, card from walklists_expected order by label, n $$,
  'list_walklists answers exactly as before, for every sort, page, kind and filter');
reset role;

-- 3–5. The sorts a city page offers each have an index in the listing's order; "newest" shares
-- the index's leading (city, kind) columns so the index count does not grow beyond what is used.
select ok(pg_get_indexdef(to_regclass('public.trips_public_lowest_idx'))
            like '%(city_slug, is_official, rating_avg, created_at DESC, id) WHERE (visibility = ''public''::text)',
  'the lowest sort has its index');
select ok(pg_get_indexdef(to_regclass('public.trips_public_most_reviewed_idx'))
            like '%(city_slug, is_official, review_count DESC, rating_avg DESC NULLS LAST, created_at DESC, id) WHERE (visibility = ''public''::text)',
  'the most reviewed sort has its index');
select ok(pg_get_indexdef(to_regclass('public.trips_public_city_idx'))
            like '%(city_slug, is_official, created_at DESC, id) WHERE (visibility = ''public''::text)',
  'the newest sort reads its index per city and kind');

-- 6–8. Each review target lists its reviews newest first straight from an index.
select ok(pg_get_indexdef(to_regclass('public.reviews_trip_created_idx'))
            like '%(trip_id, created_at DESC, id) WHERE (trip_id IS NOT NULL)', 'walk list reviews, newest first');
select ok(pg_get_indexdef(to_regclass('public.reviews_city_created_idx'))
            like '%(city_slug, created_at DESC, id) WHERE (city_slug IS NOT NULL)', 'city reviews, newest first');
select ok(pg_get_indexdef(to_regclass('public.reviews_attraction_created_idx'))
            like '%(attraction_id, created_at DESC, id) WHERE (attraction_id IS NOT NULL)', 'place reviews, newest first');

-- 9. list_reviews is planned with its target on every call (one target, one index).
select ok((select proconfig from pg_proc where proname = 'list_reviews')
          @> array['plan_cache_mode=force_custom_plan'], 'list_reviews always gets a custom plan');

-- 10–12. list_reviews still hides a private list's reviews from everyone but its owner.
set local role authenticated;
select is((select count(*)::int from public.list_reviews(p_trip_id => 'f9000000-0000-0000-0000-000000000018')), 0,
  'a private list''s reviews stay hidden from others');
select is((select count(*)::int from public.list_reviews(p_trip_id => 'f9000000-0000-0000-0000-000000000017')),
          (select review_count from public.list_walklists(p_saved => true) where id = 'f9000000-0000-0000-0000-000000000017'),
  'a password list''s reviews are listed');
reset role;
select set_config('request.jwt.claims', '{"sub":"a9000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.list_reviews(p_trip_id => 'f9000000-0000-0000-0000-000000000018')),
          (select count(*)::int from public.reviews where trip_id = 'f9000000-0000-0000-0000-000000000018'),
  'its owner reads them');
reset role;

-- rating_summary: walk lists' per-star counts are kept as totals; the answers stay the reviews'.
create temporary view rating_expected as
  select r.attraction_id, r.city_slug, r.trip_id, count(*)::integer as review_count,
         round(avg(r.rating), 2) as rating_avg,
         array[count(*) filter (where r.rating = 1), count(*) filter (where r.rating = 2),
               count(*) filter (where r.rating = 3), count(*) filter (where r.rating = 4),
               count(*) filter (where r.rating = 5)]::integer[] as rating_counts
    from public.reviews r
    left join public.trips t on t.id = r.trip_id
   where (r.trip_id is null or t.visibility <> 'private' or t.user_id = auth.uid())
   group by r.attraction_id, r.city_slug, r.trip_id;
grant select on rating_expected to authenticated;
create temporary table perf_trips as
  select id from public.trips where city_slug = 'perfville';
grant select on perf_trips to authenticated;

-- 13. The totals table.
select has_table('public', 'trip_rating_counts', 'walk lists have per-star review totals');

-- 14–16. As the caller: every visible list's summary, and the city's.
select set_config('request.jwt.claims', '{"sub":"a9000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select results_eq(
  $$ select trip_id, review_count, rating_avg, rating_counts from public.rating_summary
      where trip_id in (select id from perf_trips) order by trip_id $$,
  $$ select trip_id, review_count, rating_avg, rating_counts from rating_expected
      where trip_id in (select id from perf_trips) order by trip_id $$,
  'each walk list''s summary equals its reviews'' (the private one left out)');
select results_eq(
  $$ select attraction_id, trip_id, review_count, rating_avg, rating_counts from public.rating_summary
      where city_slug = 'perfville' $$,
  $$ select attraction_id, trip_id, review_count, rating_avg, rating_counts from rating_expected
      where city_slug = 'perfville' $$,
  'a city''s summary is unchanged');
select is((select count(*)::int from public.rating_summary where trip_id = 'f9000000-0000-0000-0000-000000000018'), 0,
  'a private list has no summary for others');
reset role;

-- 17–18. After edits, moves and deletes (down to a list with no review left: no row).
update public.reviews set rating = 6 - rating where trip_id = 'f9000000-0000-0000-0000-000000000009';
update public.reviews set trip_id = 'f9000000-0000-0000-0000-000000000001'
 where trip_id = 'f9000000-0000-0000-0000-000000000008' and user_id = 'a9000000-0000-0000-0000-000000000009';
delete from public.reviews where trip_id = 'f9000000-0000-0000-0000-000000000007';
delete from public.reviews where trip_id = 'f9000000-0000-0000-0000-000000000006'
   and user_id = 'a9000000-0000-0000-0000-000000000002';
insert into public.reviews (trip_id, user_id, rating)
values ('f9000000-0000-0000-0000-000000000010', 'a9000000-0000-0000-0000-000000000001', 5);
set local role authenticated;
select results_eq(
  $$ select trip_id, review_count, rating_avg, rating_counts from public.rating_summary
      where trip_id in (select id from perf_trips) order by trip_id $$,
  $$ select trip_id, review_count, rating_avg, rating_counts from rating_expected
      where trip_id in (select id from perf_trips) order by trip_id $$,
  'the summaries follow edited, moved, deleted and new reviews');
select is((select count(*)::int from public.rating_summary where trip_id = 'f9000000-0000-0000-0000-000000000007'), 0,
  'a list whose reviews are all gone has no summary');
reset role;

-- 19. The private list's owner still sees its summary.
select set_config('request.jwt.claims', '{"sub":"a9000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
set local role authenticated;
select results_eq(
  $$ select review_count, rating_avg, rating_counts from public.rating_summary
      where trip_id = 'f9000000-0000-0000-0000-000000000018' $$,
  $$ select review_count, rating_avg, rating_counts from rating_expected
      where trip_id = 'f9000000-0000-0000-0000-000000000018' $$,
  'the owner of a private list sees its summary');
reset role;

-- 20–21. Only the trigger writes the totals; signed-out visitors read none.
set local role authenticated;
select throws_ok($$ insert into public.trip_rating_counts (trip_id, rating, review_count)
                    values ('f9000000-0000-0000-0000-000000000002', 5, 100) $$,
  '42501', null, 'signed-in users cannot write rating totals');
reset role;
set local role anon;
select throws_ok($$ select * from public.rating_summary $$, '42501', null, 'signed-out visitors read no summary');
reset role;

-- 22. A walk list deleted with its reviews leaves no totals behind.
delete from public.trips where id = 'f9000000-0000-0000-0000-000000000002';
select is((select count(*)::int from public.trip_rating_counts where trip_id = 'f9000000-0000-0000-0000-000000000002'), 0,
  'deleting a walk list deletes its totals');

-- 23–24. shared_trip reads the list's totals: the same count and average as its reviews give.
select set_config('request.jwt.claims', '{"sub":"a9000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
create temporary table shared_expected as
  select count(*) as review_count, round(avg(rating), 2) as rating_avg
    from public.reviews where trip_id = 'f9000000-0000-0000-0000-000000000009';
select is(public.shared_trip('f9000000-0000-0000-0000-000000000009') -> 'trip' -> 'review_count',
          (select to_jsonb(review_count) from shared_expected), 'a shared list''s review count');
select is((public.shared_trip('f9000000-0000-0000-0000-000000000009') -> 'trip' ->> 'rating_avg'),
          (select rating_avg::text from shared_expected), 'a shared list''s average, same rounding');

-- 25. And no longer re-reads its reviews for them.
select ok((select prosrc from pg_proc where proname = 'shared_trip') not like '%public.reviews%',
  'shared_trip reads totals, not reviews');

-- 26–27. A list without reviews: zero and no average, as before.
select is(public.shared_trip('f9000000-0000-0000-0000-000000000007') -> 'trip' -> 'review_count', '0'::jsonb,
  'a list without reviews counts zero');
select is(public.shared_trip('f9000000-0000-0000-0000-000000000007') -> 'trip' -> 'rating_avg', 'null'::jsonb,
  'and has no average');

-- 28. subscription_grants_plan reads the clock, so it may not be immutable (a cached result or
-- an index on it would freeze "now").
select is((select provolatile from pg_proc where proname = 'subscription_grants_plan'), 's'::"char",
  'subscription_grants_plan is stable');

-- 29–30. The saved filter (looked up by id) still lists password lists and never private ones.
select set_config('request.jwt.claims', '{"sub":"a9000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select ok(exists (select 1 from public.list_walklists(p_saved => true) where visibility = 'password'),
  'saved password lists are listed');
select ok(not exists (select 1 from public.list_walklists(p_saved => true) where visibility = 'private'),
  'saved private lists are not');
reset role;

select * from finish();
rollback;

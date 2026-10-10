-- Rating totals (D-055): walk lists carry their review count and average (`trips.review_count`,
-- `trips.rating_avg`) and places theirs (`attraction_review_totals`), kept by a trigger on
-- `reviews`, so listings sort and show ratings without aggregating every review on each read.
-- Every total must equal the reviews' own aggregate after any insert, edit, move or delete.
-- Run with `supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

insert into public.countries (code, name_en, name_pt) values ('ZZ', 'Testland', 'Terra de Teste')
  on conflict do nothing;
insert into public.cities (slug, name_en, name_pt, country_code, wikidata_id, center, bbox)
values ('totalville', 'Totalville', 'Totalândia', 'ZZ', 'Q999999960',
        extensions.st_setsrid(extensions.st_makepoint(0.5, 0.5), 4326)::extensions.geography, array[0, 0, 1, 1]);
insert into public.attractions (id, city_slug, wikidata_id, name_en, category, location, avg_visit_minutes)
select ('00000000-0000-0000-0000-0000000006' || lpad(i::text, 2, '0'))::uuid, 'totalville',
       'Q9999996' || lpad(i::text, 2, '0'), 'Spot ' || i, 'museum',
       extensions.st_setsrid(extensions.st_makepoint(0.1 * i, 0.1), 4326)::extensions.geography, 30
  from generate_series(1, 3) i;
insert into auth.users (id, email, raw_user_meta_data, aud, role)
select ('a6000000-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid, 'rater' || i || '@example.com',
       '{}', 'authenticated', 'authenticated'
  from generate_series(1, 6) i;
insert into public.trips (id, user_id, city_slug, name, visibility, created_at)
select ('f6000000-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid,
       'a6000000-0000-0000-0000-000000000001', 'totalville', 'Walk ' || i, 'public', ('2026-09-0' || i)::timestamptz
  from generate_series(1, 4) i;

create temporary view expected_trips as
  select t.id, count(r.id)::integer as review_count, round(avg(r.rating), 2) as rating_avg
    from public.trips t left join public.reviews r on r.trip_id = t.id
   where t.city_slug = 'totalville' group by t.id;
create temporary view expected_places as
  select a.id, count(r.id)::integer as review_count, round(avg(r.rating), 2) as rating_avg
    from public.attractions a left join public.reviews r on r.attraction_id = a.id
   where a.city_slug = 'totalville' group by a.id;
grant select on expected_trips, expected_places to authenticated;

-- 1–3. The totals exist.
select has_column('public', 'trips', 'review_count', 'walk lists carry their review count');
select has_column('public', 'trips', 'rating_avg', 'walk lists carry their average rating');
select has_table('public', 'attraction_review_totals', 'places have rating totals');

-- Reviews from six travellers: walk 1 gets 6, walk 2 gets 3 (ties walk 3 on average), walk 4 none.
insert into public.reviews (trip_id, user_id, rating)
select ('f6000000-0000-0000-0000-0000000000' || lpad(t::text, 2, '0'))::uuid,
       ('a6000000-0000-0000-0000-0000000000' || lpad(u::text, 2, '0'))::uuid, 1 + (t * u) % 5
  from generate_series(1, 3) t, generate_series(1, 6) u
 where u <= 7 - 2 * t + (t / 3) * 2;
insert into public.reviews (attraction_id, user_id, rating)
select ('00000000-0000-0000-0000-0000000006' || lpad(a::text, 2, '0'))::uuid,
       ('a6000000-0000-0000-0000-0000000000' || lpad(u::text, 2, '0'))::uuid, 1 + (a + u) % 5
  from generate_series(1, 2) a, generate_series(1, 6) u;

-- 4–5. After inserts.
select results_eq($$select id, review_count, rating_avg from public.trips where city_slug = 'totalville' order by id$$,
  $$select * from expected_trips order by id$$, 'each walk list carries its count and average');
select results_eq(
  $$select attraction_id, review_count, rating_avg from public.attraction_rating_summary where city_slug = 'totalville' order by 1$$,
  $$select * from expected_places order by id$$, 'the city cards'' ratings equal the reviews'' own average');

-- 6–7. After edits.
update public.reviews set rating = 5 where trip_id = 'f6000000-0000-0000-0000-000000000001' and rating < 3;
update public.reviews set rating = 1 where attraction_id = '00000000-0000-0000-0000-000000000601';
select results_eq($$select id, review_count, rating_avg from public.trips where city_slug = 'totalville' order by id$$,
  $$select * from expected_trips order by id$$, 'an edited rating moves the walk list average');
select results_eq(
  $$select attraction_id, review_count, rating_avg from public.attraction_rating_summary where city_slug = 'totalville' order by 1$$,
  $$select * from expected_places order by id$$, 'an edited rating moves the place average');

-- 8. After deletes, down to a walk list with no review left (count 0, no average).
delete from public.reviews where trip_id = 'f6000000-0000-0000-0000-000000000003';
delete from public.reviews where trip_id = 'f6000000-0000-0000-0000-000000000001'
   and user_id = 'a6000000-0000-0000-0000-000000000002';
select results_eq($$select id, review_count, rating_avg from public.trips where city_slug = 'totalville' order by id$$,
  $$select * from expected_trips order by id$$, 'deleted reviews leave the totals');

-- 9. A review moved to another place (a direct update by its author) moves its share too.
update public.reviews set attraction_id = '00000000-0000-0000-0000-000000000603'
 where attraction_id = '00000000-0000-0000-0000-000000000602' and user_id = 'a6000000-0000-0000-0000-000000000001';
select results_eq(
  $$select attraction_id, review_count, rating_avg from public.attraction_rating_summary where city_slug = 'totalville' order by 1$$,
  $$select * from expected_places order by id$$, 'a moved review counts for its new place only');

-- 10–11. Places (re-seeded data) and walk lists can still be deleted with their reviews.
select lives_ok($$delete from public.attractions where id = '00000000-0000-0000-0000-000000000601'$$,
  'a place with reviews can be deleted (its reviews and totals go with it)');
select lives_ok($$delete from public.trips where id = 'f6000000-0000-0000-0000-000000000004'$$,
  'a walk list can be deleted with its reviews');

-- 12. A review is not an edit of the walk list.
create temporary table before_review as
  select updated_at from public.trips where id = 'f6000000-0000-0000-0000-000000000002';
insert into public.reviews (trip_id, user_id, rating)
values ('f6000000-0000-0000-0000-000000000002', 'a6000000-0000-0000-0000-000000000006', 4);
select is((select updated_at from public.trips where id = 'f6000000-0000-0000-0000-000000000002'),
  (select updated_at from before_review), 'a review leaves the walk list''s updated_at alone');

-- 13. list_walklists keeps its order: best average first, then most reviews, then newest.
-- (The expected order is read here: trips are owner-only for the signed-in caller below.)
create temporary table expected_top as
  select e.id, row_number() over (
           order by e.rating_avg desc nulls last, e.review_count desc, t.created_at desc, e.id) as rank
    from expected_trips e join public.trips t using (id);
grant select on expected_top to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a6000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
select results_eq(
  $$select id from public.list_walklists(p_city_slug => 'totalville', p_official => false, p_limit => 10)$$,
  $$select id from expected_top order by rank$$,
  'the top sort is unchanged');
reset role;

-- 14. Only the trigger writes totals: a client cannot apply deltas of its own.
set local role authenticated;
select throws_ok(
  $$select public.apply_review_deltas(array[row(null, 'f6000000-0000-0000-0000-000000000002', 100, 500)::public.review_delta])$$,
  '42501', null, 'signed-in users cannot change rating totals');
reset role;

-- 15. Planned with its parameters' values on every call (D-055), never with a generic plan.
select ok((select proconfig from pg_proc where proname = 'list_walklists')
          @> array['plan_cache_mode=force_custom_plan'], 'list_walklists always gets a custom plan');

select * from finish();
rollback;

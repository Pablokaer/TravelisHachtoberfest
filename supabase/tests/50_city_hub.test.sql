-- City page hub (D-033 – D-036): reviews of cities and walk lists (the same `reviews` table as
-- attractions), the public walk list listing, saved walk lists and official (moderator) lists.
-- Run with `supabase test db`. Queries filter on this file's cities: the local DB may hold
-- other rows (e.g. from E2E).
begin;
create extension if not exists pgtap with schema extensions;
select plan(49);

insert into public.countries (code, name_en, name_pt) values ('ZZ', 'Testland', 'Terra de Teste')
  on conflict do nothing;
insert into public.cities (slug, name_en, name_pt, country_code, wikidata_id, center, bbox)
values
  ('hubville', 'Hubville', 'Centrolândia', 'ZZ', 'Q999999951',
   extensions.st_setsrid(extensions.st_makepoint(0.5, 0.5), 4326)::extensions.geography, array[0, 0, 1, 1]),
  ('elsewhere', 'Elsewhere', 'Outrolado', 'ZZ', 'Q999999952',
   extensions.st_setsrid(extensions.st_makepoint(2.5, 2.5), 4326)::extensions.geography, array[2, 2, 3, 3]);
insert into public.attractions (id, city_slug, wikidata_id, name_en, category, location, avg_visit_minutes)
values
  ('00000000-0000-0000-0000-0000000000e1', 'hubville', 'Q999999953', 'Old Gate', 'monument',
   extensions.st_setsrid(extensions.st_makepoint(0.2, 0.2), 4326)::extensions.geography, 20),
  ('00000000-0000-0000-0000-0000000000e2', 'hubville', 'Q999999954', 'Canal Park', 'park',
   extensions.st_setsrid(extensions.st_makepoint(0.8, 0.8), 4326)::extensions.geography, 30),
  ('00000000-0000-0000-0000-0000000000e3', 'elsewhere', 'Q999999955', 'Far Tower', 'landmark',
   extensions.st_setsrid(extensions.st_makepoint(2.5, 2.5), 4326)::extensions.geography, 20);

insert into auth.users (id, email, raw_user_meta_data, aud, role)
values
  ('a1111111-1111-1111-1111-111111111111', 'ana@example.com', '{"display_name":"Ana"}', 'authenticated', 'authenticated'),
  ('b2222222-2222-2222-2222-222222222222', 'ben@example.com', '{"display_name":"Ben"}', 'authenticated', 'authenticated'),
  ('c3333333-3333-3333-3333-333333333333', 'mod@example.com', '{"display_name":"Mo"}', 'authenticated', 'authenticated');
insert into public.moderators (user_id) values ('c3333333-3333-3333-3333-333333333333');

-- Ana's lists: two public, one private, one with a password; Mo's public list becomes official.
insert into public.trips (id, user_id, city_slug, name, visibility, walking_seconds, visit_minutes, created_at)
values
  ('f0000000-0000-0000-0000-000000000001', 'a1111111-1111-1111-1111-111111111111', 'hubville', 'Historic Hubville', 'public', 1800, 50, '2026-09-01'),
  ('f0000000-0000-0000-0000-000000000002', 'a1111111-1111-1111-1111-111111111111', 'hubville', 'Canal walk', 'public', 900, 30, '2026-09-02'),
  ('f0000000-0000-0000-0000-000000000003', 'a1111111-1111-1111-1111-111111111111', 'hubville', 'Secret walk', 'private', null, null, '2026-09-03'),
  ('f0000000-0000-0000-0000-000000000004', 'a1111111-1111-1111-1111-111111111111', 'hubville', 'Locked walk', 'password', null, null, '2026-09-04'),
  ('f0000000-0000-0000-0000-000000000005', 'c3333333-3333-3333-3333-333333333333', 'hubville', 'Hubville highlights', 'public', null, null, '2026-09-05'),
  ('f0000000-0000-0000-0000-000000000006', 'a1111111-1111-1111-1111-111111111111', 'elsewhere', 'Far away 100%', 'public', null, null, '2026-09-06');
insert into public.trip_stops (trip_id, position, attraction_id)
values ('f0000000-0000-0000-0000-000000000001', 0, '00000000-0000-0000-0000-0000000000e1'),
       ('f0000000-0000-0000-0000-000000000001', 1, '00000000-0000-0000-0000-0000000000e2'),
       ('f0000000-0000-0000-0000-000000000002', 0, '00000000-0000-0000-0000-0000000000e2');

-- 1. Cities carry a Wikipedia summary (D-036).
select has_column('public', 'cities', 'summary_en', 'cities have an English summary');
select has_column('public', 'cities', 'wikipedia_pt', 'cities have their Portuguese article title');

set local role authenticated;

-- Ben: city reviews ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"b2222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

select lives_ok($$ select public.save_review(p_city_slug => 'hubville', p_rating => 4, p_comment => 'Lovely') $$,
  'Ben reviews the city');
select lives_ok($$ select public.save_review(p_city_slug => 'hubville', p_rating => 5, p_comment => 'Even better') $$,
  'Ben edits his city review by saving again');
select results_eq(
  $$ select count(*)::int, max(rating)::int, max(comment) from public.reviews where city_slug = 'hubville' $$,
  $$ values (1, 5, 'Even better'::text) $$,
  'one review per user and city, with the new rating');
select throws_ok(
  $$ select public.save_review(p_city_slug => 'hubville', p_attraction_id => '00000000-0000-0000-0000-0000000000e1', p_rating => 3) $$,
  '23514', null, 'a review has exactly one target (not two)');
select throws_ok($$ select public.save_review(p_rating => 3) $$,
  '23514', null, 'a review has exactly one target (not none)');
select throws_ok($$ select * from public.list_reviews() $$,
  '22023', null, 'listing reviews needs exactly one target');

-- Ben: walk list reviews and saves ------------------------------------------------------------
select lives_ok($$ select public.save_review(p_trip_id => 'f0000000-0000-0000-0000-000000000001', p_rating => 5) $$,
  'Ben rates Ana''s public list');
select lives_ok($$ select public.save_review(p_trip_id => 'f0000000-0000-0000-0000-000000000004', p_rating => 4) $$,
  'Ben rates Ana''s password list (he was given the link)');
select throws_ok($$ select public.save_review(p_trip_id => 'f0000000-0000-0000-0000-000000000003', p_rating => 1) $$,
  '42501', null, 'nobody rates a private list');
select lives_ok($$ insert into public.saved_trips (trip_id) values ('f0000000-0000-0000-0000-000000000001') $$,
  'Ben saves Ana''s public list');
select throws_ok($$ insert into public.saved_trips (trip_id) values ('f0000000-0000-0000-0000-000000000003') $$,
  '42501', null, 'nobody saves a private list');
select throws_ok($$ insert into public.saved_trips (trip_id) values ('f0000000-0000-0000-0000-000000000001') $$,
  '23505', null, 'a list is saved once');
select is(public.is_moderator(), false, 'Ben is not a moderator');
select throws_ok($$ select * from public.moderators $$, '42501', null, 'the moderator list is not readable');

-- Ana ---------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select lives_ok($$ select public.save_review(p_city_slug => 'hubville', p_rating => 3) $$,
  'Ana reviews the city too');
select throws_ok($$ select public.save_review(p_trip_id => 'f0000000-0000-0000-0000-000000000001', p_rating => 5) $$,
  '42501', null, 'nobody rates their own list');
select throws_ok($$ insert into public.saved_trips (trip_id) values ('f0000000-0000-0000-0000-000000000002') $$,
  '42501', null, 'nobody saves their own list (it is already in My Trips)');
select is((select count(*)::int from public.saved_trips), 0, 'Ana does not see Ben''s saved lists');
select throws_ok($$ update public.trips set is_official = true where id = 'f0000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'an owner cannot make her own list official');
select throws_ok($$ select public.set_trip_official('f0000000-0000-0000-0000-000000000001', true) $$,
  '42501', null, 'only moderators mark lists official');

-- The city's rating uses every review, with the count per star (D-034).
select results_eq(
  $$ select review_count, rating_avg, rating_counts from public.rating_summary where city_slug = 'hubville' $$,
  $$ values (2, 4.00::numeric, array[0, 0, 1, 0, 1]) $$,
  'two city reviews (5 and 3): average 4.00, one 3-star and one 5-star');
select results_eq(
  $$ select author_name, rating::int, is_own from public.list_reviews(p_city_slug => 'hubville') order by rating desc $$,
  $$ values ('Ben'::text, 5, false), ('Ana'::text, 3, true) $$,
  'the city reviews list shows each author''s public name');

-- Mo (moderator) ------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"c3333333-3333-3333-3333-333333333333","role":"authenticated"}', true);

select is(public.is_moderator(), true, 'Mo is a moderator');
select lives_ok($$ select public.set_trip_official('f0000000-0000-0000-0000-000000000005', true) $$,
  'a moderator marks a public list official');
select throws_ok($$ select public.set_trip_official('f0000000-0000-0000-0000-000000000003', true) $$,
  'P0002', null, 'only public lists can be official');
select lives_ok($$ select public.save_review(p_trip_id => 'f0000000-0000-0000-0000-000000000002', p_rating => 2) $$,
  'Mo rates the canal walk');

-- Ben: the listing ----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"b2222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

select results_eq(
  $$ select name from public.list_walklists(p_city_slug => 'hubville', p_official => false) $$,
  $$ values ('Historic Hubville'::text), ('Canal walk'::text) $$,
  'community lists of the city: public, not official, best rated first');
select results_eq(
  $$ select name, author_name, is_official from public.list_walklists(p_city_slug => 'hubville', p_official => true) $$,
  $$ values ('Hubville highlights'::text, 'Mo'::text, true) $$,
  'official lists of the city');
select results_eq(
  $$ select stop_count, review_count, rating_avg, author_name, is_saved, is_own
       from public.list_walklists(p_city_slug => 'hubville', p_official => false, p_limit => 1) $$,
  $$ values (2, 1, 5.00::numeric, 'Ana'::text, true, false) $$,
  'each row carries its stops, rating, author and whether the caller saved it');
select results_eq(
  $$ select name from public.list_walklists(p_city_slug => 'hubville', p_official => false, p_sort => 'lowest') $$,
  $$ values ('Canal walk'::text), ('Historic Hubville'::text) $$,
  'lowest rated first');
select results_eq(
  $$ select name from public.list_walklists(p_city_slug => 'hubville', p_sort => 'newest') $$,
  $$ values ('Hubville highlights'::text), ('Canal walk'::text), ('Historic Hubville'::text) $$,
  'newest first; without p_official, official and community lists together');
select results_eq(
  $$ select name from public.list_walklists(p_city_slug => 'hubville', p_search => 'CANAL') $$,
  $$ values ('Canal walk'::text) $$,
  'search by name ignores case');
select is((select count(*)::int from public.list_walklists(p_search => '100%')), 1,
  'search treats % literally');
select is((select count(*)::int from public.list_walklists(p_city_slug => 'hubville', p_search => '%')), 0,
  'a bare % matches no name in the city');
select results_eq(
  $$ select name from public.list_walklists(p_city_slug => 'hubville', p_official => false, p_limit => 1, p_offset => 1) $$,
  $$ values ('Canal walk'::text) $$,
  'the listing pages with limit and offset');
select results_eq(
  $$ select name from public.list_walklists(p_saved => true) $$,
  $$ values ('Historic Hubville'::text) $$,
  'Ben''s saved lists');
select throws_ok($$ select * from public.list_walklists(p_sort => 'random') $$,
  '22023', null, 'an unknown sort is rejected');

-- Ana makes her list private: it leaves the listing and Ben's saved lists. ----------------------
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select public.set_trip_visibility('f0000000-0000-0000-0000-000000000001', 'private');
select set_config('request.jwt.claims', '{"sub":"b2222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select is((select count(*)::int from public.list_walklists(p_saved => true)), 0,
  'a list made private disappears from saved lists');
select is((select count(*)::int from public.list_reviews(p_trip_id => 'f0000000-0000-0000-0000-000000000001')), 0,
  'the reviews of a private list are hidden from anyone who guesses its id');
select is((select count(*)::int from public.rating_summary where trip_id = 'f0000000-0000-0000-0000-000000000001'), 0,
  'and so is its rating');
select is((select count(*)::int from public.reviews where trip_id = 'f0000000-0000-0000-0000-000000000001'), 0,
  'even reading the reviews table directly');
select is(public.shared_trip('f0000000-0000-0000-0000-000000000001'), '{"status":"not_found"}'::jsonb,
  'a guessed link to a private list is not found');
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select is((select count(*)::int from public.list_reviews(p_trip_id => 'f0000000-0000-0000-0000-000000000001')), 1,
  'the owner still reads the reviews of her private list');
select is((select count(*)::int from public.list_reviews(p_trip_id => 'f0000000-0000-0000-0000-000000000002')), 1,
  'reviews of a public list stay readable');
select set_config('request.jwt.claims', '{"sub":"b2222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

-- Mo makes the official list private: it stops being official. --------------------------------
select set_config('request.jwt.claims', '{"sub":"c3333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select public.set_trip_visibility('f0000000-0000-0000-0000-000000000005', 'private');
select is((select is_official from public.trips where id = 'f0000000-0000-0000-0000-000000000005'), false,
  'a list that is no longer public is no longer official');

-- Signed-out visitors: shared lists show their rating; the listing needs an account. ----------
reset role;
set local role anon;
select is(public.shared_trip('f0000000-0000-0000-0000-000000000002') -> 'trip' ->> 'review_count', '1',
  'a shared list carries its number of reviews');
select throws_ok($$ select * from public.list_walklists(p_city_slug => 'hubville') $$,
  '42501', null, 'anon cannot list walk lists');

select * from finish();
rollback;

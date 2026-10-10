-- Attraction reviews (D-028, generalised to cities and walk lists in D-034): one review per user
-- and attraction, public to signed-in users,
-- editable and deletable only by their author. Run with `supabase test db`.
-- Queries filter on this file's attractions: the local DB may hold other reviews (e.g. from E2E).
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

insert into public.countries (code, name_en, name_pt) values ('ZZ', 'Testland', 'Terra de Teste')
  on conflict do nothing;
insert into public.cities (slug, name_en, name_pt, country_code, wikidata_id, center, bbox)
values ('reviewville', 'Reviewville', 'Avaliolândia', 'ZZ', 'Q999999971',
        extensions.st_setsrid(extensions.st_makepoint(0.5, 0.5), 4326)::extensions.geography, array[0, 0, 1, 1]);
insert into public.attractions (id, city_slug, wikidata_id, name_en, category, location, avg_visit_minutes)
values
  ('00000000-0000-0000-0000-0000000000c1', 'reviewville', 'Q999999972', 'Rated', 'museum',
   extensions.st_setsrid(extensions.st_makepoint(0.2, 0.2), 4326)::extensions.geography, 60),
  ('00000000-0000-0000-0000-0000000000c2', 'reviewville', 'Q999999973', 'Unrated', 'park',
   extensions.st_setsrid(extensions.st_makepoint(0.8, 0.8), 4326)::extensions.geography, 30);

insert into auth.users (id, email, raw_user_meta_data, aud, role)
values
  ('33333333-3333-3333-3333-333333333333', 'carla@example.com', '{"display_name":"Carla"}', 'authenticated', 'authenticated'),
  ('44444444-4444-4444-4444-444444444444', 'dan@example.com', '{"display_name":"Dan"}', 'authenticated', 'authenticated'),
  ('55555555-5555-5555-5555-555555555555', 'eve@example.com', '{}', 'authenticated', 'authenticated');

set local role authenticated;

-- Carla ---------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);

-- 1. A valid review is saved for the caller.
select lives_ok($$ select public.save_review(p_attraction_id => '00000000-0000-0000-0000-0000000000c1', p_rating => 4, p_comment => 'Great views') $$,
  'Carla publishes a valid review');
select results_eq(
  $$ select user_id, rating::int, comment from public.reviews
      where attraction_id = '00000000-0000-0000-0000-0000000000c1' $$,
  $$ values ('33333333-3333-3333-3333-333333333333'::uuid, 4, 'Great views'::text) $$,
  'the review belongs to Carla and the attraction, with her rating and comment');

-- 2. Ratings are whole numbers from 1 to 5.
select throws_ok($$ select public.save_review(p_attraction_id => '00000000-0000-0000-0000-0000000000c1', p_rating => 0, p_comment => null) $$,
  '23514', null, 'a rating below 1 is rejected');
select throws_ok($$ select public.save_review(p_attraction_id => '00000000-0000-0000-0000-0000000000c1', p_rating => 6, p_comment => null) $$,
  '23514', null, 'a rating above 5 is rejected');
-- PostgREST passes the JSON value as text to the integer parameter, like this literal.
select throws_ok($$ select public.save_review(p_attraction_id => '00000000-0000-0000-0000-0000000000c1', p_rating => '4.5', p_comment => null) $$,
  '22P02', null, 'a fractional rating is rejected');
select throws_ok($$ select public.save_review(p_attraction_id => '00000000-0000-0000-0000-0000000000c1', p_rating => null, p_comment => 'No stars') $$,
  '23502', null, 'the rating is required');

-- 3. One review per user and attraction.
select throws_ok($$ insert into public.reviews (attraction_id, rating)
                    values ('00000000-0000-0000-0000-0000000000c1', 2) $$,
  '23505', null, 'a second review of the same attraction is rejected');

-- 4. Saving again edits the existing review instead of adding one.
select lives_ok($$ select public.save_review(p_attraction_id => '00000000-0000-0000-0000-0000000000c1', p_rating => 5, p_comment => '  Even better at sunset  ') $$,
  'Carla edits her review');
select results_eq(
  $$ select count(*)::int, max(rating)::int, max(comment) from public.reviews
      where attraction_id = '00000000-0000-0000-0000-0000000000c1' $$,
  $$ values (1, 5, 'Even better at sunset'::text) $$,
  'still one review, with the new rating and the trimmed comment');
select lives_ok($$ select public.save_review(p_attraction_id => '00000000-0000-0000-0000-0000000000c1', p_rating => 5, p_comment => '   ') $$,
  'a blank comment is accepted (comments are optional)');
select is((select comment from public.reviews where user_id = '33333333-3333-3333-3333-333333333333'), null,
  'a blank comment is stored as no comment');
select throws_ok(format($$ select public.save_review(p_attraction_id => '00000000-0000-0000-0000-0000000000c1', p_rating => 5, p_comment => %L) $$, repeat('x', 1001)),
  '23514', null, 'a comment over 1000 characters is rejected');

-- Dan -----------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
select lives_ok($$ select public.save_review(p_attraction_id => '00000000-0000-0000-0000-0000000000c1', p_rating => 4, p_comment => 'Busy but worth it') $$,
  'Dan reviews the same attraction');

-- 6. Nobody edits or deletes someone else's review.
update public.reviews set rating = 1, comment = 'hacked'
 where user_id = '33333333-3333-3333-3333-333333333333';
delete from public.reviews where user_id = '33333333-3333-3333-3333-333333333333';
select throws_ok($$ insert into public.reviews (attraction_id, user_id, rating)
                    values ('00000000-0000-0000-0000-0000000000c2', '33333333-3333-3333-3333-333333333333', 1) $$,
  '42501', null, 'Dan cannot write a review as Carla');
select results_eq(
  $$ select rating::int, comment from public.reviews
      where user_id = '33333333-3333-3333-3333-333333333333' $$,
  $$ values (5, null::text) $$,
  'Dan could neither edit nor delete Carla''s review');

-- Eve (no display name) -----------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}', true);
select lives_ok($$ select public.save_review(p_attraction_id => '00000000-0000-0000-0000-0000000000c1', p_rating => 3, p_comment => null) $$,
  'Eve reviews without a comment');

-- 7. Everyone signed in sees every review, with its author's public name.
select results_eq(
  $$ select author_name, rating::int, is_own from public.list_reviews(p_attraction_id => '00000000-0000-0000-0000-0000000000c1')
      order by rating desc, author_name $$,
  $$ values ('Carla'::text, 5, false), ('Dan'::text, 4, false), (null::text, 3, true) $$,
  'the list shows every review with author name, rating and whether it is the caller''s');
select is((select count(*)::int from public.list_reviews(p_attraction_id => '00000000-0000-0000-0000-0000000000c2')), 0,
  'an attraction without reviews has an empty list');
select is((select count(*)::int from public.list_reviews(p_attraction_id => '00000000-0000-0000-0000-0000000000c1', p_limit => 1)), 1,
  'the list can be limited');

-- 8 and 9. The average and the count use every review.
select results_eq(
  $$ select review_count, rating_avg from public.attraction_rating_summary
      where attraction_id = '00000000-0000-0000-0000-0000000000c1' $$,
  $$ values (3, 4.00::numeric) $$,
  'three reviews (5, 4, 3) average 4.00');
select results_eq(
  $$ select review_count, rating_avg from public.attraction_rating_summary
      where attraction_id = '00000000-0000-0000-0000-0000000000c2' $$,
  $$ values (0, null::numeric) $$,
  'an attraction without reviews has no average and a count of 0');

-- City pages read every rated place of a city in one query (D-028).
select results_eq(
  $$ select attraction_id, review_count, rating_avg from public.attraction_rating_summary
      where city_slug = 'reviewville' and review_count > 0 $$,
  $$ values ('00000000-0000-0000-0000-0000000000c1'::uuid, 3, 4.00::numeric) $$,
  'the summary of a city lists its rated places only');
select is((select count(*)::int from public.attraction_rating_summary where city_slug = 'reviewville'), 2,
  'every place of the city has a summary row');

-- 5. The author deletes her own review; the summary follows.
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
delete from public.reviews where attraction_id = '00000000-0000-0000-0000-0000000000c1';
select results_eq(
  $$ select review_count, rating_avg from public.attraction_rating_summary
      where attraction_id = '00000000-0000-0000-0000-0000000000c1' $$,
  $$ values (2, 3.50::numeric) $$,
  'Carla deleted only her review: Dan''s 4 and Eve''s 3 average 3.50');

-- Signed-out visitors cannot read reviews (the app requires sign-in, like trips).
reset role;
set local role anon;
select throws_ok($$ select * from public.reviews $$, '42501', null, 'anon cannot read reviews');
select throws_ok($$ select * from public.list_reviews(p_attraction_id => '00000000-0000-0000-0000-0000000000c1') $$,
  '42501', null, 'anon cannot list reviews');

select * from finish();
rollback;

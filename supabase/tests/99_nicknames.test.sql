-- Nicknames (D-048): unique handles chosen at sign-up, used to sign in instead of the email and
-- shown in the walk chat. Run with `supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- Sign-up passes the nickname in the user metadata (as supabase.auth.signUp does).
insert into auth.users (id, email, encrypted_password, raw_user_meta_data, aud, role)
values
  ('a1000000-0000-0000-0000-000000000001', 'nina@example.com', extensions.crypt('nina-secret', extensions.gen_salt('bf')),
   '{"display_name":"Nina","nickname":"  Nina_Walks "}', 'authenticated', 'authenticated'),
  ('a1000000-0000-0000-0000-000000000002', 'otto@example.com', extensions.crypt('otto-secret', extensions.gen_salt('bf')),
   '{"display_name":"Otto","nickname":"nina_walks"}', 'authenticated', 'authenticated'),
  ('a1000000-0000-0000-0000-000000000003', 'pia@example.com', extensions.crypt('pia-secret', extensions.gen_salt('bf')),
   '{"display_name":"Pia","nickname":"no spaces allowed"}', 'authenticated', 'authenticated');

select is((select nickname from public.profiles where id = 'a1000000-0000-0000-0000-000000000001'),
  'nina_walks', 'the sign-up nickname is stored trimmed and lowercased');
select is((select nickname from public.profiles where id = 'a1000000-0000-0000-0000-000000000002'),
  null, 'a taken nickname does not fail the sign-up: it is left empty (onboarding asks again)');
select is((select nickname from public.profiles where id = 'a1000000-0000-0000-0000-000000000003'),
  null, 'an invalid nickname is left empty');

select throws_ok(
  $$ update public.profiles set nickname = 'NINA_WALKS' where id = 'a1000000-0000-0000-0000-000000000002' $$,
  '23514', null, 'nicknames are stored lowercase (3–20 of a-z, 0-9, _)');
select throws_ok(
  $$ update public.profiles set nickname = 'nina_walks' where id = 'a1000000-0000-0000-0000-000000000002' $$,
  '23505', null, 'nicknames are unique');
select lives_ok(
  $$ update public.profiles set nickname = 'otto' where id = 'a1000000-0000-0000-0000-000000000002' $$,
  'a free, valid nickname can be set');

set local role anon;
select is(public.nickname_available('Nina_Walks'), false, 'a taken nickname is not available (any case)');
select is(public.nickname_available('new_one'), true, 'a free nickname is available');
select is(public.nickname_available('ab'), false, 'an invalid nickname is not available');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(public.nickname_available('nina_walks'), true,
  'your own nickname is available to you (saving the profile without changing it)');
reset role;
set local role anon;
select set_config('request.jwt.claims', '', true);

-- Sign-in: the email comes back only with the right password.
select is(public.login_email_for_nickname('NINA_walks', 'nina-secret'), 'nina@example.com',
  'nickname + right password gives the email to sign in with');
select is(public.login_email_for_nickname('nina_walks', 'wrong'), null, 'a wrong password gives nothing');
select is(public.login_email_for_nickname('nobody_here', 'nina-secret'), null,
  'an unknown nickname gives nothing (same answer as a wrong password)');

-- Throttle: 10 failures in 15 minutes lock the nickname, even for the right password.
select public.login_email_for_nickname('otto', 'wrong') from generate_series(1, 10);
select throws_ok($$ select public.login_email_for_nickname('otto', 'otto-secret') $$,
  'P0429', null, 'too many failed attempts lock the nickname for a while');
select is(public.login_email_for_nickname('nina_walks', 'nina-secret'), 'nina@example.com',
  'other nicknames are not affected');
reset role;
select is((select count(*)::int from public.nickname_login_failures where nickname = 'nina_walks'), 0,
  'a successful sign-in clears that nickname''s failures');

set local role anon;
select throws_ok($$ select * from public.nickname_login_failures $$, '42501', null,
  'nobody reads the failed attempts');
reset role;

-- The chat shows nicknames.
insert into public.countries (code, name_en, name_pt) values ('ZZ', 'Testland', 'Terra de Teste') on conflict do nothing;
insert into public.cities (slug, name_en, name_pt, country_code, wikidata_id, center, bbox)
values ('nickville', 'Nickville', 'Nicolândia', 'ZZ', 'Q999999971',
        extensions.st_setsrid(extensions.st_makepoint(0.5, 0.5), 4326)::extensions.geography, array[0, 0, 1, 1]);
insert into public.trips (id, user_id, city_slug, name, visibility)
values ('f9000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'nickville', 'Nina''s walk', 'public');
insert into public.walk_messages (trip_id, user_id, body)
values ('f9000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Hi all');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select m.author_nickname from public.list_walk_messages('f9000000-0000-0000-0000-000000000001') m),
  'nina_walks', 'list_walk_messages returns the author''s nickname');
select is((select m.is_own from public.list_walk_messages('f9000000-0000-0000-0000-000000000001') m),
  true, 'and still says which messages are the caller''s');

select * from finish();
rollback;

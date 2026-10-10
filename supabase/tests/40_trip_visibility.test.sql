-- Trip (walk list) visibility (D-031): private (owner only, the default), public (anyone with
-- the link, signed in or not) or password (anyone with the link and the password). Only the
-- owner changes it; passwords are stored hashed where no client can read them.
-- Run with `supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(35);

insert into public.countries (code, name_en, name_pt) values ('ZZ', 'Testland', 'Terra de Teste')
  on conflict do nothing;
insert into public.cities (slug, name_en, name_pt, country_code, wikidata_id, center, bbox)
values ('shareville', 'Shareville', 'Partilhândia', 'ZZ', 'Q999999961',
        extensions.st_setsrid(extensions.st_makepoint(0.5, 0.5), 4326)::extensions.geography, array[0, 0, 1, 1]);
insert into public.attractions (id, city_slug, wikidata_id, name_en, category, location, avg_visit_minutes)
values
  ('00000000-0000-0000-0000-0000000000d1', 'shareville', 'Q999999962', 'First', 'museum',
   extensions.st_setsrid(extensions.st_makepoint(0.2, 0.2), 4326)::extensions.geography, 60),
  ('00000000-0000-0000-0000-0000000000d2', 'shareville', 'Q999999963', 'Second', 'park',
   extensions.st_setsrid(extensions.st_makepoint(0.8, 0.8), 4326)::extensions.geography, 30);

insert into auth.users (id, email, raw_user_meta_data, aud, role)
values
  ('66666666-6666-6666-6666-666666666666', 'olga@example.com', '{"display_name":"Olga"}', 'authenticated', 'authenticated'),
  ('77777777-7777-7777-7777-777777777777', 'pete@example.com', '{"display_name":"Pete"}', 'authenticated', 'authenticated');

-- The trip id is fixed so later statements (and other roles) can refer to it.
insert into public.trips (id, user_id, city_slug, name)
values ('dddddddd-dddd-dddd-dddd-dddddddddddd', '66666666-6666-6666-6666-666666666666', 'shareville', 'Olga''s walk');
insert into public.trip_stops (trip_id, position, attraction_id)
values ('dddddddd-dddd-dddd-dddd-dddddddddddd', 0, '00000000-0000-0000-0000-0000000000d2'),
       ('dddddddd-dddd-dddd-dddd-dddddddddddd', 1, '00000000-0000-0000-0000-0000000000d1');

create temporary table trip_id as select 'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid as id;
grant select on trip_id to anon, authenticated;

-- 1. New trips are private.
select is((select visibility from public.trips where id = (select id from trip_id)), 'private',
  'a new trip is private');

set local role authenticated;

-- Olga (owner) ---------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}', true);

select is(public.shared_trip((select id from trip_id)) ->> 'status', 'ok',
  'the owner opens her private trip by link');
select is(public.shared_trip((select id from trip_id)) -> 'trip' ->> 'is_owner', 'true',
  'the owner is told the trip is hers');
select is(public.shared_trip((select id from trip_id)) -> 'trip' -> 'stop_ids',
  '["00000000-0000-0000-0000-0000000000d2", "00000000-0000-0000-0000-0000000000d1"]'::jsonb,
  'the stops come in trip order');

-- Pete (signed in, not the owner) ----------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated"}', true);

select is(public.shared_trip((select id from trip_id)), '{"status":"not_found"}'::jsonb,
  'a private trip is not found for anyone else');
select is(public.shared_trip('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'), '{"status":"not_found"}'::jsonb,
  'a missing trip is not found either (private trips are not revealed)');
select throws_ok($$ select public.set_trip_visibility((select id from trip_id), 'public') $$,
  'P0002', null, 'only the owner changes the visibility');
update public.trips set visibility = 'public' where id = (select id from trip_id);
select is(public.shared_trip((select id from trip_id)) ->> 'status', 'not_found',
  'nor can anyone else update the column directly');

-- Olga makes it public ------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}', true);
select lives_ok($$ select public.set_trip_visibility((select id from trip_id), 'public') $$,
  'the owner makes her trip public');
select throws_ok($$ select public.set_trip_visibility((select id from trip_id), 'friends') $$,
  '22023', null, 'an unknown visibility is rejected');

select set_config('request.jwt.claims', '{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated"}', true);
select is(public.shared_trip((select id from trip_id)) ->> 'status', 'ok',
  'a signed-in user opens a public trip');
select is(public.shared_trip((select id from trip_id)) -> 'trip' ->> 'is_owner', 'false',
  'and is told it is not theirs');
select is((select count(*)::int from public.trips where id = (select id from trip_id)), 0,
  'a public trip is still not listed in anyone else''s trips (table RLS is owner only)');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(public.shared_trip((select id from trip_id)) -> 'trip' ->> 'name', 'Olga''s walk',
  'a signed-out visitor opens a public trip');

-- Shared lists are read-only for everyone but the owner (visitors view, never edit). ---------
-- RLS makes other people's update/delete match no row; inserts are refused outright.
select throws_ok($$ update public.trips set name = 'Hacked' where id = (select id from trip_id) $$,
  '42501', null, 'a signed-out visitor cannot rename a public list');
select throws_ok($$ delete from public.trip_stops where trip_id = (select id from trip_id) $$,
  '42501', null, 'a signed-out visitor cannot remove its stops');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated"}', true);
insert into public.saved_trips (trip_id) values ((select id from trip_id));
update public.trips set name = 'Pete''s now', distance_m = 1 where id = (select id from trip_id);
update public.trip_stops set position = 5 where trip_id = (select id from trip_id);
delete from public.trip_stops where trip_id = (select id from trip_id);
delete from public.trips where id = (select id from trip_id);
select throws_ok($$ insert into public.trip_stops (trip_id, position, attraction_id)
                    values ((select id from trip_id), 2, '00000000-0000-0000-0000-0000000000d1') $$,
  '42501', null, 'a visitor who saved the list cannot add stops to it');
select throws_ok($$ select public.set_trip_visibility((select id from trip_id), 'private') $$,
  'P0002', null, 'nor change who can see it');
select is(public.shared_trip((select id from trip_id)) -> 'trip' ->> 'name', 'Olga''s walk',
  'renaming, reordering, removing stops and deleting all left the public list as it was');
select is(public.shared_trip((select id from trip_id)) -> 'trip' -> 'stop_ids',
  '["00000000-0000-0000-0000-0000000000d2", "00000000-0000-0000-0000-0000000000d1"]'::jsonb,
  'its stops are unchanged, in the owner''s order');

-- Olga protects it with a password ------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}', true);
select throws_ok($$ select public.set_trip_visibility((select id from trip_id), 'password') $$,
  '22023', null, 'a password is required the first time');
select throws_ok($$ select public.set_trip_visibility((select id from trip_id), 'password', 'abc') $$,
  '22023', null, 'a password under 4 characters is rejected');
select throws_ok(format($$ select public.set_trip_visibility((select id from trip_id), 'password', %L) $$, repeat('x', 73)),
  '22023', null, 'a password over 72 characters is rejected');
select lives_ok($$ select public.set_trip_visibility((select id from trip_id), 'password', 'lisbon24') $$,
  'the owner sets a password');
select is(public.shared_trip((select id from trip_id)) ->> 'status', 'ok',
  'the owner opens it without the password');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(public.shared_trip((select id from trip_id)), '{"status":"password_required"}'::jsonb,
  'a visitor without the password is asked for it');
select is(public.shared_trip((select id from trip_id), 'wrong'), '{"status":"wrong_password"}'::jsonb,
  'a wrong password is refused');
select is(public.shared_trip((select id from trip_id), 'lisbon24') ->> 'status', 'ok',
  'the right password opens it');

-- Knowing the password lets a visitor view the list, not edit it.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated"}', true);
update public.trips set name = 'Hacked' where id = (select id from trip_id);
delete from public.trips where id = (select id from trip_id);
select is(public.shared_trip((select id from trip_id), 'lisbon24') -> 'trip' ->> 'name', 'Olga''s walk',
  'a visitor with the password could neither rename nor delete the list');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select * from public.trip_passwords $$,
  '42501', null, 'visitors cannot read password hashes');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}', true);
select throws_ok($$ select * from public.trip_passwords $$,
  '42501', null, 'signed-in users (owners included) cannot read password hashes');

-- Keeping, changing and dropping the password ---------------------------------------------------
select lives_ok($$ select public.set_trip_visibility((select id from trip_id), 'password') $$,
  'saving "password" again without a new one keeps the current password');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(public.shared_trip((select id from trip_id), 'lisbon24') ->> 'status', 'ok',
  'the kept password still opens it');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}', true);
select public.set_trip_visibility((select id from trip_id), 'private');
select throws_ok($$ select public.set_trip_visibility((select id from trip_id), 'password') $$,
  '22023', null, 'leaving "password" drops the password: protecting it again needs a new one');
select public.set_trip_visibility((select id from trip_id), 'password', 'porto2026');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(public.shared_trip((select id from trip_id), 'lisbon24') ->> 'status', 'wrong_password',
  'the old password no longer opens it');

select * from finish();
rollback;

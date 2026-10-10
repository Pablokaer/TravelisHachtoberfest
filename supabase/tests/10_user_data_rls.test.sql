-- RLS for user-owned tables and the account RPCs. Run with `supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

-- Minimal reference rows (rolled back at the end).
insert into public.countries (code, name_en, name_pt) values ('ZZ', 'Testland', 'Terra de Teste'), ('ZY', 'Otherland', 'Outra Terra')
  on conflict do nothing;
insert into public.cities (slug, name_en, name_pt, country_code, wikidata_id, center, bbox)
values ('testville', 'Testville', 'Testelândia', 'ZZ', 'Q999999991',
        extensions.st_setsrid(extensions.st_makepoint(0.5, 0.5), 4326)::extensions.geography, array[0, 0, 1, 1]);
insert into public.attractions (id, city_slug, wikidata_id, name_en, category, location, avg_visit_minutes)
values
  ('00000000-0000-0000-0000-00000000000a', 'testville', 'Q999999992', 'A', 'museum',
   extensions.st_setsrid(extensions.st_makepoint(0.2, 0.2), 4326)::extensions.geography, 60),
  ('00000000-0000-0000-0000-00000000000b', 'testville', 'Q999999993', 'B', 'park',
   extensions.st_setsrid(extensions.st_makepoint(0.8, 0.8), 4326)::extensions.geography, 30);

-- 21 places in a city of their own: a 13-stop walk (over the former 12) and one over 20.
insert into public.cities (slug, name_en, name_pt, country_code, wikidata_id, center, bbox)
values ('longville', 'Longville', 'Longelândia', 'ZZ', 'Q999999994',
        extensions.st_setsrid(extensions.st_makepoint(10.5, 10.5), 4326)::extensions.geography, array[10, 10, 11, 11]);
insert into public.attractions (id, city_slug, wikidata_id, name_en, category, location, avg_visit_minutes)
select ('00000000-0000-0000-0000-0000000001' || lpad(i::text, 2, '0'))::uuid, 'longville',
       'Q99999980' || lpad(i::text, 2, '0'), 'Stop ' || i, 'park',
       extensions.st_setsrid(extensions.st_makepoint(10.1 + i / 100.0, 10.5), 4326)::extensions.geography, 20
  from generate_series(1, 21) as i;

-- Two users; the trigger creates their profiles.
insert into auth.users (id, email, raw_user_meta_data, aud, role)
values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.com', '{"display_name":"Alice","language":"pt"}', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.com', '{}', 'authenticated', 'authenticated');
-- Premium (D-047): this file tests other rules, not the Free plan's limits.
insert into public.subscriptions (user_id, plan_id, status)
values ('11111111-1111-1111-1111-111111111111', 'premium', 'active');

select is((select display_name from public.profiles where id = '11111111-1111-1111-1111-111111111111'), 'Alice',
  'profile is created from auth metadata');
select is((select language from public.profiles where id = '11111111-1111-1111-1111-111111111111'), 'pt',
  'profile language comes from metadata');

-- Act as Alice.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select is((select count(*)::int from public.profiles), 1, 'Alice only sees her own profile');
select lives_ok($$ update public.profiles set home_country = 'ZZ', onboarded_at = now()
                   where id = '11111111-1111-1111-1111-111111111111' $$, 'Alice updates her profile');
update public.profiles set display_name = 'Hacked' where id = '22222222-2222-2222-2222-222222222222';
select lives_ok($$ select public.set_nationalities(array['ZZ', 'ZY', 'ZZ']::char(2)[]) $$, 'set_nationalities works');
select is((select count(*)::int from public.profile_nationalities), 2, 'duplicates are collapsed');
select throws_ok($$ select public.set_nationalities(array[]::char(2)[]) $$, '22023', null,
  'at least one nationality is required');

select throws_ok($$ select public.save_trip('testville', 'Too short', array['00000000-0000-0000-0000-00000000000a']::uuid[]) $$,
  '22023', null, 'a trip needs at least two stops');
select lives_ok($$ select public.save_trip('testville', 'Morning walk',
                    array['00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b']::uuid[],
                    '2026-10-01', null, 1200, 900, 90) $$, 'Alice saves a trip');
select is((select count(*)::int from public.trip_stops), 2, 'stops are saved in order');
-- A trip holds up to 20 stops: 13 are saved, 21 are refused.
select lives_ok($$ select public.save_trip('longville', 'Long walk',
                    array(select ('00000000-0000-0000-0000-0000000001' || lpad(i::text, 2, '0'))::uuid
                            from generate_series(1, 13) as i)) $$,
  'a trip can have more than 12 stops');
select throws_ok($$ select public.save_trip('longville', 'Too long',
                    array(select ('00000000-0000-0000-0000-0000000001' || lpad(i::text, 2, '0'))::uuid
                            from generate_series(1, 21) as i)) $$,
  '22023', null, 'a trip cannot have more than 20 stops');
delete from public.trips where name = 'Long walk';
select is((select attraction_id from public.trip_stops where position = 0),
  '00000000-0000-0000-0000-00000000000a'::uuid, 'first stop keeps position 0');

-- Act as Bob.
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select is((select count(*)::int from public.trips), 0, 'Bob cannot see Alice''s trips');
select is((select count(*)::int from public.trip_stops), 0, 'Bob cannot see Alice''s stops');
select is((select count(*)::int from public.profile_nationalities), 0, 'Bob cannot see Alice''s nationalities');
delete from public.trips;
select throws_ok($$ insert into public.trips (user_id, city_slug, name)
                    values ('11111111-1111-1111-1111-111111111111', 'testville', 'forged') $$,
  '42501', null, 'Bob cannot create trips for Alice');

-- Anonymous visitors: reference data yes, user data no.
reset role;
set local role anon;
select is((select count(*)::int from public.attractions where city_slug = 'testville'), 2, 'anon can read attractions');
select is((select count(*)::int from public.attractions_in_view(0, 0, 1, 1)), 2, 'attractions_in_view finds both');
select throws_ok($$ select * from public.profiles $$, '42501', null, 'anon cannot read profiles');

-- Back as superuser: Bob's update did nothing, Alice's trip still exists.
reset role;
select is((select display_name from public.profiles where id = '22222222-2222-2222-2222-222222222222'), null,
  'Bob''s profile was not modified by Alice');

-- Account deletion cascades.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select public.delete_account();
reset role;
select is((select count(*)::int from public.trips where user_id = '11111111-1111-1111-1111-111111111111'), 0,
  'deleting the account removes trips');

select * from finish();
rollback;

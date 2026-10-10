-- Walk meetups (D-041): a walk list can have a date and time (`starts_at`); public lists with a
-- future time are listed soonest first, and other travellers say they are going. Run with
-- `supabase test db`. Queries filter on this file's city: the local DB may hold other rows.
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

insert into public.countries (code, name_en, name_pt) values ('ZZ', 'Testland', 'Terra de Teste')
  on conflict do nothing;
insert into public.cities (slug, name_en, name_pt, country_code, wikidata_id, center, bbox, timezone)
values ('meetville', 'Meetville', 'Encontrolândia', 'ZZ', 'Q999999941',
        extensions.st_setsrid(extensions.st_makepoint(0.5, 0.5), 4326)::extensions.geography,
        array[0, 0, 1, 1], 'Europe/Lisbon');
insert into public.attractions (id, city_slug, wikidata_id, name_en, category, location, avg_visit_minutes)
values
  ('00000000-0000-0000-0000-0000000000f1', 'meetville', 'Q999999942', 'Square', 'landmark',
   extensions.st_setsrid(extensions.st_makepoint(0.2, 0.2), 4326)::extensions.geography, 20),
  ('00000000-0000-0000-0000-0000000000f2', 'meetville', 'Q999999943', 'Garden', 'park',
   extensions.st_setsrid(extensions.st_makepoint(0.8, 0.8), 4326)::extensions.geography, 30);

insert into auth.users (id, email, raw_user_meta_data, aud, role)
values
  ('a4444444-4444-4444-4444-444444444444', 'ana.m@example.com', '{"display_name":"Ana"}', 'authenticated', 'authenticated'),
  ('b5555555-5555-5555-5555-555555555555', 'ben.m@example.com', '{"display_name":"Ben"}', 'authenticated', 'authenticated'),
  ('c6666666-6666-6666-6666-666666666666', 'cid.m@example.com', '{"display_name":"Cid"}', 'authenticated', 'authenticated');
-- Premium (D-047): this file tests other rules, not the Free plan's limits.
insert into public.subscriptions (user_id, plan_id, status)
values ('a4444444-4444-4444-4444-444444444444', 'premium', 'active');

-- Ana's lists: in two days, in one hour, an hour ago, a private one, one without a time.
insert into public.trips (id, user_id, city_slug, name, visibility, starts_at)
values
  ('e0000000-0000-0000-0000-000000000001', 'a4444444-4444-4444-4444-444444444444', 'meetville', 'Weekend walk', 'public', now() + interval '2 days'),
  ('e0000000-0000-0000-0000-000000000002', 'a4444444-4444-4444-4444-444444444444', 'meetville', 'Lunch walk', 'public', now() + interval '1 hour'),
  ('e0000000-0000-0000-0000-000000000003', 'a4444444-4444-4444-4444-444444444444', 'meetville', 'Morning walk', 'public', now() - interval '1 hour'),
  ('e0000000-0000-0000-0000-000000000004', 'a4444444-4444-4444-4444-444444444444', 'meetville', 'Private walk', 'private', now() + interval '3 hours'),
  ('e0000000-0000-0000-0000-000000000005', 'a4444444-4444-4444-4444-444444444444', 'meetville', 'Any time walk', 'public', null);
insert into public.trip_stops (trip_id, position, attraction_id)
values ('e0000000-0000-0000-0000-000000000001', 0, '00000000-0000-0000-0000-0000000000f1'),
       ('e0000000-0000-0000-0000-000000000001', 1, '00000000-0000-0000-0000-0000000000f2');

-- 1. The start is a moment; its day is the city's local day.
select has_column('public', 'trips', 'starts_at', 'trips have an optional start time');
insert into public.trips (id, user_id, city_slug, name, starts_at)
values ('e0000000-0000-0000-0000-000000000006', 'a4444444-4444-4444-4444-444444444444', 'meetville',
        'Late walk', '2026-10-10 23:30:00+00');
select is((select trip_date from public.trips where id = 'e0000000-0000-0000-0000-000000000006'),
  '2026-10-11'::date, 'trip_date follows the start in the city''s time zone (23:30 UTC = 00:30 in Lisbon)');

set local role authenticated;

-- Ben -------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"b5555555-5555-5555-5555-555555555555","role":"authenticated"}', true);

select results_eq(
  $$ select name from public.list_walklists(p_city_slug => 'meetville', p_upcoming => true, p_sort => 'soonest') $$,
  $$ values ('Lunch walk'::text), ('Weekend walk'::text) $$,
  'upcoming meetups: public lists with a future start, soonest first');
select results_eq(
  $$ select attendee_count, is_attending, starts_at > now()
       from public.list_walklists(p_city_slug => 'meetville', p_upcoming => true, p_sort => 'soonest', p_limit => 1) $$,
  $$ values (0, false, true) $$,
  'each meetup carries its start, the number going and whether the caller is');
select lives_ok($$ insert into public.walk_attendees (trip_id) values ('e0000000-0000-0000-0000-000000000001') $$,
  'Ben says he is going');
select throws_ok($$ insert into public.walk_attendees (trip_id) values ('e0000000-0000-0000-0000-000000000001') $$,
  '23505', null, 'once');
-- Any public list of someone else can be joined (D-044): it need not have a time, nor one to come.
select lives_ok($$ insert into public.walk_attendees (trip_id) values ('e0000000-0000-0000-0000-000000000003') $$,
  'a public list whose meetup has started can still be joined (its group chat stays open)');
select throws_ok($$ insert into public.walk_attendees (trip_id) values ('e0000000-0000-0000-0000-000000000004') $$,
  '42501', null, 'nobody joins a private list');
select lives_ok($$ insert into public.walk_attendees (trip_id) values ('e0000000-0000-0000-0000-000000000005') $$,
  'a public list without a time can be joined');
select results_eq(
  $$ select attendee_count, is_attending from public.list_walklists(p_city_slug => 'meetville', p_upcoming => true, p_sort => 'soonest')
      where name = 'Weekend walk' $$,
  $$ values (1, true) $$,
  'the meetup now counts Ben');
select is((public.shared_trip('e0000000-0000-0000-0000-000000000001') -> 'trip' ->> 'attendee_count')::int, 1,
  'the shared list shows how many are going');
select is((public.shared_trip('e0000000-0000-0000-0000-000000000001') -> 'trip' ->> 'is_attending')::boolean, true,
  'and that the caller is');
select ok((public.shared_trip('e0000000-0000-0000-0000-000000000001') -> 'trip' ->> 'starts_at') is not null,
  'and when it starts');
select throws_ok($$ select public.set_trip_schedule('e0000000-0000-0000-0000-000000000001', now() + interval '1 day') $$,
  'P0002', null, 'only the owner sets the time');
select throws_ok($$ select * from public.list_walklists(p_sort => 'latest') $$,
  '22023', null, 'an unknown sort is still rejected');

-- Cid: the count is public, the attendance rows are not. --------------------------------
select set_config('request.jwt.claims', '{"sub":"c6666666-6666-6666-6666-666666666666","role":"authenticated"}', true);
select is((select count(*)::int from public.walk_attendees), 0, 'Cid does not see who else is going');
select is((select attendee_count from public.list_walklists(p_city_slug => 'meetville', p_upcoming => true, p_sort => 'soonest')
            where name = 'Weekend walk'), 1, 'but sees how many');

-- Ana (owner) ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a4444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
select throws_ok($$ insert into public.walk_attendees (trip_id) values ('e0000000-0000-0000-0000-000000000001') $$,
  '42501', null, 'the organiser does not join her own meetup (she is going anyway)');
select throws_ok(
  $$ select public.save_trip('meetville', 'Past walk', array['00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2']::uuid[],
                             p_starts_at => now() - interval '1 minute') $$,
  '22023', null, 'a new list cannot start in the past');
select lives_ok(
  $$ select public.save_trip('meetville', 'Future walk', array['00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2']::uuid[],
                             p_starts_at => now() + interval '4 days') $$,
  'a new list is saved with its start');
select ok((select starts_at > now() from public.trips where name = 'Future walk'), 'with the start stored');
select throws_ok($$ select public.set_trip_schedule('e0000000-0000-0000-0000-000000000002', now() - interval '1 hour') $$,
  '22023', null, 'the owner cannot move a meetup into the past');
select lives_ok($$ select public.set_trip_schedule('e0000000-0000-0000-0000-000000000002', now() + interval '5 days') $$,
  'the owner moves a meetup');
select lives_ok($$ select public.set_trip_schedule('e0000000-0000-0000-0000-000000000002', null) $$,
  'and removes its time');
select is((select starts_at from public.trips where id = 'e0000000-0000-0000-0000-000000000002'), null,
  'a list without a time is no longer a meetup');

-- Ben changes his mind ----------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"b5555555-5555-5555-5555-555555555555","role":"authenticated"}', true);
delete from public.walk_attendees where trip_id = 'e0000000-0000-0000-0000-000000000001';
select is((select attendee_count from public.list_walklists(p_city_slug => 'meetville', p_upcoming => true, p_sort => 'soonest')
            where name = 'Weekend walk'), 0, 'Ben is no longer going');

-- Signed-out visitors ---------------------------------------------------------------------
reset role;
set local role anon;
select throws_ok($$ insert into public.walk_attendees (trip_id) values ('e0000000-0000-0000-0000-000000000001') $$,
  '42501', null, 'going needs an account');

select * from finish();
rollback;

-- Walk list cover photo (D-038): the photo of the list's starting point (stop 0), or of the next
-- stop that has one, with its author and licence; null when no stop has a photo. Returned by
-- `list_walklists` and, for the owner's own trips, by the `walklist_cover` computed column.
-- Run with `supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into public.countries (code, name_en, name_pt) values ('ZZ', 'Testland', 'Terra de Teste')
  on conflict do nothing;
insert into public.cities (slug, name_en, name_pt, country_code, wikidata_id, center, bbox)
values ('coverville', 'Coverville', 'Capalândia', 'ZZ', 'Q999999961',
        extensions.st_setsrid(extensions.st_makepoint(0.5, 0.5), 4326)::extensions.geography, array[0, 0, 1, 1]);
insert into public.attractions (id, city_slug, wikidata_id, name_en, category, location, avg_visit_minutes,
                                image_url, image_author, image_license)
values
  ('00000000-0000-0000-0000-0000000000c1', 'coverville', 'Q999999962', 'Bridge', 'landmark',
   extensions.st_setsrid(extensions.st_makepoint(0.2, 0.2), 4326)::extensions.geography, 20,
   'https://img.test/bridge.jpg', 'Ann Author', 'CC BY-SA 4.0'),
  ('00000000-0000-0000-0000-0000000000c2', 'coverville', 'Q999999963', 'Tower', 'landmark',
   extensions.st_setsrid(extensions.st_makepoint(0.4, 0.4), 4326)::extensions.geography, 20,
   'https://img.test/tower.jpg', 'Tom Taker', 'CC0'),
  ('00000000-0000-0000-0000-0000000000c3', 'coverville', 'Q999999964', 'Nameless square', 'landmark',
   extensions.st_setsrid(extensions.st_makepoint(0.6, 0.6), 4326)::extensions.geography, 20,
   null, null, null);

insert into auth.users (id, email, raw_user_meta_data, aud, role)
values ('a6666666-6666-6666-6666-666666666666', 'cora@example.com', '{"display_name":"Cora"}', 'authenticated', 'authenticated'),
       ('b7777777-7777-7777-7777-777777777777', 'dev@example.com', '{"display_name":"Dev"}', 'authenticated', 'authenticated');

-- Tower first (then Bridge); no-photo square first (then Bridge); only the no-photo square.
insert into public.trips (id, user_id, city_slug, name, visibility, created_at)
values
  ('f6000000-0000-0000-0000-000000000001', 'a6666666-6666-6666-6666-666666666666', 'coverville', 'Tower start', 'public', '2026-09-01'),
  ('f6000000-0000-0000-0000-000000000002', 'a6666666-6666-6666-6666-666666666666', 'coverville', 'Square start', 'public', '2026-09-02'),
  ('f6000000-0000-0000-0000-000000000003', 'a6666666-6666-6666-6666-666666666666', 'coverville', 'No photos', 'public', '2026-09-03');
insert into public.trip_stops (trip_id, position, attraction_id)
values ('f6000000-0000-0000-0000-000000000001', 0, '00000000-0000-0000-0000-0000000000c2'),
       ('f6000000-0000-0000-0000-000000000001', 1, '00000000-0000-0000-0000-0000000000c1'),
       ('f6000000-0000-0000-0000-000000000002', 0, '00000000-0000-0000-0000-0000000000c3'),
       ('f6000000-0000-0000-0000-000000000002', 1, '00000000-0000-0000-0000-0000000000c1'),
       ('f6000000-0000-0000-0000-000000000003', 0, '00000000-0000-0000-0000-0000000000c3');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b7777777-7777-7777-7777-777777777777","role":"authenticated"}', true);

select is(
  (select w.cover from public.list_walklists(p_city_slug => 'coverville') w where w.name = 'Tower start'),
  '{"url":"https://img.test/tower.jpg","author":"Tom Taker","license":"CC0"}'::jsonb,
  'a list''s cover is its starting point''s photo, with author and licence');
select is(
  (select w.cover ->> 'url' from public.list_walklists(p_city_slug => 'coverville') w where w.name = 'Square start'),
  'https://img.test/bridge.jpg',
  'a start without a photo falls back to the next stop that has one');
select is(
  (select w.cover from public.list_walklists(p_city_slug => 'coverville') w where w.name = 'No photos'),
  null,
  'a list without any photo has no cover');

-- The owner reads the same cover on their own trips (My Trips) as a computed column.
select set_config('request.jwt.claims', '{"sub":"a6666666-6666-6666-6666-666666666666","role":"authenticated"}', true);
select is(
  (select public.walklist_cover(t) ->> 'url' from public.trips t where t.id = 'f6000000-0000-0000-0000-000000000001'),
  'https://img.test/tower.jpg',
  'walklist_cover(trip) gives the owner the same cover');
select is(
  (select public.walklist_cover(t) ->> 'url' from public.trips t where t.id = 'f6000000-0000-0000-0000-000000000002'),
  'https://img.test/bridge.jpg',
  'walklist_cover(trip) falls back like list_walklists');

reset role;
set local role anon;
select throws_ok(
  $$ select public.walklist_cover(t) from public.trips t limit 1 $$,
  '42501', null, 'anon cannot call walklist_cover');

select * from finish();
rollback;

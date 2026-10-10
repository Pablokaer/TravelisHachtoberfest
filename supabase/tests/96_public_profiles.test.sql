-- Public traveller profiles (D-045): a review or chat message links to its author's public page —
-- name, photo, member since and public walk lists — through a public id that is not the account
-- id. Profiles stay owner-only; only these fields are shown, to signed-in users. Run with
-- `supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into public.countries (code, name_en, name_pt) values ('ZZ', 'Testland', 'Terra de Teste')
  on conflict do nothing;
insert into public.cities (slug, name_en, name_pt, country_code, wikidata_id, center, bbox, timezone)
values ('profileville', 'Profileville', 'Perfilândia', 'ZZ', 'Q999999911',
        extensions.st_setsrid(extensions.st_makepoint(0.5, 0.5), 4326)::extensions.geography,
        array[0, 0, 1, 1], 'Europe/Lisbon');

insert into auth.users (id, email, raw_user_meta_data, aud, role)
values
  ('a2000000-0000-0000-0000-00000000000a', 'ana.p@example.com', '{"display_name":"Ana"}', 'authenticated', 'authenticated'),
  ('b2000000-0000-0000-0000-00000000000b', 'ben.p@example.com', '{"display_name":"Ben"}', 'authenticated', 'authenticated');
update public.profiles set created_at = '2026-01-15 10:00+00', avatar_path = 'a2000000-0000-0000-0000-00000000000a/avatar-1.jpg'
 where id = 'a2000000-0000-0000-0000-00000000000a';

insert into public.trips (id, user_id, city_slug, name, visibility, created_at)
values
  ('f2000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-00000000000a', 'profileville', 'Ana public one', 'public', '2026-09-01'),
  ('f2000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-00000000000a', 'profileville', 'Ana public two', 'public', '2026-09-02'),
  ('f2000000-0000-0000-0000-000000000003', 'a2000000-0000-0000-0000-00000000000a', 'profileville', 'Ana private', 'private', '2026-09-03'),
  ('f2000000-0000-0000-0000-000000000004', 'a2000000-0000-0000-0000-00000000000a', 'profileville', 'Ana protected', 'password', '2026-09-04');
insert into public.reviews (city_slug, user_id, rating, comment)
values ('profileville', 'a2000000-0000-0000-0000-00000000000a', 5, 'Lovely town');
insert into public.walk_messages (trip_id, user_id, body)
values ('f2000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-00000000000a', 'Welcome!');
insert into public.walk_attendees (trip_id, user_id)
values ('f2000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-00000000000b');

create temporary table ana as
  select public_id from public.profiles where id = 'a2000000-0000-0000-0000-00000000000a';
grant select on ana to authenticated, anon;

select has_column('public', 'profiles', 'public_id', 'profiles have a public id');
select isnt((select public_id from ana), 'a2000000-0000-0000-0000-00000000000a'::uuid,
  'the public id is not the account id');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b2000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);

-- Reviews and chat messages carry their author's public id.
select is((select author_public_id from public.list_reviews(p_city_slug => 'profileville')), (select public_id from ana),
  'a review links to its author''s public profile');
select is((select author_public_id from public.list_walk_messages('f2000000-0000-0000-0000-000000000001')), (select public_id from ana),
  'a chat message links to its author''s public profile');
select is((select author_public_id from public.list_walklists(p_city_slug => 'profileville') limit 1), (select public_id from ana),
  'a walk list card links to its author too');

-- The public profile page.
select is(public.public_profile((select public_id from ana)) ->> 'status', 'ok', 'Ben opens Ana''s profile');
select is(public.public_profile((select public_id from ana)) -> 'profile' ->> 'name', 'Ana', 'with her name');
select is(public.public_profile((select public_id from ana)) -> 'profile' ->> 'avatar_path',
  'a2000000-0000-0000-0000-00000000000a/avatar-1.jpg', 'her photo');
select is((public.public_profile((select public_id from ana)) -> 'profile' ->> 'member_since')::timestamptz,
  '2026-01-15 10:00+00'::timestamptz, 'when her account was created');
select is((public.public_profile((select public_id from ana)) -> 'profile' ->> 'public_walklist_count')::int, 2,
  'and how many public walk lists she has (private and protected ones are not counted)');
select is((public.public_profile((select public_id from ana)) -> 'profile' ->> 'is_self')::boolean, false,
  'it is not Ben''s own');
select results_eq(
  $$ select name from public.list_walklists(p_author => (select public_id from ana), p_sort => 'newest') $$,
  $$ values ('Ana public two'::text), ('Ana public one'::text) $$,
  'her public walk lists, newest first — never the private or protected ones');
select is(public.public_profile('00000000-0000-0000-0000-000000000000'), '{"status":"not_found"}'::jsonb,
  'an unknown profile is not found');
select is((select count(*)::int from public.profiles where id = 'a2000000-0000-0000-0000-00000000000a'), 0,
  'the profiles table stays owner-only (no nationality, passport or email leaks)');

select set_config('request.jwt.claims', '{"sub":"a2000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select is((public.public_profile((select public_id from ana)) -> 'profile' ->> 'is_self')::boolean, true,
  'Ana''s own public profile says so');

reset role;
set local role anon;
select throws_ok($$ select public.public_profile((select public_id from ana)) $$,
  '42501', null, 'profiles need an account, like reviews and chats');

select * from finish();
rollback;

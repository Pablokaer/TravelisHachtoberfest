-- Walk chat re-reads (D-056): `list_walk_messages(p_after)` returns only the messages written
-- after a time, newest first and within the limit, so an open chat re-reads what is new instead
-- of its last 100 messages. Members only, as before. Run with `supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into public.countries (code, name_en, name_pt) values ('ZZ', 'Testland', 'Terra de Teste')
  on conflict do nothing;
insert into public.cities (slug, name_en, name_pt, country_code, wikidata_id, center, bbox)
values ('chatville', 'Chatville', 'Conversolândia', 'ZZ', 'Q999999970',
        extensions.st_setsrid(extensions.st_makepoint(0.5, 0.5), 4326)::extensions.geography, array[0, 0, 1, 1]);
insert into auth.users (id, email, raw_user_meta_data, aud, role)
values ('a9000000-0000-0000-0000-000000000001', 'org.after@example.com', '{"display_name":"Ola"}', 'authenticated', 'authenticated'),
       ('a9000000-0000-0000-0000-000000000002', 'going.after@example.com', '{"display_name":"Gil"}', 'authenticated', 'authenticated'),
       ('a9000000-0000-0000-0000-000000000003', 'other.after@example.com', '{"display_name":"Oto"}', 'authenticated', 'authenticated');
insert into public.trips (id, user_id, city_slug, name, visibility)
values ('d9000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000001', 'chatville', 'Chat walk', 'public');
insert into public.walk_attendees (trip_id, user_id)
values ('d9000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000002');
insert into public.walk_messages (trip_id, user_id, body, created_at)
select 'd9000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000001', 'Message ' || i,
       '2026-10-01 09:00+00'::timestamptz + (i || ' minutes')::interval
  from generate_series(0, 4) i;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a9000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select results_eq(
  $$select body from public.list_walk_messages('d9000000-0000-0000-0000-000000000001',
      p_after => '2026-10-01 09:02+00')$$,
  $$values ('Message 4'), ('Message 3')$$,
  'only the messages written after the time, newest first');
select results_eq(
  $$select body from public.list_walk_messages('d9000000-0000-0000-0000-000000000001',
      p_limit => 1, p_after => '2026-10-01 08:00+00')$$,
  $$values ('Message 4')$$,
  'within the limit: the newest of them');
select is(
  (select count(*)::int from public.list_walk_messages('d9000000-0000-0000-0000-000000000001')), 5,
  'without a time, the newest page as before');

select set_config('request.jwt.claims', '{"sub":"a9000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.list_walk_messages('d9000000-0000-0000-0000-000000000001',
     p_after => '2026-10-01 08:00+00')), 0,
  'someone not in the chat reads nothing');

select * from finish();
rollback;

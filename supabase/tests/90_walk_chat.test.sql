-- Walk list group chat (D-043): the organiser and everyone going to a public walk list share a
-- chat; nobody else reads or writes it. Run with `supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

insert into public.countries (code, name_en, name_pt) values ('ZZ', 'Testland', 'Terra de Teste')
  on conflict do nothing;
insert into public.cities (slug, name_en, name_pt, country_code, wikidata_id, center, bbox, timezone)
values ('chatville', 'Chatville', 'Conversalândia', 'ZZ', 'Q999999931',
        extensions.st_setsrid(extensions.st_makepoint(0.5, 0.5), 4326)::extensions.geography,
        array[0, 0, 1, 1], 'Europe/Lisbon');

insert into auth.users (id, email, raw_user_meta_data, aud, role)
values
  ('a7777777-7777-7777-7777-777777777777', 'ana.c@example.com', '{"display_name":"Ana"}', 'authenticated', 'authenticated'),
  ('b8888888-8888-8888-8888-888888888888', 'ben.c@example.com', '{"display_name":"Ben"}', 'authenticated', 'authenticated'),
  ('c9999999-9999-9999-9999-999999999999', 'cid.c@example.com', '{"display_name":"Cid"}', 'authenticated', 'authenticated');

insert into public.trips (id, user_id, city_slug, name, visibility, starts_at)
values
  ('d0000000-0000-0000-0000-000000000001', 'a7777777-7777-7777-7777-777777777777', 'chatville', 'Chat walk', 'public', now() + interval '1 day'),
  ('d0000000-0000-0000-0000-000000000002', 'a7777777-7777-7777-7777-777777777777', 'chatville', 'Hidden walk', 'private', now() + interval '1 day');
-- Ben was going to the hidden walk before it became private.
insert into public.walk_attendees (trip_id, user_id)
values ('d0000000-0000-0000-0000-000000000002', 'b8888888-8888-8888-8888-888888888888');
insert into public.walk_messages (trip_id, user_id, body)
values ('d0000000-0000-0000-0000-000000000002', 'a7777777-7777-7777-7777-777777777777', 'Secret plan');

select ok(exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and tablename = 'walk_messages'),
  'chat messages are published to Realtime (instant delivery)');

set local role authenticated;

-- Ben joins, then chats ----------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"b8888888-8888-8888-8888-888888888888","role":"authenticated"}', true);
select throws_ok($$ insert into public.walk_messages (trip_id, body) values ('d0000000-0000-0000-0000-000000000001', 'Hi!') $$,
  '42501', null, 'before going, Ben cannot write in the chat');
select is(public.is_walk_chat_member('d0000000-0000-0000-0000-000000000001'), false, 'nor is he a member');
insert into public.walk_attendees (trip_id) values ('d0000000-0000-0000-0000-000000000001');
select is(public.is_walk_chat_member('d0000000-0000-0000-0000-000000000001'), true, 'going makes him a member');
select lives_ok($$ insert into public.walk_messages (trip_id, body) values ('d0000000-0000-0000-0000-000000000001', '  See you at the square!  ') $$,
  'Ben writes in the chat');
select is((select body from public.walk_messages where user_id = 'b8888888-8888-8888-8888-888888888888'
             and trip_id = 'd0000000-0000-0000-0000-000000000001'),
  'See you at the square!', 'the message is stored trimmed');
select throws_ok($$ insert into public.walk_messages (trip_id, body) values ('d0000000-0000-0000-0000-000000000001', '   ') $$,
  '23514', null, 'an empty message is refused');
select throws_ok(format($$ insert into public.walk_messages (trip_id, body) values ('d0000000-0000-0000-0000-000000000001', %L) $$, repeat('x', 1001)),
  '23514', null, 'a message over 1000 characters is refused');
select throws_ok($$ insert into public.walk_messages (trip_id, user_id, body)
                    values ('d0000000-0000-0000-0000-000000000001', 'a7777777-7777-7777-7777-777777777777', 'I am Ana') $$,
  '42501', null, 'nobody writes as someone else');
select is((select count(*)::int from public.walk_messages where trip_id = 'd0000000-0000-0000-0000-000000000002'), 0,
  'a member of a list that became private no longer reads its chat');

-- Ana (organiser) ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a7777777-7777-7777-7777-777777777777","role":"authenticated"}', true);
select is(public.is_walk_chat_member('d0000000-0000-0000-0000-000000000001'), true, 'the organiser is a member');
select lives_ok($$ insert into public.walk_messages (trip_id, body) values ('d0000000-0000-0000-0000-000000000001', 'Great, 10:00 sharp') $$,
  'the organiser writes in the chat');
select results_eq(
  $$ select author_name, body, is_own from public.list_walk_messages('d0000000-0000-0000-0000-000000000001') order by body $$,
  $$ values ('Ana'::text, 'Great, 10:00 sharp'::text, true), ('Ben'::text, 'See you at the square!'::text, false) $$,
  'members read every message with its author''s public name');
select is((select count(*)::int from public.list_walk_messages('d0000000-0000-0000-0000-000000000002')), 1,
  'the organiser still reads the chat of her private list');

-- Cid (not going) ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"c9999999-9999-9999-9999-999999999999","role":"authenticated"}', true);
select is((select count(*)::int from public.walk_messages), 0, 'someone not going reads nothing');
select is((select count(*)::int from public.list_walk_messages('d0000000-0000-0000-0000-000000000001')), 0,
  'not even through the listing');
select throws_ok($$ insert into public.walk_messages (trip_id, body) values ('d0000000-0000-0000-0000-000000000001', 'Let me in') $$,
  '42501', null, 'nor writes');

-- Ben edits nothing, then leaves --------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"b8888888-8888-8888-8888-888888888888","role":"authenticated"}', true);
select throws_ok($$ update public.walk_messages set body = 'edited' where trip_id = 'd0000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'messages cannot be edited');
select throws_ok($$ delete from public.walk_messages where trip_id = 'd0000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'nor deleted');
delete from public.walk_attendees where trip_id = 'd0000000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.walk_messages where trip_id = 'd0000000-0000-0000-0000-000000000001'), 0,
  'after "Not going", Ben no longer reads the chat');

reset role;
set local role anon;
select throws_ok($$ select * from public.walk_messages $$, '42501', null, 'signed-out visitors have no chat');

select * from finish();
rollback;

-- Walk list participation and its group chat as one flow (D-044): "I'm going" on any public walk
-- list of someone else makes you a participant — once, however often it is asked — and every
-- participant and the organiser share that list's one chat. Run with `supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

insert into public.countries (code, name_en, name_pt) values ('ZZ', 'Testland', 'Terra de Teste')
  on conflict do nothing;
insert into public.cities (slug, name_en, name_pt, country_code, wikidata_id, center, bbox, timezone)
values ('joinville', 'Joinville', 'Juntolândia', 'ZZ', 'Q999999921',
        extensions.st_setsrid(extensions.st_makepoint(0.5, 0.5), 4326)::extensions.geography,
        array[0, 0, 1, 1], 'Europe/Lisbon');

insert into auth.users (id, email, raw_user_meta_data, aud, role)
values
  ('a1000000-0000-0000-0000-00000000000a', 'org.j@example.com', '{"display_name":"Ana"}', 'authenticated', 'authenticated'),
  ('b1000000-0000-0000-0000-00000000000b', 'ben.j@example.com', '{"display_name":"Ben"}', 'authenticated', 'authenticated'),
  ('c1000000-0000-0000-0000-00000000000c', 'cid.j@example.com', '{"display_name":"Cid"}', 'authenticated', 'authenticated'),
  ('d1000000-0000-0000-0000-00000000000d', 'dee.j@example.com', '{"display_name":"Dee"}', 'authenticated', 'authenticated'),
  ('e1000000-0000-0000-0000-00000000000e', 'eve.j@example.com', '{"display_name":"Eve"}', 'authenticated', 'authenticated');

-- Ana's public list has no date or time; Dee organises another list; Ana also has a private one.
insert into public.trips (id, user_id, city_slug, name, visibility)
values
  ('f1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'joinville', 'Old town', 'public'),
  ('f1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-00000000000d', 'joinville', 'Riverside', 'public'),
  ('f1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-00000000000a', 'joinville', 'Private', 'private');

create temporary table w (id uuid);
insert into w values ('f1000000-0000-0000-0000-000000000001');
grant select on w to authenticated, anon;

select col_is_pk('public', 'walk_attendees', array['trip_id', 'user_id'],
  'a user is a participant of a list at most once (primary key)');

set local role authenticated;

-- Ben joins, twice ------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"b1000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select is(public.set_walk_attendance((select id from w), true),
  '{"is_attending": true, "attendee_count": 1}'::jsonb,
  'Ben joins a public list without a time and is its first participant');
select is(public.set_walk_attendance((select id from w), true),
  '{"is_attending": true, "attendee_count": 1}'::jsonb,
  'asking again changes nothing (idempotent, no duplicate)');
select is((select count(*)::int from public.walk_attendees where trip_id = (select id from w)), 1,
  'one attendance row for Ben');
select is(public.is_walk_chat_member((select id from w)), true, 'the first participant is in the chat');
select lives_ok($$ insert into public.walk_messages (trip_id, body) values ((select id from w), 'Hello') $$,
  'Ben writes in the chat');

-- Cid joins -------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"c1000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
select is(public.set_walk_attendance((select id from w), true) ->> 'attendee_count', '2',
  'Cid is the second participant');
select is(public.is_walk_chat_member((select id from w)), true, 'the second participant is in the chat');
select results_eq($$ select body from public.list_walk_messages((select id from w)) $$, $$ values ('Hello'::text) $$,
  'and reads the messages written before he joined — the same chat');
select lives_ok($$ insert into public.walk_messages (trip_id, body) values ((select id from w), 'Hi') $$,
  'Cid replies');

-- Eve joins: a third participant, same chat -------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-0000-0000-00000000000e","role":"authenticated"}', true);
select is(public.is_walk_chat_member((select id from w)), false, 'before joining, Eve is not in the chat');
select is((select count(*)::int from public.list_walk_messages((select id from w))), 0, 'and reads nothing');
select throws_ok($$ insert into public.walk_messages (trip_id, body) values ((select id from w), 'Let me in') $$,
  '42501', null, 'nor writes');
select is(public.set_walk_attendance((select id from w), true) ->> 'attendee_count', '3',
  'Eve is the third participant');
select lives_ok($$ insert into public.walk_messages (trip_id, body) values ((select id from w), 'What time are we going?') $$,
  'Eve writes');

-- Ana (organiser) -------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select throws_ok($$ select public.set_walk_attendance('f1000000-0000-0000-0000-000000000001', true) $$,
  '42501', null, 'the organiser does not join her own list (she is in its chat anyway)');
select throws_ok($$ select public.set_walk_attendance('f1000000-0000-0000-0000-000000000003', true) $$,
  '42501', null, 'nor can anyone join a private list');
select results_eq(
  $$ select author_name, body from public.list_walk_messages((select id from w)) order by created_at, body $$,
  $$ values ('Ben'::text, 'Hello'::text), ('Cid'::text, 'Hi'::text), ('Eve'::text, 'What time are we going?'::text) $$,
  'the organiser reads the one conversation of all participants');
select results_eq(
  $$ select name, is_organiser from public.list_walk_participants((select id from w)) $$,
  $$ values ('Ana'::text, true), ('Ben'::text, false), ('Cid'::text, false), ('Eve'::text, false) $$,
  'the chat lists its people: the organiser first, then participants in the order they joined');

-- Dee organises another list: its chat is separate ---------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"d1000000-0000-0000-0000-00000000000d","role":"authenticated"}', true);
select lives_ok($$ insert into public.walk_messages (trip_id, body) values ('f1000000-0000-0000-0000-000000000002', 'Riverside only') $$,
  'Dee writes in her own list''s chat');
select is(public.is_walk_chat_member((select id from w)), false, 'the organiser of another list is not in this chat');
select is((select count(*)::int from public.list_walk_messages((select id from w))), 0,
  'and reads none of its messages');
select is((select count(*)::int from public.list_walk_participants((select id from w))), 0,
  'nor who is in it');

select set_config('request.jwt.claims', '{"sub":"b1000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select is((select count(*)::int from public.list_walk_messages('f1000000-0000-0000-0000-000000000002')), 0,
  'a participant of one list reads nothing of another list''s chat');
select ok(not exists (select 1 from public.list_walk_messages((select id from w)) where body = 'Riverside only'),
  'messages of one list never show in another list''s chat');
select throws_ok($$ select public.set_walk_attendance('f1000000-0000-0000-0000-0000000000ff', true) $$,
  '42501', null, 'a missing list cannot be joined');

-- Ben leaves --------------------------------------------------------------------------------------
select is(public.set_walk_attendance((select id from w), false),
  '{"is_attending": false, "attendee_count": 2}'::jsonb, 'Ben leaves');
select is(public.set_walk_attendance((select id from w), false) ->> 'attendee_count', '2',
  'leaving again changes nothing');
select is(public.is_walk_chat_member((select id from w)), false, 'and is no longer in the chat');
select is((select count(*)::int from public.list_walk_messages((select id from w))), 0, 'nor reads it');

-- The organiser makes the list private: participants lose the chat, the history stays. --------------
reset role;
update public.trips set visibility = 'private' where id = (select id from w);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
select is(public.is_walk_chat_member((select id from w)), false, 'a participant loses a chat that became private');
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select is((select count(*)::int from public.list_walk_messages((select id from w))), 3,
  'the organiser keeps the whole history');

-- Signed out --------------------------------------------------------------------------------------
reset role;
set local role anon;
select throws_ok($$ select public.set_walk_attendance((select id from w), true) $$,
  '42501', null, 'joining needs an account');
select throws_ok($$ select * from public.list_walk_participants((select id from w)) $$,
  '42501', null, 'so does seeing who is in a chat');

select * from finish();
rollback;

-- Who is in a walk chat, cheaply (D-061): `list_walk_participants` returns how many people are
-- in it and only the first few (the chat header shows a handful of names), and each join or leave
-- is announced on the list's private Realtime topic (`walk-people:<trip id>`) so open chats
-- re-read the people then instead of polling. Only the chat's members may hear that topic.
-- Run with `supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into public.countries (code, name_en, name_pt) values ('ZZ', 'Testland', 'Terra de Teste')
  on conflict do nothing;
insert into public.cities (slug, name_en, name_pt, country_code, wikidata_id, center, bbox, timezone)
values ('peopleville', 'Peopleville', 'Gentelândia', 'ZZ', 'Q999999995',
        extensions.st_setsrid(extensions.st_makepoint(0.5, 0.5), 4326)::extensions.geography,
        array[0, 0, 1, 1], 'Europe/Lisbon');
insert into auth.users (id, email, raw_user_meta_data, aud, role)
values
  ('a9900000-0000-0000-0000-00000000000a', 'ana.p@example.com', '{"display_name":"Ana"}', 'authenticated', 'authenticated'),
  ('b9900000-0000-0000-0000-00000000000b', 'ben.p@example.com', '{"display_name":"Ben"}', 'authenticated', 'authenticated'),
  ('c9900000-0000-0000-0000-00000000000c', 'cid.p@example.com', '{"display_name":"Cid"}', 'authenticated', 'authenticated'),
  ('d9900000-0000-0000-0000-00000000000d', 'dee.p@example.com', '{"display_name":"Dee"}', 'authenticated', 'authenticated'),
  ('e9900000-0000-0000-0000-00000000000e', 'eve.p@example.com', '{"display_name":"Eve"}', 'authenticated', 'authenticated');
insert into public.trips (id, user_id, city_slug, name, visibility)
values ('f9900000-0000-0000-0000-000000000001', 'a9900000-0000-0000-0000-00000000000a', 'peopleville', 'Old town', 'public');
-- Cid and Ben joined at the same moment (the name breaks the tie), Dee later.
insert into public.walk_attendees (trip_id, user_id, created_at)
values ('f9900000-0000-0000-0000-000000000001', 'c9900000-0000-0000-0000-00000000000c', '2026-09-01 10:00'),
       ('f9900000-0000-0000-0000-000000000001', 'b9900000-0000-0000-0000-00000000000b', '2026-09-01 10:00'),
       ('f9900000-0000-0000-0000-000000000001', 'd9900000-0000-0000-0000-00000000000d', '2026-09-02 10:00');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d9900000-0000-0000-0000-00000000000d","role":"authenticated"}', true);

-- 1–3. The count of everyone, and only the first few of them, in the same order as the full list.
select results_eq(
  $$ select name, is_organiser, is_self, participant_count
       from public.list_walk_participants('f9900000-0000-0000-0000-000000000001', p_limit => 2) $$,
  $$ values ('Ana'::text, true, false, 4), ('Ben'::text, false, false, 4) $$,
  'the first two people (a tie at the cut broken by name, as in the full list) and the count of all four');
select results_eq(
  $$ select name, is_self, participant_count from public.list_walk_participants('f9900000-0000-0000-0000-000000000001') $$,
  $$ values ('Ana'::text, false, 4), ('Ben'::text, false, 4), ('Cid'::text, false, 4), ('Dee'::text, true, 4) $$,
  'without a limit, apps built before still get everyone');
select is((select count(*)::int from public.list_walk_participants('f9900000-0000-0000-0000-000000000001', p_limit => 0)), 1,
  'at least one person is returned');
reset role;

-- Realtime announcements: a row in realtime.messages, which the Realtime service broadcasts.
-- (The service creates that table; the checks are skipped where it is not running.)
create temporary table realtime_ready as
  select to_regclass('realtime.messages') is not null
         and exists (select 1 from pg_inherits i join pg_class c on c.oid = i.inhrelid
                      where i.inhparent = to_regclass('realtime.messages')
                        and pg_get_expr(c.relpartbound, c.oid) like '%' || current_date::text || '%') as ok;
create temporary table walk_topic as select 'walk-people:f9900000-0000-0000-0000-000000000001'::text as topic;
grant select on realtime_ready, walk_topic to authenticated;

create function pg_temp.announcements() returns integer language plpgsql as $$
begin
  return (select count(*) from realtime.messages m, walk_topic w
           where m.topic = w.topic and m.event = 'changed' and m.private);
end $$;

-- 4–8. Joining and leaving are announced (one message each), with no personal data.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e9900000-0000-0000-0000-00000000000e","role":"authenticated"}', true);
select lives_ok($$ select public.set_walk_attendance('f9900000-0000-0000-0000-000000000001', true) $$, 'Eve joins');
reset role;
select case when (select ok from realtime_ready)
            then (select is(pg_temp.announcements(), 4, 'each join is announced on the list''s private topic (three above, then Eve''s)'))
            else skip('Realtime is not running here', 1) end;
set local role authenticated;
select lives_ok($$ select public.set_walk_attendance('f9900000-0000-0000-0000-000000000001', false) $$, 'Eve leaves');
reset role;
select case when (select ok from realtime_ready)
            then (select is(pg_temp.announcements(), 5, 'so is leaving'))
            else skip('Realtime is not running here', 1) end;
select case when (select ok from realtime_ready)
            then (select is((select m.payload - 'id' from realtime.messages m, walk_topic w where m.topic = w.topic limit 1),
                            '{}'::jsonb, 'the announcement carries no personal data'))
            else skip('Realtime is not running here', 1) end;

-- 9–11. Only the chat's members may receive the topic (Realtime checks the select policy on
-- realtime.messages with the topic set, as the subscriber).
create function pg_temp.can_hear(p_user text) returns boolean language plpgsql as $$
declare heard boolean;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('realtime.topic', (select topic from walk_topic), true);
  set local role authenticated;
  select exists (select 1 from realtime.messages m where m.extension = 'broadcast') into heard;
  reset role;
  return heard;
end $$;
select case when (select ok from realtime_ready)
            then (select ok(pg_temp.can_hear('d9900000-0000-0000-0000-00000000000d'), 'a participant hears who joins'))
            else skip('Realtime is not running here', 1) end;
select case when (select ok from realtime_ready)
            then (select ok(pg_temp.can_hear('a9900000-0000-0000-0000-00000000000a'), 'so does the organiser'))
            else skip('Realtime is not running here', 1) end;
select case when (select ok from realtime_ready)
            then (select ok(not pg_temp.can_hear('e9900000-0000-0000-0000-00000000000e'), 'someone who left hears nothing'))
            else skip('Realtime is not running here', 1) end;

select * from finish();
rollback;

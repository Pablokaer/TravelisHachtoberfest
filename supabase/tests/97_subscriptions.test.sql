-- Plans and subscriptions (D-047), with the plan limits lifted (D-065): every account creates as
-- many walk lists as it wants, with as many places as a walking route holds (ROUTE_MAX_STOPS,
-- D-030, checked by save_trip — not a plan rule), and deletes its own lists. The plans and
-- subscriptions model stays for when payments return: Free is the default (no subscription row),
-- Premium an active subscription. Run with `supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(33);
insert into public.countries (code, name_en, name_pt) values ('ZZ', 'Testland', 'Terra de Teste')
  on conflict do nothing;
insert into public.cities (slug, name_en, name_pt, country_code, wikidata_id, center, bbox)
values ('planville', 'Planville', 'Planolândia', 'ZZ', 'Q999999901',
        extensions.st_setsrid(extensions.st_makepoint(0.5, 0.5), 4326)::extensions.geography, array[0, 0, 1, 1]);
insert into public.attractions (id, city_slug, wikidata_id, name_en, category, location, avg_visit_minutes)
select ('00000000-0000-0000-0000-0000000001' || lpad(i::text, 2, '0'))::uuid, 'planville', 'Q9999990' || lpad(i::text, 2, '0'),
       'Place ' || i, 'museum', extensions.st_setsrid(extensions.st_makepoint(0.1 * (i % 9), 0.1), 4326)::extensions.geography, 30
  from generate_series(1, 8) i;

insert into auth.users (id, email, raw_user_meta_data, aud, role)
values
  ('a3000000-0000-0000-0000-00000000000a', 'free.s@example.com', '{"display_name":"Fran"}', 'authenticated', 'authenticated'),
  ('b3000000-0000-0000-0000-00000000000b', 'prem.s@example.com', '{"display_name":"Pia"}', 'authenticated', 'authenticated'),
  ('c3000000-0000-0000-0000-00000000000c', 'old.s@example.com', '{"display_name":"Olly"}', 'authenticated', 'authenticated');

-- Pia pays; Olly is an existing Free account that was over the old limits (7 lists, one of 6 places).
insert into public.subscriptions (user_id, plan_id, status, started_at, current_period_end)
values ('b3000000-0000-0000-0000-00000000000b', 'premium', 'active', now() - interval '3 days', now() + interval '27 days');
insert into public.trips (id, user_id, city_slug, name)
select ('f3000000-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid, 'c3000000-0000-0000-0000-00000000000c', 'planville', 'Old list ' || i
  from generate_series(1, 7) i;
insert into public.trip_stops (trip_id, position, attraction_id)
select 'f3000000-0000-0000-0000-000000000001', i - 1, ('00000000-0000-0000-0000-0000000001' || lpad(i::text, 2, '0'))::uuid
  from generate_series(1, 6) i;

create temporary table ids as
  select array_agg(('00000000-0000-0000-0000-0000000001' || lpad(i::text, 2, '0'))::uuid order by i) as places
    from generate_series(1, 8) i;
grant select on ids to authenticated;

-- 1. The plans are data, one of them the default. Free no longer has limits (D-065).
select results_eq(
  $$ select id, price_cents, currency::text, billing_interval, max_lists, max_items_per_list, can_delete_lists
       from public.plans order by sort_order $$,
  $$ values ('free'::text, 0, 'EUR'::text, null::text, null::int, null::int, true),
            ('premium'::text, 500, 'EUR'::text, 'month'::text, null::int, null::int, true) $$,
  'Free (€0) and Premium (€5/month): both unlimited, both delete their lists');
select is((select id from public.plans where is_default), 'free', 'Free is the default plan');
select hasnt_trigger('public', 'trips', 'trips_plan_list_limit', 'no walk list limit on trips');
select hasnt_trigger('public', 'trip_stops', 'trip_stops_plan_item_limit', 'no places limit on trip stops');

set local role authenticated;

-- Fran (Free, no subscription row) -------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a3000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select is(public.my_subscription() -> 'plan' ->> 'id', 'free', 'a user without a subscription is Free');
select is(public.my_subscription() ->> 'status', 'free', 'with no subscription status');
select is(public.my_subscription() -> 'plan' ->> 'max_lists', null, 'and no list limit');
select lives_ok(
  $$ select public.save_trip('planville', 'Six places', (select places[1:6] from ids)) $$,
  'Free saves a list of 6 places');
select lives_ok($$ select public.save_trip('planville', 'List 2', (select places[1:2] from ids)) $$, 'second list');
select lives_ok($$ select public.save_trip('planville', 'List 3', (select places[1:2] from ids)) $$, 'third list');
select lives_ok($$ select public.save_trip('planville', 'List 4', (select places[1:2] from ids)) $$, 'fourth list');
select lives_ok($$ select public.save_trip('planville', 'List 5', (select places[1:2] from ids)) $$, 'fifth list');
select lives_ok($$ select public.save_trip('planville', 'List 6', (select places[1:2] from ids)) $$,
  'Free creates a sixth list');
select lives_ok(
  $$ insert into public.trips (city_slug, name) values ('planville', 'Direct seventh') $$,
  'and a seventh with a direct insert');
select lives_ok(
  $$ insert into public.trip_stops (trip_id, position, attraction_id)
       select id, 2, (select places[7] from ids) from public.trips where name = 'List 2' $$,
  'adds a place to a list directly');
select lives_ok(
  $$ select public.delete_trip((select id from public.trips where name = 'List 2')) $$,
  'Free deletes her own list');
delete from public.trips where name = 'List 3';
select is((select count(*)::int from public.trips), 5, 'and a direct delete of her own list works too');
select is((public.my_subscription() ->> 'list_count')::int, 5, 'the subscription shows how many lists she has');
select throws_ok($$ select public.delete_trip('f3000000-0000-0000-0000-000000000002') $$,
  'P0002', null, 'but she cannot delete a list of someone else');

-- Pia (Premium) -------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"b3000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select is(public.my_subscription() -> 'plan' ->> 'id', 'premium', 'an active subscription is Premium');
select is(public.my_subscription() ->> 'status', 'active', 'with its status');
select ok((public.my_subscription() ->> 'valid_until')::timestamptz > now(), 'and the date it is valid until');
select lives_ok($$ select public.save_trip('planville', 'Eight places', (select places from ids)) $$,
  'Premium saves a list of 8 places');
select lives_ok(
  $$ select public.save_trip('planville', 'Pia ' || i, (select places[1:2] from ids)) from generate_series(1, 6) i $$,
  'Premium creates more than 5 lists');
select is((select count(*)::int from public.trips), 7, 'Pia has 7 lists');
select lives_ok($$ select public.delete_trip((select id from public.trips where name = 'Pia 1')) $$,
  'Premium deletes her own list');
select throws_ok($$ select public.delete_trip('f3000000-0000-0000-0000-000000000002') $$,
  'P0002', null, 'but not a list of someone else');
select is((select count(*)::int from public.subscriptions), 1, 'Premium reads her own subscription, and only hers');
select throws_ok(
  $$ insert into public.subscriptions (user_id, plan_id, status) values ('b3000000-0000-0000-0000-00000000000b', 'premium', 'active') $$,
  '42501', null, 'nobody grants themselves a plan: subscriptions are written by the payment side only');

-- Olly (Free, over the old limits) -----------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"c3000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
select is((select count(*)::int from public.trips), 7, 'an old account keeps its 7 lists');
select lives_ok($$ select public.save_trip('planville', 'Eighth', (select places[1:2] from ids)) $$,
  'and creates another');

-- Deleting a Free account still deletes its lists.
select set_config('request.jwt.claims', '{"sub":"a3000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select lives_ok($$ select public.delete_account() $$, 'a Free user can still delete their account');
reset role;
select is((select count(*)::int from public.trips where user_id = 'a3000000-0000-0000-0000-00000000000a'), 0,
  'and their lists go with it');

select * from finish();
rollback;

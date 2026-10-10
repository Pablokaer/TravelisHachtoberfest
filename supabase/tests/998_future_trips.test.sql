-- Future trips (D-081): a traveller's saved destinations are private, one row per city, and the
-- reason is limited. Run with `supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into public.countries (code, name_en, name_pt) values ('ZZ', 'Testland', 'Terra de Teste')
  on conflict do nothing;
insert into public.cities (slug, name_en, name_pt, country_code, wikidata_id, center, bbox, is_active)
values ('futureville', 'Futureville', 'Vila Futura', 'ZZ', 'Q999999971',
        extensions.st_setsrid(extensions.st_makepoint(14.5, 14.5), 4326)::extensions.geography,
        array[14, 14, 15, 15], true);
insert into auth.users (id, aud, role, email)
values ('00000000-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'ann@example.test'),
       ('00000000-0000-0000-0000-0000000000c2', 'authenticated', 'authenticated', 'bob@example.test');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';

select lives_ok(
  $$ insert into public.future_trips (user_id, city_slug, reason, planned_for)
       values ('00000000-0000-0000-0000-0000000000c1', 'futureville', 'Sunny in December', '2026-12-10') $$,
  'a traveller saves a destination for themselves'
);
select throws_ok(
  $$ insert into public.future_trips (user_id, city_slug)
       values ('00000000-0000-0000-0000-0000000000c1', 'futureville') $$,
  '23505', null, 'a city is saved once per traveller'
);
select throws_ok(
  $$ insert into public.future_trips (user_id, city_slug)
       values ('00000000-0000-0000-0000-0000000000c2', 'futureville') $$,
  '42501', null, 'a traveller cannot save a destination for someone else'
);
select throws_ok(
  $$ update public.future_trips set reason = repeat('x', 301) $$,
  '23514', null, 'the reason is at most 300 characters'
);

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}';
select is_empty(
  $$ select 1 from public.future_trips $$,
  'another traveller sees none of them'
);
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
select is(
  (select count(*)::int from public.future_trips), 1, 'the owner sees their destination'
);

set local role anon;
select throws_ok(
  $$ select * from public.future_trips $$,
  '42501', null, 'signed-out visitors cannot read the table'
);

select * from finish();
rollback;

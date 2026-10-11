-- Visited attractions (D-085): a traveller's marks are private, one row per attraction, added
-- and removed but never edited. Run with `supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into public.countries (code, name_en, name_pt) values ('ZZ', 'Testland', 'Terra de Teste')
  on conflict do nothing;
insert into public.cities (slug, name_en, name_pt, country_code, wikidata_id, center, bbox, is_active)
values ('seenville', 'Seenville', 'Vila Vista', 'ZZ', 'Q999999981',
        extensions.st_setsrid(extensions.st_makepoint(16.5, 16.5), 4326)::extensions.geography,
        array[16, 16, 17, 17], true);
insert into public.attractions (id, city_slug, wikidata_id, name_en, category, location,
                                avg_visit_minutes)
values ('00000000-0000-0000-0000-0000000000d1', 'seenville', 'Q999999982', 'Old Museum', 'museum',
        extensions.st_setsrid(extensions.st_makepoint(16.5, 16.5), 4326)::extensions.geography, 40);
insert into auth.users (id, aud, role, email)
values ('00000000-0000-0000-0000-0000000000e1', 'authenticated', 'authenticated', 'ann@example.test'),
       ('00000000-0000-0000-0000-0000000000e2', 'authenticated', 'authenticated', 'bob@example.test');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';

select lives_ok(
  $$ insert into public.visited_attractions (user_id, attraction_id)
       values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d1') $$,
  'a traveller marks an attraction as visited'
);
select throws_ok(
  $$ insert into public.visited_attractions (user_id, attraction_id)
       values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d1') $$,
  '23505', null, 'an attraction is marked once per traveller'
);
select throws_ok(
  $$ insert into public.visited_attractions (user_id, attraction_id)
       values ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000d1') $$,
  '42501', null, 'a traveller cannot mark an attraction for someone else'
);
select lives_ok(
  $$ insert into public.visited_attractions (user_id, attraction_id)
       values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d1')
       on conflict (user_id, attraction_id) do nothing $$,
  'marking a place again is a no-op, which is how the app sends it (no update grant needed)'
);
select throws_ok(
  $$ update public.visited_attractions set visited_at = now() $$,
  '42501', null, 'a mark is never edited'
);

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}';
select is((select count(*)::int from public.visited_attractions), 0,
          'another traveller does not see the marks');
delete from public.visited_attractions;

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';
select is((select count(*)::int from public.visited_attractions), 1,
          'another traveller could not remove the mark');
delete from public.visited_attractions;
select is((select count(*)::int from public.visited_attractions), 0,
          'the owner removes their mark');

set local role anon;
select throws_ok($$ select * from public.visited_attractions $$, '42501', null,
                 'anonymous visitors cannot read marks');

select * from finish();
rollback;

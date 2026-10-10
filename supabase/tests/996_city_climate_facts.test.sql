-- City climate and facts (D-081): written by the pipeline seed, readable by everyone, within
-- their ranges, gone with their city, and summed per city by `city_profiles`. Run with
-- `supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into public.countries (code, name_en, name_pt) values ('ZZ', 'Testland', 'Terra de Teste')
  on conflict do nothing;
insert into public.cities (slug, name_en, name_pt, country_code, wikidata_id, center, bbox, is_active)
values ('climateville', 'Climateville', 'Vila Clima', 'ZZ', 'Q999999971',
        extensions.st_setsrid(extensions.st_makepoint(12.5, 12.5), 4326)::extensions.geography,
        array[12, 12, 13, 13], true);
insert into public.attractions (city_slug, wikidata_id, name_en, category, location,
                                avg_visit_minutes, is_unesco)
values ('climateville', 'Q999999972', 'Old Castle', 'castle',
        extensions.st_setsrid(extensions.st_makepoint(12.5, 12.5), 4326)::extensions.geography, 60, true),
       ('climateville', 'Q999999973', 'Big Museum', 'museum',
        extensions.st_setsrid(extensions.st_makepoint(12.51, 12.5), 4326)::extensions.geography, 90, false),
       ('climateville', 'Q999999974', 'Small Museum', 'museum',
        extensions.st_setsrid(extensions.st_makepoint(12.52, 12.5), 4326)::extensions.geography, 30, false);
insert into public.city_climate (city_slug, month, temp_mean_c, temp_max_c, precip_mm, snowfall_cm,
                                 sunshine_hours)
values ('climateville', 12, 15.1, 18.0, 95.5, 0, 5.2);
insert into public.city_facts (city_slug, population, inception_year, beach_count)
values ('climateville', 545000, -1200, 12);

set local role anon;
select results_eq(
  $$ select temp_mean_c, precip_mm, sunshine_hours from public.city_climate
      where city_slug = 'climateville' and month = 12 $$,
  $$ values (15.1::numeric, 95.5::numeric, 5.2::numeric) $$,
  'everyone reads a city''s climate'
);
select results_eq(
  $$ select population, inception_year, beach_count from public.city_facts
      where city_slug = 'climateville' $$,
  $$ values (545000, -1200, 12) $$,
  'everyone reads a city''s facts; a founding year before the common era is negative'
);
select results_eq(
  $$ select attraction_count, unesco_count, castle_count, museum_count, church_count
       from public.city_profiles where city_slug = 'climateville' $$,
  $$ values (3, 1, 1, 2, 0) $$,
  'the profile adds up the city''s attractions by category'
);
select throws_ok(
  $$ insert into public.city_facts (city_slug, beach_count) values ('climateville', 1) $$,
  '42501', null, 'clients cannot write facts'
);
select throws_ok(
  $$ insert into public.city_climate values ('climateville', 1, 1, 1, 1, 1, 1) $$,
  '42501', null, 'clients cannot write climate'
);
reset role;

select throws_ok(
  $$ insert into public.city_climate values ('climateville', 13, 1, 1, 1, 1, 1) $$,
  '23514', null, 'a month is 1 to 12'
);
select throws_ok(
  $$ insert into public.city_climate values ('climateville', 12, 1, 1, 1, 1, 1) $$,
  '23505', null, 'a city has one row per month'
);
select is(
  (select attraction_count from public.city_profiles where city_slug = 'routeless-city'), null,
  'a city that does not exist has no profile'
);
delete from public.cities where slug = 'climateville';
select is(
  (select count(*)::integer from public.city_climate where city_slug = 'climateville')
  + (select count(*)::integer from public.city_facts where city_slug = 'climateville'), 0,
  'climate and facts go with their city'
);

select * from finish();
rollback;

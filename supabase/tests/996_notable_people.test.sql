-- Notable people (D-071): each city's historical figures, writers, musicians and artists, written
-- by the pipeline seed, readable by everyone, only in the known categories. Run with
-- `supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into public.countries (code, name_en, name_pt) values ('ZZ', 'Testland', 'Terra de Teste')
  on conflict do nothing;
insert into public.cities (slug, name_en, name_pt, country_code, wikidata_id, center, bbox, is_active)
values ('poetville', 'Poetville', 'Vila Poeta', 'ZZ', 'Q999999951',
        extensions.st_setsrid(extensions.st_makepoint(10.5, 10.5), 4326)::extensions.geography,
        array[10, 10, 11, 11], true);
insert into public.notable_people (city_slug, wikidata_id, name_en, categories, birth_year,
                                   death_year, born_here, died_here, sitelinks)
values ('poetville', 'Q999999952', 'Ana Poet', array['writer'], 1888, 1935, true, true, 90),
       ('poetville', 'Q999999953', 'Rui King', array['history'], 1469, 1521, true, false, 60);

set local role anon;
select results_eq(
  $$ select name_en, categories from public.notable_people where city_slug = 'poetville'
       order by sitelinks desc $$,
  $$ values ('Ana Poet'::text, array['writer']::text[]), ('Rui King'::text, array['history']::text[]) $$,
  'everyone reads a city''s notable people'
);
select throws_ok(
  $$ insert into public.notable_people (city_slug, wikidata_id, name_en, categories)
       values ('poetville', 'Q999999954', 'Intruder', array['writer']) $$,
  '42501', null, 'clients cannot write them'
);
reset role;

select throws_ok(
  $$ insert into public.notable_people (city_slug, wikidata_id, name_en, categories)
       values ('poetville', 'Q999999955', 'Ball Player', array['sport']) $$,
  '23514', null, 'categories are limited to history, writer, music and art'
);
select throws_ok(
  $$ insert into public.notable_people (city_slug, wikidata_id, name_en, categories)
       values ('poetville', 'Q999999956', 'Nobody', '{}') $$,
  '23514', null, 'a person has at least one category'
);
delete from public.cities where slug = 'poetville';
select is((select count(*)::integer from public.notable_people where city_slug = 'poetville'), 0,
  'people go with their city');

select * from finish();
rollback;

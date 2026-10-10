-- Wikipedia texts (D-070): cities carry a History excerpt and attractions the introduction and
-- History excerpt of their article, readable by everyone through attraction_details and cities.
-- Run with `supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

insert into public.countries (code, name_en, name_pt) values ('ZZ', 'Testland', 'Terra de Teste')
  on conflict do nothing;
insert into public.cities (slug, name_en, name_pt, country_code, wikidata_id, center, bbox,
                           is_active, history_en, history_pt)
values ('oldtown', 'Oldtown', 'Cidade Velha', 'ZZ', 'Q999999941',
        extensions.st_setsrid(extensions.st_makepoint(10.5, 10.5), 4326)::extensions.geography,
        array[10, 10, 11, 11], true, 'Founded in 1147.', 'Fundada em 1147.');
insert into public.attractions (city_slug, wikidata_id, name_en, category, location, popularity,
                                avg_visit_minutes, summary_en, summary_pt, history_en, history_pt)
values ('oldtown', 'Q999999942', 'Old Cathedral', 'church',
        extensions.st_setsrid(extensions.st_makepoint(10.2, 10.2), 4326)::extensions.geography,
        90, 30, 'The oldest church in town.', 'A igreja mais antiga.', 'Built on a mosque.',
        'Construída sobre uma mesquita.');

set local role anon;

select results_eq(
  $$ select summary_en, summary_pt, history_en, history_pt
       from public.attraction_details where wikidata_id = 'Q999999942' $$,
  $$ values ('The oldest church in town.'::text, 'A igreja mais antiga.'::text,
             'Built on a mosque.'::text, 'Construída sobre uma mesquita.'::text) $$,
  'attraction_details exposes the attraction texts to everyone'
);
select results_eq(
  $$ select history_en, history_pt from public.cities where slug = 'oldtown' $$,
  $$ values ('Founded in 1147.'::text, 'Fundada em 1147.'::text) $$,
  'cities expose the History excerpt to everyone'
);
select is(
  (select count(*)::integer from public.attraction_details where wikidata_id = 'Q999999942'),
  1, 'the view still returns one row per attraction'
);

select * from finish();
rollback;

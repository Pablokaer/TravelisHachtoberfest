-- Suggested routes (D-077): themed walks per city, written by the pipeline seed, readable by
-- everyone, with at most one stop per place and a title within the column limit. Run with
-- `supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into public.countries (code, name_en, name_pt) values ('ZZ', 'Testland', 'Terra de Teste')
  on conflict do nothing;
insert into public.cities (slug, name_en, name_pt, country_code, wikidata_id, center, bbox, is_active)
values ('routeville', 'Routeville', 'Vila Rota', 'ZZ', 'Q999999961',
        extensions.st_setsrid(extensions.st_makepoint(12.5, 12.5), 4326)::extensions.geography,
        array[12, 12, 13, 13], true);
insert into public.attractions (id, city_slug, wikidata_id, name_en, category, location,
                                avg_visit_minutes)
values ('00000000-0000-0000-0000-0000000000b1', 'routeville', 'Q999999962', 'Old Gate', 'monument',
        extensions.st_setsrid(extensions.st_makepoint(12.5, 12.5), 4326)::extensions.geography, 20),
       ('00000000-0000-0000-0000-0000000000b2', 'routeville', 'Q999999963', 'Hill Church', 'church',
        extensions.st_setsrid(extensions.st_makepoint(12.51, 12.5), 4326)::extensions.geography, 30);
insert into public.suggested_routes (id, city_slug, slug, theme, title_en, title_pt, distance_m,
                                     walking_seconds, visit_minutes, generated_by)
values ('00000000-0000-0000-0000-0000000000a1', 'routeville', 'old-town', 'highlights', 'Old town',
        'Cidade velha', 1400, 1120, 50, 'rules');
insert into public.suggested_route_stops (route_id, position, attraction_id)
values ('00000000-0000-0000-0000-0000000000a1', 0, '00000000-0000-0000-0000-0000000000b1'),
       ('00000000-0000-0000-0000-0000000000a1', 1, '00000000-0000-0000-0000-0000000000b2');

set local role anon;
select results_eq(
  $$ select a.name_en from public.suggested_route_stops s
       join public.attractions a on a.id = s.attraction_id
      where s.route_id = '00000000-0000-0000-0000-0000000000a1' order by s.position $$,
  $$ values ('Old Gate'::text), ('Hill Church'::text) $$,
  'everyone reads a route with its stops in walking order'
);
select throws_ok(
  $$ insert into public.suggested_routes (id, city_slug, slug, theme, title_en, title_pt,
                                          distance_m, walking_seconds, visit_minutes, generated_by)
       values (gen_random_uuid(), 'routeville', 'intruder', 'x', 'Intruder', 'Intruso', 1, 1, 1, 'x') $$,
  '42501', null, 'clients cannot write routes'
);
reset role;

select throws_ok(
  $$ insert into public.suggested_routes (id, city_slug, slug, theme, title_en, title_pt,
                                          distance_m, walking_seconds, visit_minutes, generated_by)
       values (gen_random_uuid(), 'routeville', 'long-title', 'x', repeat('x', 81), 'Longo',
               1, 1, 1, 'rules') $$,
  '23514', null, 'a title is at most 80 characters'
);
select throws_ok(
  $$ insert into public.suggested_route_stops (route_id, position, attraction_id)
       values ('00000000-0000-0000-0000-0000000000a1', 2,
               '00000000-0000-0000-0000-0000000000b1') $$,
  '23505', null, 'a place appears once in a route'
);
delete from public.cities where slug = 'routeville';
select is((select count(*)::integer from public.suggested_routes where city_slug = 'routeville'), 0,
  'routes go with their city');
select is((select count(*)::integer from public.suggested_route_stops
            where route_id = '00000000-0000-0000-0000-0000000000a1'), 0,
  'and so do their stops');

select * from finish();
rollback;

-- city_list feeds the Home city cards (D-026). Run with `supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into public.countries (code, name_en, name_pt) values ('ZZ', 'Testland', 'Terra de Teste')
  on conflict do nothing;
insert into public.cities (slug, name_en, name_pt, country_code, wikidata_id, center, bbox, is_active)
values
  ('photoville', 'Photoville', 'Fotolândia', 'ZZ', 'Q999999981',
   extensions.st_setsrid(extensions.st_makepoint(0.5, 0.5), 4326)::extensions.geography, array[0, 0, 1, 1], true),
  ('blankville', 'Blankville', 'Brancolândia', 'ZZ', 'Q999999982',
   extensions.st_setsrid(extensions.st_makepoint(2.5, 2.5), 4326)::extensions.geography, array[2, 2, 3, 3], true),
  ('hiddenville', 'Hiddenville', 'Escondida', 'ZZ', 'Q999999983',
   extensions.st_setsrid(extensions.st_makepoint(4.5, 4.5), 4326)::extensions.geography, array[4, 4, 5, 5], false);
insert into public.attractions (city_slug, wikidata_id, name_en, category, location, popularity,
                                image_url, image_author, image_license, avg_visit_minutes)
values
  -- The most popular place has no photo, so the cover is the next one that has.
  ('photoville', 'Q999999984', 'Famous', 'museum',
   extensions.st_setsrid(extensions.st_makepoint(0.2, 0.2), 4326)::extensions.geography, 90, null, null, null, 30),
  ('photoville', 'Q999999985', 'Pictured', 'park',
   extensions.st_setsrid(extensions.st_makepoint(0.3, 0.3), 4326)::extensions.geography, 80,
   'https://upload.wikimedia.org/pictured.jpg', 'Ana', 'CC BY-SA 4.0', 30),
  ('photoville', 'Q999999986', 'Minor', 'park',
   extensions.st_setsrid(extensions.st_makepoint(0.4, 0.4), 4326)::extensions.geography, 10,
   'https://upload.wikimedia.org/minor.jpg', 'Rui', 'CC0', 30),
  ('blankville', 'Q999999987', 'Unpictured', 'park',
   extensions.st_setsrid(extensions.st_makepoint(2.4, 2.4), 4326)::extensions.geography, 50, null, null, null, 30);

set local role authenticated;

select results_eq(
  $$ select country_name_en, country_name_pt, attraction_count from public.city_list where slug = 'photoville' $$,
  $$ values ('Testland'::text, 'Terra de Teste'::text, 3) $$,
  'city_list carries the country names and the number of places'
);
select results_eq(
  $$ select cover_image_url, cover_image_author, cover_image_license from public.city_list where slug = 'photoville' $$,
  $$ values ('https://upload.wikimedia.org/pictured.jpg'::text, 'Ana'::text, 'CC BY-SA 4.0'::text) $$,
  'the cover is the most popular photographed place, with its credit'
);
select is((select cover_image_url from public.city_list where slug = 'blankville'), null,
  'a city without photographed places has no cover');
select is((select count(*)::int from public.city_list where slug = 'blankville'), 1,
  'a city without a cover is still listed');
select is((select count(*)::int from public.city_list where slug = 'hiddenville'), 0,
  'inactive cities are not listed');
select is((select count(*)::int from public.city_list where slug in ('photoville', 'blankville')), 2,
  'each city appears once');

select * from finish();
rollback;

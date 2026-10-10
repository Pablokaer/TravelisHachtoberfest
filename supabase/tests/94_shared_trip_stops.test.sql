-- Shared walk lists in one call (D-057): `shared_trip` also returns its stops' places, in walking
-- order, with the columns a stop card shows, so the shared page needs no second request. Run with
-- `supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

insert into public.countries (code, name_en, name_pt) values ('ZZ', 'Testland', 'Terra de Teste')
  on conflict do nothing;
insert into public.cities (slug, name_en, name_pt, country_code, wikidata_id, center, bbox)
values ('shareville', 'Shareville', 'Partilhândia', 'ZZ', 'Q999999980',
        extensions.st_setsrid(extensions.st_makepoint(0.5, 0.5), 4326)::extensions.geography, array[0, 0, 1, 1]);
insert into public.attractions (id, city_slug, wikidata_id, name_en, name_pt, category, location, avg_visit_minutes, popularity, is_unesco)
values ('00000000-0000-0000-0000-000000000801', 'shareville', 'Q999999981', 'First Stop', 'Primeira', 'museum',
        extensions.st_setsrid(extensions.st_makepoint(0.2, 0.3), 4326)::extensions.geography, 45, 80, true),
       ('00000000-0000-0000-0000-000000000802', 'shareville', 'Q999999982', 'Second Stop', null, 'park',
        extensions.st_setsrid(extensions.st_makepoint(0.4, 0.5), 4326)::extensions.geography, 30, 20, false);
insert into auth.users (id, email, raw_user_meta_data, aud, role)
values ('a8000000-0000-0000-0000-000000000001', 'share.stops@example.com', '{"display_name":"Sam"}', 'authenticated', 'authenticated');
insert into public.trips (id, user_id, city_slug, name, visibility)
values ('d8000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000001', 'shareville', 'Shared walk', 'public'),
       ('d8000000-0000-0000-0000-000000000002', 'a8000000-0000-0000-0000-000000000001', 'shareville', 'Kept walk', 'private');
insert into public.trip_stops (trip_id, position, attraction_id)
values ('d8000000-0000-0000-0000-000000000001', 0, '00000000-0000-0000-0000-000000000802'),
       ('d8000000-0000-0000-0000-000000000001', 1, '00000000-0000-0000-0000-000000000801');

set local role anon;

select is(
  (select array_agg(s ->> 'id' order by n)
     from jsonb_array_elements(public.shared_trip('d8000000-0000-0000-0000-000000000001') -> 'trip' -> 'stops')
          with ordinality as stop(s, n)),
  array['00000000-0000-0000-0000-000000000802', '00000000-0000-0000-0000-000000000801'],
  'the stops come in walking order');
select is(
  public.shared_trip('d8000000-0000-0000-0000-000000000001') -> 'trip' -> 'stops' -> 1,
  jsonb_build_object('id', '00000000-0000-0000-0000-000000000801', 'city_slug', 'shareville',
                     'name_en', 'First Stop', 'name_pt', 'Primeira', 'category', 'museum',
                     'lat', 0.3, 'lng', 0.2, 'popularity', 80, 'avg_visit_minutes', 45,
                     'image_url', null, 'is_unesco', true),
  'each stop carries what its card shows');
select is(public.shared_trip('d8000000-0000-0000-0000-000000000002') ->> 'status', 'not_found',
  'a private list still reveals nothing, stops included');

select * from finish();
rollback;

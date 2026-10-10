-- Nature category (D-068): beaches, waterfalls, national parks, mountains… get their own value of
-- public.attraction_category, listed right after 'park', and the map RPC filters on it like any
-- other category. Run with `supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select ok('nature' = any (enum_range(null::public.attraction_category)::text[]),
  'nature is an attraction category');
select is(
  (enum_range(null::public.attraction_category)::text[])[array_position(
    enum_range(null::public.attraction_category)::text[], 'park') + 1],
  'nature', 'nature comes right after park (the order the app lists its tabs in)');

insert into public.countries (code, name_en, name_pt) values ('ZZ', 'Testland', 'Terra de Teste')
  on conflict do nothing;
insert into public.cities (slug, name_en, name_pt, country_code, wikidata_id, center, bbox, is_active)
values ('beachville', 'Beachville', 'Praialândia', 'ZZ', 'Q999999931',
        extensions.st_setsrid(extensions.st_makepoint(10.5, 10.5), 4326)::extensions.geography,
        array[10, 10, 11, 11], true);
insert into public.attractions (city_slug, wikidata_id, name_en, category, location, popularity,
                                avg_visit_minutes)
values
  ('beachville', 'Q999999932', 'Golden Beach', 'nature',
   extensions.st_setsrid(extensions.st_makepoint(10.2, 10.2), 4326)::extensions.geography, 90, 90),
  ('beachville', 'Q999999933', 'Town Garden', 'park',
   extensions.st_setsrid(extensions.st_makepoint(10.3, 10.3), 4326)::extensions.geography, 80, 45);

set local role anon;

select results_eq(
  $$ select name_en, category::text
       from public.attractions_in_view(10, 10, 11, 11, array['nature']::public.attraction_category[]) $$,
  $$ values ('Golden Beach'::text, 'nature'::text) $$,
  'the map RPC returns nature places when filtering on nature'
);
select results_eq(
  $$ select name_en from public.attractions_in_view(10, 10, 11, 11) $$,
  $$ values ('Golden Beach'::text), ('Town Garden'::text) $$,
  'and alongside the other categories without a filter'
);

select * from finish();
rollback;

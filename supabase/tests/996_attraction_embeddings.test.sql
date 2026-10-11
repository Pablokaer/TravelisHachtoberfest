-- Attraction embeddings and hybrid search (D-084): readable by everyone, writable by nobody
-- through the API, and the search fuses the vector and keyword rankings. Run with
-- `supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into public.countries (code, name_en, name_pt) values ('ZZ', 'Testland', 'Terra de Teste')
  on conflict do nothing;
insert into public.cities (slug, name_en, name_pt, country_code, wikidata_id, center, bbox, is_active)
values ('vecville', 'Vecville', 'Vila Vec', 'ZZ', 'Q999999971',
        extensions.st_setsrid(extensions.st_makepoint(14.5, 14.5), 4326)::extensions.geography,
        array[14, 14, 15, 15], true);
insert into public.attractions (id, city_slug, wikidata_id, name_en, description_en, category,
                                location, avg_visit_minutes)
values ('00000000-0000-0000-0000-0000000000c1', 'vecville', 'Q999999972', 'Quiet Garden',
        'a calm garden with a view', 'park',
        extensions.st_setsrid(extensions.st_makepoint(14.5, 14.5), 4326)::extensions.geography, 30),
       ('00000000-0000-0000-0000-0000000000c2', 'vecville', 'Q999999973', 'Noisy Market',
        'a busy market', 'landmark',
        extensions.st_setsrid(extensions.st_makepoint(14.51, 14.5), 4326)::extensions.geography, 30);
insert into public.attraction_embeddings (attraction_id, model, embedding)
values ('00000000-0000-0000-0000-0000000000c1', 'test',
        (select array_agg(case when i = 1 then 1.0 else 0.0 end)::extensions.vector(768)
           from generate_series(1, 768) i)),
       ('00000000-0000-0000-0000-0000000000c2', 'test',
        (select array_agg(case when i = 2 then 1.0 else 0.0 end)::extensions.vector(768)
           from generate_series(1, 768) i));

set local role anon;
select is((select count(*)::int from public.attraction_embeddings
            where attraction_id in ('00000000-0000-0000-0000-0000000000c1',
                                    '00000000-0000-0000-0000-0000000000c2')),
          2, 'anonymous visitors can read the embeddings');
select throws_ok(
  $$ insert into public.attraction_embeddings (attraction_id, model, embedding)
     values ('00000000-0000-0000-0000-0000000000c1', 'x',
             (select array_agg(0.0)::extensions.vector(768) from generate_series(1, 768))) $$,
  null, null, 'the API cannot write embeddings');
select is((select name_en from public.search_attractions_hybrid(
              'zzz-no-keyword-match',
              (select array_agg(case when i = 1 then 1.0 else 0.0 end)::extensions.vector(768)
                 from generate_series(1, 768) i), 'vecville', 5) limit 1),
          'Quiet Garden', 'the nearest vector wins when no word matches');
select is((select keyword_pos from public.search_attractions_hybrid(
              'market',
              (select array_agg(case when i = 1 then 1.0 else 0.0 end)::extensions.vector(768)
                 from generate_series(1, 768) i), 'vecville', 5)
            where name_en = 'Noisy Market'),
          1, 'a keyword match is ranked by the full-text side');
select is((select count(*)::int from public.search_attractions_hybrid(
              'garden',
              (select array_agg(0.0)::extensions.vector(768) from generate_series(1, 768)),
              'nowhere', 5)),
          0, 'the city filter restricts both rankings');

select * from finish();
rollback;

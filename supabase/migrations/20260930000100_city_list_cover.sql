-- Home page (D-026): city_list also carries the country name and a cover photo, so the city
-- cards need no extra queries. The cover is the most popular attraction of the city that has a
-- (freely licensed) Commons image; its author and licence travel with it, because every image
-- must be shown with its credit (docs/DATA_SOURCES.md). New columns are appended, so existing
-- readers of the view are unaffected.
create or replace view public.city_list
with (security_invoker = true)
as
select c.slug, c.name_en, c.name_pt, c.country_code, c.wikidata_id,
       extensions.st_y(c.center::extensions.geometry) as lat,
       extensions.st_x(c.center::extensions.geometry) as lng,
       c.bbox, c.timezone,
       (select count(*) from public.attractions a where a.city_slug = c.slug)::integer
         as attraction_count,
       co.name_en as country_name_en,
       co.name_pt as country_name_pt,
       cover.image_url as cover_image_url,
       cover.image_author as cover_image_author,
       cover.image_license as cover_image_license
  from public.cities c
  join public.countries co on co.code = c.country_code
  left join lateral (
    select a.image_url, a.image_author, a.image_license
      from public.attractions a
     where a.city_slug = c.slug and a.image_url is not null
     order by a.popularity desc, a.name_en
     limit 1
  ) cover on true;

grant select on public.city_list to anon, authenticated;

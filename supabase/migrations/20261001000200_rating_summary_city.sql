-- City pages show each place's average rating on its card (D-028). The summary gains the
-- attraction's city, appended so existing readers are unaffected, and grouped by it so a
-- `city_slug` filter is pushed down to the attractions of that city.
create or replace view public.attraction_rating_summary
with (security_invoker = true)
as
select a.id as attraction_id,
       count(r.id)::integer as review_count,
       round(avg(r.rating), 2) as rating_avg,
       a.city_slug
  from public.attractions a
  left join public.attraction_reviews r on r.attraction_id = a.id
 group by a.id, a.city_slug;

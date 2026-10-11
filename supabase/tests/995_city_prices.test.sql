-- City price estimates (D-088): readable by everyone, written by nobody through the API, positive
-- amounts, one row per city, gone with the city. Run with `supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into public.countries (code, name_en, name_pt) values ('ZZ', 'Testland', 'Terra de Teste')
  on conflict do nothing;
insert into public.cities (slug, name_en, name_pt, country_code, wikidata_id, center, bbox, is_active)
values ('priceville', 'Priceville', 'Vila Preco', 'ZZ', 'Q999999991',
        extensions.st_setsrid(extensions.st_makepoint(18.5, 18.5), 4326)::extensions.geography,
        array[18, 18, 19, 19], true);
insert into public.city_prices (city_slug, price_level, big_mac_is_real, beer, soft_drink, cocktail,
                                coffee, meal_cheap, meal_mid, local_dish, big_mac, transport_ticket,
                                taxi_5km, retrieved_on)
values ('priceville', 0.65, true, 4.06, 1.74, 8.5, 2.9, 9.85, 22.02, 14.3, 6.32, 1.6, 9.27,
        '2026-10-11');

set local role anon;
select is((select beer from public.city_prices where city_slug = 'priceville'), 4.06,
          'anonymous visitors read the estimates');
select throws_ok(
  $$ insert into public.city_prices (city_slug, price_level, beer, soft_drink, cocktail, coffee,
       meal_cheap, meal_mid, local_dish, big_mac, transport_ticket, taxi_5km, retrieved_on)
     values ('priceville', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, '2026-10-11') $$,
  '42501', null, 'clients cannot write estimates');
select throws_ok($$ update public.city_prices set beer = 0.01 $$, '42501', null,
                 'clients cannot change them');
reset role;

select throws_ok($$ update public.city_prices set beer = 0 $$, '23514', null,
                 'an amount is positive');
select throws_ok($$ update public.city_prices set price_level = 0 $$, '23514', null,
                 'a price level is positive');
select throws_ok(
  $$ insert into public.city_prices (city_slug, price_level, beer, soft_drink, cocktail, coffee,
       meal_cheap, meal_mid, local_dish, big_mac, transport_ticket, taxi_5km, retrieved_on)
     values ('priceville', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, '2026-10-11') $$,
  '23505', null, 'a city has one row');
delete from public.cities where slug = 'priceville';
select is((select count(*)::int from public.city_prices where city_slug = 'priceville'), 0,
          'the estimates go with the city');

select * from finish();
rollback;

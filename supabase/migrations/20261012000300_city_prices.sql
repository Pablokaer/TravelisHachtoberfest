-- Estimated everyday prices of a city (D-088): what a beer, a meal, a Big Mac, a transport ticket
-- and a ride cost, in euros. MODELLED, not measured: a reference basket scaled by the country's
-- price level (World Bank), with McDonald's from The Economist's Big Mac index (`big_mac_is_real`).
-- Reference data like climate and facts: written only by the pipeline seed (`90_city_prices.sql`),
-- readable by everyone, gone with its city.
create table public.city_prices (
  city_slug        text primary key references public.cities (slug) on delete cascade,
  currency         text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  -- How expensive the country is against the United States (1.00): 0.65 is 35 % cheaper.
  price_level      numeric(5, 3) not null check (price_level > 0),
  -- True when the Big Mac price is the index's own for the country; false when it is modelled.
  big_mac_is_real  boolean not null default false,
  beer             numeric(8, 2) not null check (beer > 0),             -- 0.5 L, bar or restaurant
  soft_drink       numeric(8, 2) not null check (soft_drink > 0),       -- 0.33 L Coca-Cola, restaurant
  cocktail         numeric(8, 2) not null check (cocktail > 0),
  coffee           numeric(8, 2) not null check (coffee > 0),           -- cappuccino
  meal_cheap       numeric(8, 2) not null check (meal_cheap > 0),       -- inexpensive restaurant, one person
  meal_mid         numeric(8, 2) not null check (meal_mid > 0),         -- 3 courses, mid-range, one person
  local_dish       numeric(8, 2) not null check (local_dish > 0),       -- a typical dish, ordinary restaurant
  big_mac          numeric(8, 2) not null check (big_mac > 0),
  transport_ticket numeric(8, 2) not null check (transport_ticket > 0), -- one-way, local public transport
  taxi_5km         numeric(8, 2) not null check (taxi_5km > 0),         -- taxi or ride-hailing, about 5 km
  retrieved_on     date not null
);

comment on table public.city_prices is
  'Estimated everyday prices per city in euros (D-088): a reference basket scaled by the country price level (World Bank), Big Mac from The Economist index. Modelled, not measured. Written by the data pipeline.';

alter table public.city_prices enable row level security;

create policy "city prices are readable by everyone" on public.city_prices
  for select to anon, authenticated using (true);

-- Supabase grants new public tables to the API roles by default: keep only reading.
revoke all on public.city_prices from anon, authenticated;
grant select on public.city_prices to anon, authenticated;

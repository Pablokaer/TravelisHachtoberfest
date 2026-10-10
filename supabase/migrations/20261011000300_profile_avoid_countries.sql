-- Countries a traveller never wants proposed as a destination (D-082): chosen in the trip planner
-- and kept in the profile so the next plan starts with them. A list of ISO country codes on the
-- profile row, which only its owner can read or change (the existing profile policies).
alter table public.profiles
  add column avoid_countries char(2)[] not null default '{}'
    check (cardinality(avoid_countries) <= 40);

comment on column public.profiles.avoid_countries is
  'ISO 3166-1 alpha-2 codes of countries the trip planner must not propose (D-082).';

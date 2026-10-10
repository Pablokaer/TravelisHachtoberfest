-- Notable people (D-071): a city page card with the best known historical figures, writers,
-- musicians and artists born or died in the city, from Wikidata (CC0) with Commons photos and
-- their credits. Reference data like attractions: written only by the pipeline seed
-- (`50_people.sql`), readable by everyone, gone with its city.
create table public.notable_people (
  city_slug         text not null references public.cities (slug) on delete cascade,
  wikidata_id       text not null check (wikidata_id ~ '^Q[0-9]+$'),
  name_en           text not null,
  name_pt           text,
  description_en    text,
  description_pt    text,
  -- Every category the person's occupations reach (a president who wrote books is both).
  categories        text[] not null
                      check (cardinality(categories) > 0
                             and categories <@ array['history', 'writer', 'music', 'art']),
  birth_year        integer, -- negative before the common era
  death_year        integer,
  born_here         boolean not null default false,
  died_here         boolean not null default false,
  image_url         text,
  image_author      text,
  image_license     text,
  image_license_url text,
  image_page_url    text,
  wikipedia_en      text,
  wikipedia_pt      text,
  sitelinks         integer not null default 0, -- Wikipedia editions with an article: fame
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  primary key (city_slug, wikidata_id)
);

comment on table public.notable_people is
  'Best known people born or died in a city, by category (D-071). Written by the data pipeline.';

-- The city page reads one city's people, best known first.
create index notable_people_city_fame_idx on public.notable_people (city_slug, sitelinks desc);

alter table public.notable_people enable row level security;
create policy "notable people are readable by everyone" on public.notable_people
  for select to anon, authenticated using (true);
grant select on public.notable_people to anon, authenticated;

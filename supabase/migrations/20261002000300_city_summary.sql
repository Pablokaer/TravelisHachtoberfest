-- City pages (D-036): each city carries the lead of its Wikipedia article (EN and PT) and the
-- article titles, for the "About" section and its CC BY-SA attribution link. Filled by the data
-- pipeline (`city-summaries`); null when a language has no article. Readable through the
-- existing "active cities are readable by everyone" policy.
alter table public.cities
  add column summary_en text,
  add column summary_pt text,
  add column wikipedia_en text,
  add column wikipedia_pt text;

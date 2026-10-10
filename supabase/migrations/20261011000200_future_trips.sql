-- Future trips (D-081): the destinations a traveller picked from the "Plan your next trip"
-- proposals, kept to come back to. Each row is one city for one user, with the reason the
-- planner gave and when the traveller wants to go. Private: only its owner reads or changes it
-- (an anonymous local-mode account counts as a user, D-078).
create table public.future_trips (
  user_id     uuid not null references auth.users (id) on delete cascade,
  city_slug   text not null references public.cities (slug) on delete cascade,
  -- Why the planner proposed the city, in the language the traveller used; shown on the card.
  reason      text check (reason is null or char_length(reason) <= 300),
  -- When the traveller wants to go: the day picked in the planner, if any.
  planned_for date,
  created_at  timestamptz not null default now(),
  primary key (user_id, city_slug)
);

comment on table public.future_trips is
  'Cities a traveller saved from the trip planner (D-081). Owner-only.';

create index future_trips_city_idx on public.future_trips (city_slug);

alter table public.future_trips enable row level security;

create policy "own future trips: select" on public.future_trips
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own future trips: insert" on public.future_trips
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own future trips: update" on public.future_trips
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own future trips: delete" on public.future_trips
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Supabase grants new public tables to anon by default; this one is for signed-in users only.
revoke all on public.future_trips from anon;
grant select, insert, update, delete on public.future_trips to authenticated;
